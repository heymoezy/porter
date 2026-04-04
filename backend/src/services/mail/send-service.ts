/**
 * Send service — orchestrates outbound mail: compose, send via provider, persist, track delivery.
 */

import crypto from 'node:crypto';
import { createMessage, getMessageById } from './message-service.js';
import { createDelivery } from './delivery-service.js';
import { getMailboxById } from './mailbox-service.js';
import { getProvider } from './provider-factory.js';

// ── Send Mail ───────────────────────────────────────────────────────────

export async function sendMail(opts: {
  mailboxId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody: string;
  htmlBody?: string;
  inReplyTo?: string;       // internet_message_id of the message being replied to
  referencesHeader?: string; // accumulated References header
}): Promise<{ messageId: string; threadId: string; deliveries: number }> {
  // 1. Look up the sending mailbox
  const mailbox = await getMailboxById(opts.mailboxId);
  if (!mailbox) throw new Error('Mailbox not found');

  // 2. Generate RFC Message-ID
  const domain = mailbox.address.split('@')[1] || 'askporter.app';
  const internetMessageId = `<${crypto.randomUUID()}@${domain}>`;

  // 3. Build References header for reply chains
  let references = opts.referencesHeader || '';
  if (opts.inReplyTo && !references.includes(opts.inReplyTo)) {
    references = references ? `${references} ${opts.inReplyTo}` : opts.inReplyTo;
  }

  // 4. Send via provider (or log-only fallback)
  const provider = getProvider();
  let providerMessageId = internetMessageId;
  if (provider) {
    const result = await provider.sendMessage({
      from: mailbox.address,
      to: opts.to,
      cc: opts.cc,
      bcc: opts.bcc,
      subject: opts.subject,
      textBody: opts.textBody,
      htmlBody: opts.htmlBody,
      inReplyTo: opts.inReplyTo,
      references,
    });
    providerMessageId = result.providerMessageId;
  }

  // 5. Persist outbound message
  const msg = await createMessage({
    mailboxId: opts.mailboxId,
    direction: 'outbound',
    folder: 'sent',
    status: 'sent',
    fromAddress: mailbox.address,
    fromName: mailbox.display_name,
    toAddresses: opts.to,
    ccAddresses: opts.cc,
    bccAddresses: opts.bcc,
    subject: opts.subject,
    textBody: opts.textBody,
    htmlBody: opts.htmlBody,
    internetMessageId,
    inReplyTo: opts.inReplyTo,
    referencesHeader: references || undefined,
    providerMessageId,
    sentAt: Math.floor(Date.now() / 1000),
  });

  // 6. Create delivery records per recipient
  const allRecipients = [...opts.to, ...(opts.cc || []), ...(opts.bcc || [])];
  for (const recipient of allRecipients) {
    await createDelivery({
      messageId: msg.id,
      recipient,
      status: provider ? 'sent' : 'queued',
    });
  }

  return { messageId: msg.id, threadId: msg.threadId, deliveries: allRecipients.length };
}

// ── Create Draft ────────────────────────────────────────────────────────

export async function createDraft(opts: {
  mailboxId: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  textBody?: string;
  htmlBody?: string;
  inReplyTo?: string;
  referencesHeader?: string;
}): Promise<{ messageId: string; threadId: string }> {
  const mailbox = await getMailboxById(opts.mailboxId);
  if (!mailbox) throw new Error('Mailbox not found');

  const result = await createMessage({
    mailboxId: opts.mailboxId,
    direction: 'outbound',
    folder: 'drafts',
    status: 'draft',
    fromAddress: mailbox.address,
    fromName: mailbox.display_name,
    toAddresses: opts.to || [],
    subject: opts.subject || '',
    textBody: opts.textBody || '',
    htmlBody: opts.htmlBody,
    inReplyTo: opts.inReplyTo,
    referencesHeader: opts.referencesHeader,
  });

  return { messageId: result.id, threadId: result.threadId };
}

// ── Reply Helper ────────────────────────────────────────────────────────

export async function replyToMessage(
  originalMessageId: string,
  opts: {
    textBody: string;
    htmlBody?: string;
    to?: string[];
    cc?: string[];
  },
): Promise<{ messageId: string; threadId: string; deliveries: number }> {
  const original = await getMessageById(originalMessageId);
  if (!original) throw new Error('Original message not found');
  if (!original.mailbox_id) throw new Error('Original message has no mailbox');

  // Build reply headers
  const inReplyTo = original.internet_message_id || undefined;
  let references = (original.references_header as string) || '';
  if (inReplyTo && !references.includes(inReplyTo)) {
    references = references ? `${references} ${inReplyTo}` : inReplyTo;
  }

  // Default to = [original.from_address] if not provided
  const to = opts.to?.length ? opts.to : [original.from_address];

  // Default subject = 'Re: ' + original.subject (if not already prefixed)
  const subject = /^re:\s/i.test(original.subject)
    ? original.subject
    : `Re: ${original.subject}`;

  return sendMail({
    mailboxId: original.mailbox_id,
    to,
    cc: opts.cc,
    subject,
    textBody: opts.textBody,
    htmlBody: opts.htmlBody,
    inReplyTo,
    referencesHeader: references || undefined,
  });
}
