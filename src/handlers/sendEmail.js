import { sleep } from '../utils/sleep.js';
import { createResendRateLimiter } from '../utils/rateLimiter.js';

function getAddressDomain(address = '') {
  return String(address).split('@')[1]?.toLowerCase() || 'unknown';
}

function createResendError(status) {
  const error = new Error(`Resend request failed with status ${status}`);
  error.name = 'ResendRequestError';
  error.status = status;
  return error;
}

function createNetworkError() {
  const error = new Error('Resend network request failed');
  error.name = 'ResendNetworkError';
  return error;
}

function getErrorName(error) {
  return error instanceof Error ? error.name : typeof error;
}

export async function sendWithRetry(payload, env, idempotencyKey, options = {}) {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is required');
  }

  const maxAttempts = 2;
  const request = options.fetch || fetch;
  const wait = options.sleep || sleep;
  const random = options.random || Math.random;
  const rateLimiter = options.rateLimiter || createResendRateLimiter(env);
  let lastStatus;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res;
    try {
      await rateLimiter.waitForSlot();
      
      res = await request('https://api.resend.com/emails', {
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
          errorName: getErrorName(e),
        });
        throw createNetworkError();
      }

      const jitter = Math.floor(random() * 200);
      const waitMs = 500 * Math.pow(2, attempt) + jitter;

      console.warn('resend.network_retry', {
        attempt: attempt + 1,
        maxAttempts,
        waitMs,
        recipientDomain: getAddressDomain(payload.to),
        errorName: getErrorName(e),
      });

      await wait(waitMs);
      continue;
    }

    if (res.ok) {
      return;
    }

    const errText = await res.text().catch(() => '');
    lastStatus = res.status;

    const shouldRetry = res.status === 429 || (res.status >= 500 && res.status <= 599);

    if (!shouldRetry || attempt >= maxAttempts - 1) {
      console.error('resend.failed', {
        status: res.status,
        attempt: attempt + 1,
        maxAttempts,
        recipientDomain: getAddressDomain(payload.to),
        responseBodyLength: errText.length,
      });
      throw createResendError(res.status);
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
    const jitter = Math.floor(random() * 200);
    const retryWaitMs = Math.min(5000, Math.max(500, backoff)) + jitter;

    console.warn('resend.retry', {
      status: res.status,
      attempt: attempt + 1,
      maxAttempts,
      waitMs: retryWaitMs,
      recipientDomain: getAddressDomain(payload.to),
    });

    await wait(retryWaitMs);
  }

  throw createResendError(lastStatus || 'unknown');
}
