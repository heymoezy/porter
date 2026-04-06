/**
 * Send service — orchestrates outbound mail: compose, send via provider, persist, track delivery.
 * Uses JMAP when attachments are present, nodemailer for simple sends.
 */

import crypto from 'node:crypto';
import { createMessage, getMessageById } from './message-service.js';
import { createDelivery } from './delivery-service.js';
import { getMailboxById } from './mailbox-service.js';
import { getProvider } from './provider-factory.js';
import type { JmapAttachment } from './provider-types.js';

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
  attachments?: Array<{ blobId: string; name: string; type: string; size: number }>;
}): Promise<{ messageId: string; threadId: string; deliveries: number }> {
  // 1. Look up the sending mailbox
  const mailbox = await getMailboxById(opts.mailboxId);
  if (!mailbox) throw new Error('Mailbox not found');

  const provider = getProvider();

  // 2. Build References header for reply chains
  let references = opts.referencesHeader || '';
  if (opts.inReplyTo && !references.includes(opts.inReplyTo)) {
    references = references ? `${references} ${opts.inReplyTo}` : opts.inReplyTo;
  }

  let providerMessageId: string;

  // 3. Send via JMAP (when attachments) or nodemailer (simple)
  if (opts.attachments?.length && provider) {
    // JMAP path — create email with blob refs + submit
    const session = await provider.getJmapSession(mailbox.address);
    const sentMbId = await provider.jmap.findMailboxByRole(session.auth, session.accountId, 'sent');

    const jmapAttachments: JmapAttachment[] = opts.attachments.map(a => ({
      blobId: a.blobId,
      name: a.name,
      type: a.type,
      size: a.size,
    }));

    const emailId = await provider.jmap.sendEmail(
      session.auth,
      session.accountId,
      session.identityId,
      {
        mailboxIds: { [sentMbId]: true },
        from: [{ email: mailbox.address, name: mailbox.display_name || '' }],
        to: opts.to.map(e => ({ email: e })),
        cc: opts.cc?.map(e => ({ email: e })),
        bcc: opts.bcc?.map(e => ({ email: e })),
        subject: opts.subject,
        textBody: opts.textBody,
        htmlBody: opts.htmlBody,
        attachments: jmapAttachments,
        inReplyTo: opts.inReplyTo ? [opts.inReplyTo] : undefined,
        references: references ? references.split(/\s+/) : undefined,
      },
    );

    providerMessageId = emailId;
    console.log(`[mail-send] JMAP sent from=${mailbox.address} to=${opts.to.join(',')} id=${emailId}`);
  } else {
    // Nodemailer path — simple sends without attachments
    const domain = mailbox.address.split('@')[1] || 'askporter.app';
    const internetMessageId = `<${crypto.randomUUID()}@${domain}>`;
    providerMessageId = internetMessageId;

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
  }

  // 4. Persist outbound message in PostgreSQL cache
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
    inReplyTo: opts.inReplyTo,
    referencesHeader: references || undefined,
    providerMessageId,
    attachments: opts.attachments,
    sentAt: Math.floor(Date.now() / 1000),
  });

  // 5. Create delivery records per recipient
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
