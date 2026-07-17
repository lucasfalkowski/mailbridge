import test from 'node:test';
import assert from 'node:assert/strict';

import { getResendSendRate, RateLimiter } from '../src/utils/rateLimiter.js';

test('getResendSendRate loads configurable positive integer limits', () => {
  assert.deepEqual(
    getResendSendRate({
      RESEND_RATE_MAX_REQUESTS: '2',
      RESEND_RATE_WINDOW_MS: 1000,
    }),
    { maxRequests: 2, timeWindowMs: 1000 },
  );

  assert.throws(
    () => getResendSendRate({ RESEND_RATE_MAX_REQUESTS: 0 }),
    /RESEND_RATE_MAX_REQUESTS must be a positive integer/,
  );
});

test('RateLimiter spaces requests and preserves a cooldown after the last slot', async () => {
  let currentTime = 1000;
  const waits = [];
  const wait = async ms => {
    waits.push(ms);
    currentTime += ms;
  };
  const limiter = new RateLimiter(2, 1000, wait, () => currentTime);
  const originalConsoleLog = console.log;
  console.log = () => {};

  try {
    await limiter.waitForSlot();
    await limiter.waitForSlot();
    await limiter.waitForCooldown();

    assert.deepEqual(waits, [500, 500]);
  } finally {
    console.log = originalConsoleLog;
  }
});
