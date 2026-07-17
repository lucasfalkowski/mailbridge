import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../src/index.js';

function createInboundMessage(to = 'inbox@example.com') {
  const raw = [
    'From: External Sender <sender@external.example>',
    `To: ${to}`,
    'Subject: Integration test',
    'Message-ID: <integration@example.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Hello from the integration test.',
  ].join('\r\n');

  return {
    from: 'sender@external.example',
    to,
    raw: new TextEncoder().encode(raw),
    rawSize: raw.length,
  };
}

test('email handler parses, routes, builds, and queues an inbound email', async () => {
  const originalConsoleLog = console.log;
  const queued = [];
  console.log = () => {};

  try {
    await worker.email(createInboundMessage(), {
      FROM_EMAIL: 'noreply@example.com',
      MAILBOX_CONFIG: {
        inbox: {
          address: 'inbox@example.com',
          defaultRecipients: ['recipient@example.com'],
        },
      },
      EMAIL_SEND_QUEUE: {
        send: async body => queued.push(body),
      },
    });

    assert.equal(queued.length, 1);
    assert.equal(queued[0].payload.to, 'recipient@example.com');
    assert.equal(queued[0].payload.reply_to, 'sender@external.example');
    assert.equal(queued[0].payload.text.trim(), 'Hello from the integration test.');
  } finally {
    console.log = originalConsoleLog;
  }
});

test('email handler logs and throws only sanitized root errors', async () => {
  const originalConsoleError = console.error;
  const errorLogs = [];
  console.error = (...args) => errorLogs.push(args);

  try {
    await assert.rejects(
      () => worker.email(createInboundMessage(), {
        FROM_EMAIL: 'noreply@example.com',
        MAILBOX_CONFIG: {
          inbox: {
            address: 'inbox@example.com',
            defaultRecipients: ['secret-invalid-recipient'],
          },
        },
      }),
      error => {
        assert.equal(error.name, 'EmailProcessingError');
        assert.equal(error.message, 'Email processing failed');
        return true;
      },
    );

    assert.deepEqual(errorLogs, [[
      'email.failed',
      { code: 'EMAIL_PROCESSING_FAILED' },
    ]]);
    assert.doesNotMatch(JSON.stringify(errorLogs), /secret-invalid-recipient|stack/);
  } finally {
    console.error = originalConsoleError;
  }
});
