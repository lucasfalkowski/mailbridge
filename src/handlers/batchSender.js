const QUEUE_MESSAGE_VERSION = 1;

function getAddressDomain(address = '') {
  return String(address).split('@')[1]?.toLowerCase() || 'unknown';
}

function sanitizeContext(context = {}) {
  return {
    mailbox: context.mailbox || 'unknown',
    route: context.route || 'unknown',
    fromDomain: context.fromDomain || 'unknown',
    rawSize: Number.isFinite(context.rawSize) ? context.rawSize : undefined,
  };
}

function createQueueMessage({ payload, idempotencyKey }, context) {
  return {
    version: QUEUE_MESSAGE_VERSION,
    payload,
    idempotencyKey,
    context: sanitizeContext(context),
    recipientDomain: getAddressDomain(payload?.to),
  };
}

export async function enqueueEmailBatch(emailPayloads, env, context = {}) {
  if (!env.EMAIL_SEND_QUEUE?.send) {
    const error = new Error('EMAIL_SEND_QUEUE binding is required');
    error.name = 'EmailQueueConfigurationError';
    throw error;
  }

  let queuedCount = 0;

  for (const emailPayload of emailPayloads) {
    await env.EMAIL_SEND_QUEUE.send(createQueueMessage(emailPayload, context), {
      contentType: 'json',
    });
    queuedCount += 1;
  }

  console.log('email.queued', {
    ...sanitizeContext(context),
    queuedCount,
  });

  return { queuedCount };
}

export function assertValidQueueMessage(body) {
  const isValid =
    body?.version === QUEUE_MESSAGE_VERSION &&
    body.payload &&
    typeof body.payload === 'object' &&
    typeof body.payload.to === 'string' &&
    typeof body.idempotencyKey === 'string' &&
    body.idempotencyKey.length > 0;

  if (!isValid) {
    const error = new Error('Invalid email queue message');
    error.name = 'InvalidEmailQueueMessageError';
    throw error;
  }

  return body;
}
