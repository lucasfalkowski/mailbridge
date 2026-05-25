import { sleep } from '../utils/sleep.js';
import { resendRateLimiter } from '../utils/rateLimiter.js';

function getAddressDomain(address = '') {
  return String(address).split('@')[1]?.toLowerCase() || 'unknown';
}

export async function sendWithRetry(payload, env, idempotencyKey) {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is required');
  }

  const maxAttempts = 2;
  let lastErrText = '';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res;
    try {
      await resendRateLimiter.waitForSlot();
      
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      const isFinalAttempt = attempt >= maxAttempts - 1;

      if (isFinalAttempt) {
        console.error('resend.network_failed', {
          attempt: attempt + 1,
          maxAttempts,
          recipientDomain: getAddressDomain(payload.to),
          message: e.message,
        });
        throw e;
      }

      const jitter = Math.floor(Math.random() * 200);
      const waitMs = 500 * Math.pow(2, attempt) + jitter;

      console.warn('resend.network_retry', {
        attempt: attempt + 1,
        maxAttempts,
        waitMs,
        recipientDomain: getAddressDomain(payload.to),
        message: e.message,
      });

      await sleep(waitMs);
      continue;
    }

    if (res.ok) {
      return;
    }

    const errText = await res.text().catch(() => '');
    lastErrText = errText;

    const shouldRetry = res.status === 429 || (res.status >= 500 && res.status <= 599);

    if (!shouldRetry || attempt >= maxAttempts - 1) {
      console.error('resend.failed', {
        status: res.status,
        attempt: attempt + 1,
        maxAttempts,
        recipientDomain: getAddressDomain(payload.to),
        responseBody: errText.slice(0, 500),
      });
      throw new Error(`Resend ${res.status}: ${errText}`);
    }

    const retryAfter = res.headers.get('retry-after');
    let waitMs = 1000;
    if (retryAfter) {
      const n = Number(retryAfter);
      if (!Number.isNaN(n)) {
        waitMs = Math.max(0, n * 1000);
      } else {
        const d = new Date(retryAfter);
        if (!Number.isNaN(d.getTime())) {
          waitMs = Math.max(0, d.getTime() - Date.now());
        }
      }
    }
    const backoff = waitMs * Math.pow(2, attempt);
    const jitter = Math.floor(Math.random() * 200);
    const retryWaitMs = Math.min(5000, Math.max(500, backoff)) + jitter;

    console.warn('resend.retry', {
      status: res.status,
      attempt: attempt + 1,
      maxAttempts,
      waitMs: retryWaitMs,
      recipientDomain: getAddressDomain(payload.to),
    });

    await sleep(retryWaitMs);
  }

  throw new Error(`Resend: ${lastErrText || 'Falha desconhecida'}`);
}
