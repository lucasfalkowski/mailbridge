import { sleep } from './sleep.js';

const DEFAULT_MAX_REQUESTS = 5;
const DEFAULT_TIME_WINDOW_MS = 3000;

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

export function getResendSendRate(env = {}) {
  return {
    maxRequests: parsePositiveInteger(
      env.RESEND_RATE_MAX_REQUESTS,
      DEFAULT_MAX_REQUESTS,
      'RESEND_RATE_MAX_REQUESTS',
    ),
    timeWindowMs: parsePositiveInteger(
      env.RESEND_RATE_WINDOW_MS,
      DEFAULT_TIME_WINDOW_MS,
      'RESEND_RATE_WINDOW_MS',
    ),
  };
}

export class RateLimiter {
  constructor(maxRequests, timeWindowMs, wait = sleep, now = Date.now) {
    this.intervalMs = Math.ceil(timeWindowMs / maxRequests);
    this.wait = wait;
    this.now = now;
    this.nextSlotAt = 0;
    this.queue = Promise.resolve();
  }

  async waitForSlot() {
    this.queue = this.queue.then(async () => {
      const waitMs = Math.max(0, this.nextSlotAt - this.now());
      if (waitMs > 0) {
        console.log('resend.rate_limit_wait', { waitMs });
        await this.wait(waitMs);
      }

      this.nextSlotAt = this.now() + this.intervalMs;
    });

    return this.queue;
  }

  async waitForCooldown() {
    await this.queue;
    const waitMs = Math.max(0, this.nextSlotAt - this.now());
    if (waitMs > 0) {
      await this.wait(waitMs);
    }
  }
}

export function createResendRateLimiter(env = {}, options = {}) {
  const rate = getResendSendRate(env);
  return new RateLimiter(
    rate.maxRequests,
    rate.timeWindowMs,
    options.sleep,
    options.now,
  );
}
