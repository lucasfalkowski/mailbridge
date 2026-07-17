import { assertValidQueueMessage } from './batchSender.js';
import { sendWithRetry } from './sendEmail.js';
import { createResendRateLimiter } from '../utils/rateLimiter.js';

function getErrorName(error) {
  return error instanceof Error ? error.name : typeof error;
}

function safeQueueContext(body = {}) {
  return {
    mailbox: body.context?.mailbox || 'unknown',
    route: body.context?.route || 'unknown',
    recipientDomain: body.recipientDomain || 'unknown',
  };
}

async function processDeadLetterQueue(batch) {
  for (const message of batch.messages) {
    console.error('alert.email.dead_letter', {
      ...safeQueueContext(message.body),
      attempts: message.attempts,
      queueMessageId: message.id,
    });
    message.ack();
  }
}

export async function processEmailQueue(batch, env, options = {}) {
  if (batch.queue === env.EMAIL_DLQ_NAME) {
    await processDeadLetterQueue(batch);
    return;
  }

  const sender = options.sendWithRetry || sendWithRetry;
  const rateLimiter = options.rateLimiter || createResendRateLimiter(env, options);

  for (const message of batch.messages) {
    let body;
    try {
      body = assertValidQueueMessage(message.body);
      await sender(body.payload, env, body.idempotencyKey, { rateLimiter });
      message.ack();
      console.log('email.queue.sent', {
        ...safeQueueContext(body),
        attempts: message.attempts,
      });
    } catch (error) {
      message.retry();
      console.error('email.queue.retry', {
        ...safeQueueContext(body || message.body),
        attempts: message.attempts,
        errorName: getErrorName(error),
      });
    }
  }

  await rateLimiter.waitForCooldown();
}
