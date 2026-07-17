import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEmailPayloads } from '../src/utils/emailBuilder.js';
import { htmlToText } from '../src/utils/htmlToText.js';

const env = {
  FROM_NAME: 'Example Sender',
  FROM_EMAIL: 'noreply@example.com',
};

test('buildEmailPayloads creates stable idempotency keys without a message id', async () => {
  const parsed = {
    from: { address: 'sender@example.com' },
    subject: 'Hello',
    text: 'Plain text',
  };
  const message = {
    from: 'sender@example.com',
    to: 'worker@example.com',
    rawSize: 1234,
  };

  const first = await buildEmailPayloads(parsed, ['one@example.com'], env, message);
  const second = await buildEmailPayloads(parsed, ['one@example.com'], env, message);

  assert.equal(first[0].idempotencyKey, second[0].idempotencyKey);
  assert.match(first[0].idempotencyKey, /^fwd-[a-f0-9]{64}-0$/);
});

test('buildEmailPayloads creates one payload per recipient', async () => {
  const result = await buildEmailPayloads(
    {
      from: { address: 'sender@example.com' },
      messageId: '<abc@example.com>',
      subject: 'Hello',
      html: '<p>Hello<br>world</p>',
    },
    ['one@example.com', 'two@example.com'],
    env,
    { rawSize: 1234 },
  );

  assert.equal(result.length, 2);
  assert.equal(result[0].payload.from, '"Example Sender" <noreply@example.com>');
  assert.equal(result[0].payload.reply_to, 'sender@example.com');
  assert.equal(result[0].payload.text, 'Hello\nworld');
  assert.equal(result[0].payload.html, '<p>Hello<br>world</p>');
  assert.equal(result[0].payload.to, 'one@example.com');
  assert.equal(result[1].payload.to, 'two@example.com');
  assert.notEqual(result[0].idempotencyKey, result[1].idempotencyKey);
});

test('buildEmailPayloads prefers the original reply-to address', async () => {
  const result = await buildEmailPayloads(
    {
      from: { address: 'sender@example.com' },
      replyTo: [{ address: 'helpdesk@example.com' }],
      subject: 'Hello',
      text: 'Plain text',
    },
    ['one@example.com'],
    env,
    { rawSize: 1234 },
  );

  assert.equal(result[0].payload.reply_to, 'helpdesk@example.com');
});

test('buildEmailPayloads rejects invalid configured sender addresses', async () => {
  await assert.rejects(
    () => buildEmailPayloads(
      {
        from: { address: 'sender@example.com' },
        subject: 'Hello',
        text: 'Plain text',
      },
      ['one@example.com'],
      { FROM_EMAIL: 'not-an-email' },
      { rawSize: 1234 },
    ),
    /FROM_EMAIL contains invalid email address: not-an-email/,
  );
});

test('htmlToText decodes common named and numeric entities', () => {
  assert.equal(
    htmlToText('<p>Tom &amp; Jerry&nbsp;&copy;</p><p>Euro: &#x20AC;</p>'),
    'Tom & Jerry \u00a9\n\nEuro: \u20ac',
  );
});

test('htmlToText preserves unknown entities', () => {
  assert.equal(htmlToText('<p>Keep &unknown; intact</p>'), 'Keep &unknown; intact');
});

test('htmlToText strips non-content HTML before producing fallback text', () => {
  assert.equal(
    htmlToText(`
      <html>
        <head><title>Hidden title</title></head>
        <style>.hidden { display: none; }</style>
        <script>alert("hidden")</script>
        <!-- hidden comment -->
        <body>
          <h1>Invoice update</h1>
          <p>Hello <strong>team</strong></p>
          <ul><li>Review payment</li><li>Reply today</li></ul>
        </body>
      </html>
    `),
    'Invoice update\n\nHello team\n\n- Review payment\n- Reply today',
  );
});
