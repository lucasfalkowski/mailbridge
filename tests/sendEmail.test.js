import test from 'node:test';
import assert from 'node:assert/strict';

import { sendWithRetry } from '../src/handlers/sendEmail.js';

const payload = { to: 'recipient@example.com', subject: 'Hello', text: 'Body' };
const env = { RESEND_API_KEY: 'test-key' };
const noRateLimit = { waitForSlot: async () => {} };

test('sendWithRetry throws sanitized errors for Resend failures', async () => {
  const originalConsoleError = console.error;
  const errorLogs = [];
  console.error = (...args) => errorLogs.push(args);

  try {
    await assert.rejects(
      () => sendWithRetry(payload, env, 'idempotency-key', {
        rateLimiter: noRateLimit,
        fetch: async () => new Response('secret recipient@example.com', { status: 400 }),
      }),
      error => {
        assert.equal(error.name, 'ResendRequestError');
        assert.equal(error.message, 'Resend request failed with status 400');
        assert.equal(error.status, 400);
        assert.doesNotMatch(error.message, /secret|recipient@example\.com/);
        return true;
      },
    );

    assert.equal(errorLogs.length, 1);
    assert.equal(errorLogs[0][0], 'resend.failed');
    assert.equal(errorLogs[0][1].responseBodyLength, 'secret recipient@example.com'.length);
    assert.equal(errorLogs[0][1].responseBody, undefined);
  } finally {
    console.error = originalConsoleError;
  }
});

test('sendWithRetry sanitizes network error logs and thrown errors', async () => {
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  const warningLogs = [];
  const errorLogs = [];
  const waits = [];

  console.warn = (...args) => warningLogs.push(args);
  console.error = (...args) => errorLogs.push(args);

  try {
    await assert.rejects(
      () => sendWithRetry(payload, env, 'idempotency-key', {
        rateLimiter: noRateLimit,
        fetch: async () => {
          throw new Error('secret recipient@example.com network detail');
        },
        sleep: async ms => waits.push(ms),
        random: () => 0,
      }),
      error => {
        assert.equal(error.name, 'ResendNetworkError');
        assert.equal(error.message, 'Resend network request failed');
        assert.doesNotMatch(error.message, /secret|recipient@example\.com/);
        return true;
      },
    );

    assert.deepEqual(waits, [500]);
    assert.equal(warningLogs[0][0], 'resend.network_retry');
    assert.equal(warningLogs[0][1].message, undefined);
    assert.equal(errorLogs[0][0], 'resend.network_failed');
    assert.equal(errorLogs[0][1].message, undefined);
  } finally {
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  }
});

for (const [status, expectedWait] of [[429, 500], [500, 1000]]) {
  test(`sendWithRetry retries HTTP ${status} and succeeds`, async () => {
    const originalConsoleWarn = console.warn;
    const waits = [];
    let attempt = 0;
    console.warn = () => {};

    try {
      await sendWithRetry(payload, env, 'idempotency-key', {
        rateLimiter: noRateLimit,
        fetch: async () => {
          attempt += 1;
          return attempt === 1
            ? new Response('temporary failure', {
                status,
                headers: status === 429 ? { 'retry-after': '0' } : undefined,
              })
            : new Response('', { status: 200 });
        },
        sleep: async ms => waits.push(ms),
        random: () => 0,
      });

      assert.equal(attempt, 2);
      assert.deepEqual(waits, [expectedWait]);
    } finally {
      console.warn = originalConsoleWarn;
    }
  });
}
