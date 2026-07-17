import test from 'node:test';
import assert from 'node:assert/strict';

import { parseEmailList, routeRecipientsBySubject } from '../src/utils/recipientRouter.js';

test('parseEmailList trims empty entries', () => {
  assert.deepEqual(parseEmailList(' a@example.com, ,b@example.com '), [
    'a@example.com',
    'b@example.com',
  ]);
});

test('parseEmailList supports array values', () => {
  assert.deepEqual(parseEmailList([' a@example.com ', '', 'b@example.com']), [
    'a@example.com',
    'b@example.com',
  ]);
});

test('parseEmailList extracts and validates display-name addresses', () => {
  assert.deepEqual(parseEmailList(['Billing Team <billing@example.com>']), [
    'billing@example.com',
  ]);
});

test('parseEmailList supports quoted display names with commas', () => {
  assert.deepEqual(parseEmailList('"Doe, John" <john@example.com>, jane@example.com'), [
    'john@example.com',
    'jane@example.com',
  ]);
});

test('parseEmailList rejects malformed addresses', () => {
  assert.throws(
    () => parseEmailList('valid@example.com, invalid-address', 'MAILBOX_CONFIG.billing.defaultRecipients'),
    /MAILBOX_CONFIG\.billing\.defaultRecipients contains invalid email address: invalid-address/,
  );
});

test('routeRecipientsBySubject sends matching subjects to admin recipients', () => {
  const env = {
    MAILBOX_CONFIG: {
      billing: {
        address: 'billing@example.com',
        defaultRecipients: ['billing-default@example.com'],
        adminRecipients: ['billing-admin@example.com'],
        adminSubjectFilters: ['payment failed', 'update needed'],
      },
    },
  };

  assert.deepEqual(routeRecipientsBySubject('Payment failed today', env, 'billing@example.com'), {
    recipients: ['billing-admin@example.com'],
    route: 'admin',
    mailbox: 'billing@example.com',
  });
});

test('routeRecipientsBySubject uses default recipients when filters do not match', () => {
  const env = {
    MAILBOX_CONFIG: {
      support: {
        address: 'support@example.com',
        defaultRecipients: ['support-default@example.com'],
        adminRecipients: ['support-admin@example.com'],
        adminSubjectFilters: ['payment failed'],
      },
    },
  };

  assert.deepEqual(routeRecipientsBySubject('Newsletter', env, 'support@example.com'), {
    recipients: ['support-default@example.com'],
    route: 'default',
    mailbox: 'support@example.com',
  });
});

test('routeRecipientsBySubject supports mailboxes without filters', () => {
  const env = {
    MAILBOX_CONFIG: {
      music: {
        address: 'music@example.com',
        defaultRecipients: ['music-default@example.com'],
        adminRecipients: ['music-admin@example.com'],
        adminSubjectFilters: [],
      },
    },
  };

  assert.deepEqual(routeRecipientsBySubject('Payment failed today', env, 'Music <music@example.com>'), {
    recipients: ['music-default@example.com'],
    route: 'default',
    mailbox: 'music@example.com',
  });
});

test('routeRecipientsBySubject rejects configured mailboxes without recipients', () => {
  const env = {
    MAILBOX_CONFIG: {
      music: {
        address: 'music@example.com',
        defaultRecipients: [],
        adminRecipients: ['music-admin@example.com'],
        adminSubjectFilters: ['payment failed'],
      },
    },
  };

  assert.throws(
    () => routeRecipientsBySubject('Newsletter', env, 'music@example.com'),
    /MAILBOX_CONFIG\.music\.defaultRecipients is required for music@example.com/,
  );
});

test('routeRecipientsBySubject rejects malformed configured recipients', () => {
  const env = {
    MAILBOX_CONFIG: {
      billing: {
        address: 'billing@example.com',
        defaultRecipients: ['not-an-email'],
      },
    },
  };

  assert.throws(
    () => routeRecipientsBySubject('Newsletter', env, 'billing@example.com'),
    /MAILBOX_CONFIG\.billing\.defaultRecipients contains invalid email address: not-an-email/,
  );
});

test('routeRecipientsBySubject rejects malformed mailbox addresses', () => {
  const env = {
    MAILBOX_CONFIG: {
      billing: {
        address: 'billing@',
        defaultRecipients: ['billing-default@example.com'],
      },
    },
  };

  assert.throws(
    () => routeRecipientsBySubject('Newsletter', env, 'billing@example.com'),
    /MAILBOX_CONFIG\.billing\.address contains invalid email address: billing@/,
  );
});

test('routeRecipientsBySubject supports email addresses as mailbox config keys', () => {
  const env = {
    MAILBOX_CONFIG: {
      'billing@example.com': {
        defaultRecipients: ['default@example.com'],
        adminRecipients: ['admin@example.com'],
        adminSubjectFilters: ['payment failed'],
      },
    },
  };

  assert.deepEqual(routeRecipientsBySubject('Payment failed today', env, 'billing@example.com'), {
    recipients: ['admin@example.com'],
    route: 'admin',
    mailbox: 'billing@example.com',
  });
});

test('routeRecipientsBySubject returns no recipients for unconfigured mailboxes', () => {
  assert.deepEqual(
    routeRecipientsBySubject('Payment failed today', { MAILBOX_CONFIG: {} }, 'other@example.com'),
    {
      recipients: [],
      route: 'default',
      mailbox: 'other@example.com',
    },
  );
});
