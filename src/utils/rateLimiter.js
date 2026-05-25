import { sleep } from './sleep.js';

export const resendSendRate = {
  maxRequests: 5,
  timeWindowMs: 3000,
};

class RateLimiter {
  constructor(maxRequests, timeWindowMs) {
    this.maxRequests = maxRequests;
    this.timeWindowMs = timeWindowMs;
    this.requests = [];
    this.queue = Promise.resolve();
  }

  async waitForSlot() {
    this.queue = this.queue.then(() => this.#acquire());
    return this.queue;
  }

  async #acquire() {
    const now = Date.now();

    this.requests = this.requests.filter(time => now - time < this.timeWindowMs);

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = Math.max(0, this.timeWindowMs - (now - oldestRequest));
      if (waitTime > 0) {
        console.log('resend.rate_limit_wait', { waitMs: waitTime });
        await sleep(waitTime);
      }
      return this.#acquire();
    }

    this.requests.push(Date.now());
  }
}

export const resendRateLimiter = new RateLimiter(
  resendSendRate.maxRequests,
  resendSendRate.timeWindowMs,
);
