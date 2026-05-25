function getEmailAddress(value = '') {
  const trimmed = String(value).trim();
  const addressMatch = trimmed.match(/<([^>]+)>/);

  return (addressMatch?.[1] || trimmed).trim();
}

function assertValidEmail(value, fieldName = 'email') {
  const address = getEmailAddress(value);
  const isValid =
    address.length <= 254 &&
    /^[^\s@<>]+@[^\s@<>.]+(?:\.[^\s@<>.]+)+$/.test(address);

  if (!isValid) {
    throw new Error(`${fieldName} contains invalid email address: ${value}`);
  }

  return address;
}

export function parseEmailList(value = '', fieldName = 'email list') {
  if (value === undefined || value === null || value === '') {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map(email => String(email).trim())
      .filter(email => email)
      .map(email => assertValidEmail(email, fieldName));
  }

  return String(value)
    .split(',')
    .map(email => email.trim())
    .filter(email => email)
    .map(email => assertValidEmail(email, fieldName));
}

function normalizeEmail(value = '') {
  return getEmailAddress(value).toLowerCase();
}

function parseSubjectFilters(value = '') {
  if (Array.isArray(value)) {
    return value
      .map(filter => String(filter).trim().toLowerCase())
      .filter(filter => filter);
  }

  const rawValue = String(value);
  const separator = rawValue.includes(';') ? ';' : ',';

  return rawValue
    .split(separator)
    .map(filter => filter.trim().toLowerCase())
    .filter(filter => filter);
}

function parseMailboxConfig(value) {
  if (value === undefined || value === null || value === '') {
    return {};
  }

  if (typeof value === 'string') {
    try {
      return parseMailboxConfig(JSON.parse(value));
    } catch {
      throw new Error('MAILBOX_CONFIG must be valid JSON when provided as a string');
    }
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MAILBOX_CONFIG must be an object keyed by mailbox name or address');
  }

  return value;
}

function getMailboxConfig(mailbox, env = {}) {
  const normalizedMailbox = normalizeEmail(mailbox);
  const mailboxConfig = parseMailboxConfig(env.MAILBOX_CONFIG);

  for (const [profile, config] of Object.entries(mailboxConfig)) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`MAILBOX_CONFIG.${profile} must be an object`);
    }

    const configuredAddressValue = config.address || profile;
    const normalizedConfiguredAddress = normalizeEmail(configuredAddressValue);

    if (!normalizedConfiguredAddress.includes('@')) {
      throw new Error(
        `MAILBOX_CONFIG.${profile}.address is required unless the mailbox key is an email address`,
      );
    }

    const configuredAddress = assertValidEmail(
      configuredAddressValue,
      `MAILBOX_CONFIG.${profile}.address`,
    ).toLowerCase();

    if (configuredAddress === normalizedMailbox) {
      return {
        mailbox: normalizedMailbox || 'unknown',
        profile,
        recipients: config.defaultRecipients,
        adminRecipients: config.adminRecipients,
        adminSubjectFilters: config.adminSubjectFilters,
        requiredRecipientsName: `MAILBOX_CONFIG.${profile}.defaultRecipients`,
      };
    }
  }

  return {
    mailbox: normalizedMailbox || 'unknown',
  };
}

export function routeRecipientsBySubject(subject = '', env = {}, mailbox = '') {
  const config = getMailboxConfig(mailbox, env);
  const defaultRecipients = parseEmailList(
    config.recipients,
    config.requiredRecipientsName || 'defaultRecipients',
  );
  const adminRecipients = parseEmailList(
    config.adminRecipients,
    config.profile ? `MAILBOX_CONFIG.${config.profile}.adminRecipients` : 'adminRecipients',
  );
  const adminSubjectFilters = parseSubjectFilters(config.adminSubjectFilters);

  if (config.profile && defaultRecipients.length === 0) {
    throw new Error(`${config.requiredRecipientsName} is required for ${config.mailbox}`);
  }

  const normalizedSubject = String(subject).toLowerCase();
  const shouldSendToAdmin =
    adminRecipients.length > 0 &&
    adminSubjectFilters.length > 0 &&
    adminSubjectFilters.some(filter => normalizedSubject.includes(filter));

  return {
    recipients: shouldSendToAdmin ? adminRecipients : defaultRecipients,
    route: shouldSendToAdmin ? 'admin' : 'default',
    mailbox: config.mailbox,
  };
}
