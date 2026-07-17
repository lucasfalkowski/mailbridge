import test from 'node:test';
import assert from 'node:assert/strict';

import { processEmailQueue } from '../src/handlers/queueConsumer.js';

function createMessage(body, attempts = 1) {
  const actions = [];
  return {
    id: 'queue-message-id',
    body,
    attempts,
    ack: () => actions.push('ack'),
    retry: () => actions.push('retry'),
    actions,
  };
}

const queueBody = {
  version: 1,
  payload: { to: 'recipient@example.com', subject: 'Hello', text: 'Body' },
  idempotencyKey: 'key-1',
  recipientDomain: 'example.com',
  context: { mailbox: 'inbox@example.com', route: 'default' },
};

test('processEmailQueue acknowledges successful messages', async () => {
  const originalConsoleLog = console.log;
  const message = createMessage(queueBody);
  const calls = [];
  console.log = () => {};

  try {
    await processEmailQueue(
      { queue: 'email-send', messages: [message] },
      { EMAIL_DLQ_NAME: 'email-dlq' },
      {
        sendWithRetry: async (payload, env, key) => calls.push({ payload, key }),
        rateLimiter: { waitForCooldown: async () => {} },
      },
    );

    assert.deepEqual(message.actions, ['ack']);
    assert.equal(calls[0].key, 'key-1');
    assert.equal(calls[0].payload.to, 'recipient@example.com');
  } finally {
    console.log = originalConsoleLog;
  }
});

test('processEmailQueue retries only the failed message with sanitized logs', async () => {
  const originalConsoleError = console.error;
  const message = createMessage(queueBody, 2);
  const errorLogs = [];
  console.error = (...args) => errorLogs.push(args);

  try {
    await processEmailQueue(
      { queue: 'email-send', messages: [message] },
      { EMAIL_DLQ_NAME: 'email-dlq' },
      {
        sendWithRetry: async () => {
          throw new Error('secret recipient@example.com');
        },
        rateLimiter: { waitForCooldown: async () => {} },
      },
    );

    assert.deepEqual(message.actions, ['retry']);
    assert.equal(errorLogs[0][0], 'email.queue.retry');
    assert.equal(errorLogs[0][1].errorName, 'Error');
    assert.doesNotMatch(JSON.stringify(errorLogs), /secret/);
  } finally {
    console.error = originalConsoleError;
  }
});

test('processEmailQueue emits a sanitized DLQ alert and acknowledges it', async () => {
  const originalConsoleError = console.error;
  const message = createMessage(queueBody, 6);
  const errorLogs = [];
  console.error = (...args) => errorLogs.push(args);

  try {
    await processEmailQueue(
      { queue: 'email-dlq', messages: [message] },
      { EMAIL_DLQ_NAME: 'email-dlq' },
    );

    assert.deepEqual(message.actions, ['ack']);
    assert.equal(errorLogs[0][0], 'alert.email.dead_letter');
    assert.equal(errorLogs[0][1].recipientDomain, 'example.com');
    assert.equal(errorLogs[0][1].payload, undefined);
  } finally {
    console.error = originalConsoleError;
  }
});
