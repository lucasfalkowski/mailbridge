import { sendWithRetry } from './sendEmail.js';
import { resendSendRate } from '../utils/rateLimiter.js';

export async function sendEmailBatch(emailPayloads, env, context = {}) {
  const batchSize = resendSendRate.maxRequests;
  const batchDelayMs = resendSendRate.timeWindowMs;
  const totalBatches = Math.ceil(emailPayloads.length / batchSize);

  for (let i = 0; i < emailPayloads.length; i += batchSize) {
    const batch = emailPayloads.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;

    console.log('email.batch.started', {
      ...context,
      batchNumber,
      totalBatches,
      batchSize: batch.length,
    });
    
    const emailPromises = batch.map(({ payload, idempotencyKey }) => 
      sendWithRetry(payload, env, idempotencyKey)
    );

    await Promise.all(emailPromises);

    console.log('email.batch.sent', {
      ...context,
      batchNumber,
      totalBatches,
      batchSize: batch.length,
    });
    
    if (i + batchSize < emailPayloads.length) {
      console.log('email.batch.waiting', {
        ...context,
        batchNumber,
        waitMs: batchDelayMs,
      });
      await new Promise(resolve => setTimeout(resolve, batchDelayMs));
    }
  }
  
  console.log('email.sent', {
    ...context,
    recipientCount: emailPayloads.length,
  });
}
