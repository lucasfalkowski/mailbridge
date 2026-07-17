import test from 'node:test';
import assert from 'node:assert/strict';

import { enqueueEmailBatch } from '../src/handlers/batchSender.js';

test('enqueueEmailBatch persists one queue message per recipient', async () => {
  const messages = [];
  const originalConsoleLog = console.log;
  console.log = () => {};

  try {
    const result = await enqueueEmailBatch(
      [
        { payload: { to: 'one@example.com' }, idempotencyKey: 'key-1' },
        { payload: { to: 'two@example.net' }, idempotencyKey: 'key-2' },
      ],
      {
        EMAIL_SEND_QUEUE: {
          async send(body, options) {
            messages.push({ body, options });
          },
        },
      },
      {
        mailbox: 'inbox@example.com',
        route: 'default',
        fromDomain: 'sender.example',
        rawSize: 1234,
        messageId: 'must-not-be-queued',
      },
    );

    assert.deepEqual(result, { queuedCount: 2 });
    assert.equal(messages.length, 2);
    assert.equal(messages[0].body.payload.to, 'one@example.com');
    assert.equal(messages[0].body.idempotencyKey, 'key-1');
    assert.equal(messages[0].body.recipientDomain, 'example.com');
    assert.equal(messages[0].body.context.messageId, undefined);
    assert.deepEqual(messages[0].options, { contentType: 'json' });
  } finally {
    console.log = originalConsoleLog;
  }
});

test('enqueueEmailBatch fails safely when the queue binding is missing', async () => {
  await assert.rejects(
    () => enqueueEmailBatch([], {}),
    error => {
      assert.equal(error.name, 'EmailQueueConfigurationError');
      return true;
    },
  );
});
