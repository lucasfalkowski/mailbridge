import PostalMime from 'postal-mime';
import { buildEmailPayloads } from './utils/emailBuilder.js';
import { routeRecipientsBySubject } from './utils/recipientRouter.js';
import { sendEmailBatch } from './handlers/batchSender.js';

function getAddressDomain(address = '') {
  return String(address).split('@')[1]?.toLowerCase() || 'unknown';
}

export default {
  async email(message, env) {
    try {
      const parser = new PostalMime();
      const parsed = await parser.parse(message.raw);

      const fromAddress = parsed.from?.address || parsed.from?.[0]?.address;
      const { recipients, route, mailbox } = routeRecipientsBySubject(parsed.subject, env, message.to);
      const logContext = {
        mailbox,
        route,
        recipientCount: recipients?.length || 0,
        fromDomain: getAddressDomain(fromAddress),
        rawSize: message.rawSize,
        messageId: parsed.messageId || undefined,
      };

      if (!fromAddress) {
        console.warn('email.dropped', { ...logContext, reason: 'missing_from_address' });
        return;
      }

      if (!recipients?.length) {
        console.warn('email.dropped', { ...logContext, reason: 'no_recipients' });
        return;
      }

      console.log('email.routed', logContext);

      const emailPayloads = await buildEmailPayloads(parsed, recipients, env, message);
      
      await sendEmailBatch(emailPayloads, env, logContext);
    } catch (error) {
      console.error('email.failed', {
        message: error.message,
        stack: error.stack,
      });
      throw error;
    }
  },
};
