import { htmlToText } from './htmlToText.js';

function normalizeIdempotencyValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function getAddress(value) {
  if (Array.isArray(value)) {
    return value[0]?.address || '';
  }

  return value?.address || '';
}

function getReplyToAddress(parsed) {
  return getAddress(parsed.replyTo) || getAddress(parsed.from);
}

function assertValidEmailAddress(value, fieldName) {
  const address = String(value || '').trim();
  const isValid =
    address.length <= 254 &&
    /^[^\s@<>]+@[^\s@<>.]+(?:\.[^\s@<>.]+)+$/.test(address);

  if (!isValid) {
    throw new Error(`${fieldName} contains invalid email address: ${value}`);
  }

  return address;
}

async function hashValue(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);

  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function formatFromAddress(env) {
  const fromEmail = env.FROM_EMAIL?.trim();
  if (!fromEmail) {
    throw new Error('FROM_EMAIL is required');
  }
  const validatedFromEmail = assertValidEmailAddress(fromEmail, 'FROM_EMAIL');

  const fromName = env.FROM_NAME?.trim();
  if (!fromName) {
    return validatedFromEmail;
  }

  const escapedName = fromName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const needsQuotes = /[\s",<>()[\]:;@\\]/.test(fromName);

  return `${needsQuotes ? `"${escapedName}"` : escapedName} <${validatedFromEmail}>`;
}

async function buildIdempotencyKey(parsed, message, recipient, index) {
  const sourceParts = [
    parsed.messageId,
    parsed.date,
    parsed.subject,
    getAddress(parsed.from),
    getReplyToAddress(parsed),
    message?.from,
    message?.to,
    message?.rawSize,
    parsed.text,
    parsed.html,
    recipient,
    index,
  ];
  const source = sourceParts.map(normalizeIdempotencyValue).join('|');
  const fingerprint = await hashValue(source);

  return `fwd-${fingerprint}-${index}`;
}

export async function buildEmailPayloads(parsed, recipients, env, message) {
  const textBody = parsed.text || htmlToText(parsed.html) || '(sem conteúdo)';
  const from = formatFromAddress(env);
  const replyTo = getReplyToAddress(parsed);
  
  return Promise.all(recipients.map(async (recipient, index) => {
    const payload = {
      from,
      to: recipient,
      subject: parsed.subject || 'Sem assunto',
      text: textBody,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(parsed.html ? { html: parsed.html } : {})
    };

    const idempotencyKey = await buildIdempotencyKey(parsed, message, recipient, index);
    
    return { payload, idempotencyKey };
  }));
}
