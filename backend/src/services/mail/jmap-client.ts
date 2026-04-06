/**
 * JMAP HTTP client for Stalwart Mail Server.
 * Handles session discovery, email CRUD, mailbox listing, blob upload/download.
 */

import type {
  JmapAuth,
  JmapSession,
  JmapRequest,
  JmapResponse,
  JmapMethodCall,
  JmapMailboxInfo,
  JmapEmailSummary,
  JmapEmailFull,
  JmapAttachment,
  JmapEmailAddress,
} from './provider-types.js';

const JMAP_USING = [
  'urn:ietf:params:jmap:core',
  'urn:ietf:params:jmap:mail',
  'urn:ietf:params:jmap:submission',
];

// ── Client ────────────────────────────────────────────────────────────────

export class JmapClient {
  private host: string;

  constructor(private baseUrl: string) {
    // Extract hostname for Host header (Stalwart routes on hostname)
    this.host = 'mail.askporter.app';
  }

  private authHeader(auth: JmapAuth): string {
    return `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
  }

  private headers(auth: JmapAuth, extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: this.authHeader(auth),
      Host: this.host,
      ...extra,
    };
  }

  // ── Session ───────────────────────────────────────────────────────────

  async getSession(auth: JmapAuth): Promise<JmapSession> {
    const res = await fetch(`${this.baseUrl}/jmap/session`, {
      headers: this.headers(auth),
    });
    if (!res.ok) throw new Error(`JMAP session failed: ${res.status}`);
    return res.json() as Promise<JmapSession>;
  }

  // ── Execute ───────────────────────────────────────────────────────────

  async execute(auth: JmapAuth, methodCalls: JmapMethodCall[]): Promise<JmapResponse> {
    const body: JmapRequest = { using: JMAP_USING, methodCalls };
    const res = await fetch(`${this.baseUrl}/jmap/`, {
      method: 'POST',
      headers: this.headers(auth, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`JMAP execute failed: ${res.status} — ${text}`);
    }
    return res.json() as Promise<JmapResponse>;
  }

  // ── Mailboxes ─────────────────────────────────────────────────────────

  async listMailboxes(auth: JmapAuth, accountId: string): Promise<JmapMailboxInfo[]> {
    const resp = await this.execute(auth, [
      ['Mailbox/get', { accountId, properties: ['id', 'name', 'role', 'totalEmails', 'unreadEmails', 'totalThreads', 'parentId', 'sortOrder'] }, 'mb0'],
    ]);
    const [, result] = resp.methodResponses[0];
    return (result.list as JmapMailboxInfo[]) || [];
  }

  // ── Email Query ───────────────────────────────────────────────────────

  async queryEmails(
    auth: JmapAuth,
    accountId: string,
    opts: {
      mailboxId?: string;
      threadId?: string;
      collapseThreads?: boolean;
      limit?: number;
      position?: number;
      sort?: Array<{ property: string; isAscending: boolean }>;
    },
  ): Promise<{ ids: string[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (opts.mailboxId) filter.inMailbox = opts.mailboxId;
    if (opts.threadId) filter.inThread = opts.threadId;

    const resp = await this.execute(auth, [
      ['Email/query', {
        accountId,
        filter,
        sort: opts.sort ?? [{ property: 'receivedAt', isAscending: false }],
        collapseThreads: opts.collapseThreads ?? false,
        position: opts.position ?? 0,
        limit: opts.limit ?? 50,
      }, 'q0'],
    ]);
    const [, result] = resp.methodResponses[0];
    return {
      ids: (result.ids as string[]) || [],
      total: (result.total as number) ?? 0,
    };
  }

  // ── Email Get (summary) ───────────────────────────────────────────────

  private static SUMMARY_PROPS = [
    'id', 'blobId', 'threadId', 'mailboxIds',
    'from', 'to', 'cc', 'replyTo',
    'subject', 'receivedAt', 'sentAt', 'preview',
    'hasAttachment', 'keywords', 'size',
    'messageId', 'inReplyTo', 'references',
  ];

  async getEmails(
    auth: JmapAuth,
    accountId: string,
    ids: string[],
  ): Promise<JmapEmailSummary[]> {
    if (ids.length === 0) return [];
    const resp = await this.execute(auth, [
      ['Email/get', { accountId, ids, properties: JmapClient.SUMMARY_PROPS }, 'g0'],
    ]);
    const [, result] = resp.methodResponses[0];
    return (result.list as JmapEmailSummary[]) || [];
  }

  // ── Email Get (full with body) ────────────────────────────────────────

  private static FULL_PROPS = [
    ...JmapClient.SUMMARY_PROPS,
    'textBody', 'htmlBody', 'attachments', 'bodyValues',
  ];

  async getEmailDetail(
    auth: JmapAuth,
    accountId: string,
    ids: string[],
  ): Promise<JmapEmailFull[]> {
    if (ids.length === 0) return [];
    const resp = await this.execute(auth, [
      ['Email/get', {
        accountId,
        ids,
        properties: JmapClient.FULL_PROPS,
        fetchTextBodyValues: true,
        fetchHTMLBodyValues: true,
        maxBodyValueBytes: 10_000_000,
      }, 'gf0'],
    ]);
    const [, result] = resp.methodResponses[0];
    return (result.list as JmapEmailFull[]) || [];
  }

  // ── Email Query + Get (combined for thread list) ──────────────────────

  async queryAndGetEmails(
    auth: JmapAuth,
    accountId: string,
    opts: {
      mailboxId: string;
      collapseThreads?: boolean;
      limit?: number;
      position?: number;
    },
  ): Promise<{ emails: JmapEmailSummary[]; total: number }> {
    const resp = await this.execute(auth, [
      ['Email/query', {
        accountId,
        filter: { inMailbox: opts.mailboxId },
        sort: [{ property: 'receivedAt', isAscending: false }],
        collapseThreads: opts.collapseThreads ?? false,
        position: opts.position ?? 0,
        limit: opts.limit ?? 50,
      }, 'q0'],
      ['Email/get', {
        accountId,
        '#ids': { resultOf: 'q0', name: 'Email/query', path: '/ids' },
        properties: JmapClient.SUMMARY_PROPS,
      }, 'g0'],
    ]);

    const [, qResult] = resp.methodResponses[0];
    const [, gResult] = resp.methodResponses[1];
    return {
      emails: (gResult.list as JmapEmailSummary[]) || [],
      total: (qResult.total as number) ?? 0,
    };
  }

  // ── Email Set (keywords, move, delete) ────────────────────────────────

  async updateEmail(
    auth: JmapAuth,
    accountId: string,
    emailId: string,
    updates: Record<string, unknown>,
  ): Promise<void> {
    const resp = await this.execute(auth, [
      ['Email/set', { accountId, update: { [emailId]: updates } }, 'u0'],
    ]);
    const [, result] = resp.methodResponses[0];
    if (result.notUpdated && (result.notUpdated as Record<string, unknown>)[emailId]) {
      throw new Error(`JMAP update failed: ${JSON.stringify((result.notUpdated as Record<string, unknown>)[emailId])}`);
    }
  }

  async deleteEmail(auth: JmapAuth, accountId: string, emailId: string): Promise<void> {
    const resp = await this.execute(auth, [
      ['Email/set', { accountId, destroy: [emailId] }, 'd0'],
    ]);
    const [, result] = resp.methodResponses[0];
    if (result.notDestroyed && (result.notDestroyed as Record<string, unknown>)[emailId]) {
      throw new Error(`JMAP delete failed: ${JSON.stringify((result.notDestroyed as Record<string, unknown>)[emailId])}`);
    }
  }

  // ── Create Email (draft / with attachments) ───────────────────────────

  async createEmail(
    auth: JmapAuth,
    accountId: string,
    email: {
      mailboxIds: Record<string, boolean>;
      from: JmapEmailAddress[];
      to: JmapEmailAddress[];
      cc?: JmapEmailAddress[];
      bcc?: JmapEmailAddress[];
      subject: string;
      textBody: string;
      htmlBody?: string;
      attachments?: JmapAttachment[];
      inReplyTo?: string[];
      references?: string[];
      keywords?: Record<string, boolean>;
    },
  ): Promise<string> {
    const bodyValues: Record<string, { value: string }> = {
      textPart: { value: email.textBody },
    };
    const bodyStructure: Record<string, unknown> = email.htmlBody
      ? {
          type: 'multipart/alternative',
          subParts: [
            { type: 'text/plain', partId: 'textPart' },
            { type: 'text/html', partId: 'htmlPart' },
          ],
        }
      : { type: 'text/plain', partId: 'textPart' };

    if (email.htmlBody) {
      bodyValues.htmlPart = { value: email.htmlBody };
    }

    // If there are attachments, wrap body in multipart/mixed
    let finalStructure = bodyStructure;
    if (email.attachments?.length) {
      finalStructure = {
        type: 'multipart/mixed',
        subParts: [
          bodyStructure,
          ...email.attachments.map(att => ({
            type: att.type,
            blobId: att.blobId,
            name: att.name,
            disposition: att.disposition || 'attachment',
            size: att.size,
          })),
        ],
      };
    }

    const create: Record<string, unknown> = {
      mailboxIds: email.mailboxIds,
      from: email.from,
      to: email.to,
      subject: email.subject,
      bodyValues,
      bodyStructure: finalStructure,
      keywords: email.keywords ?? {},
    };
    if (email.cc?.length) create.cc = email.cc;
    if (email.bcc?.length) create.bcc = email.bcc;
    if (email.inReplyTo?.length) create.inReplyTo = email.inReplyTo;
    if (email.references?.length) create.references = email.references;

    const resp = await this.execute(auth, [
      ['Email/set', { accountId, create: { draft: create } }, 'c0'],
    ]);
    const [, result] = resp.methodResponses[0];
    const created = result.created as Record<string, { id: string }> | undefined;
    if (!created?.draft?.id) {
      const notCreated = result.notCreated as Record<string, unknown> | undefined;
      throw new Error(`JMAP create email failed: ${JSON.stringify(notCreated?.draft)}`);
    }
    return created.draft.id;
  }

  // ── Submit Email ──────────────────────────────────────────────────────

  async submitEmail(
    auth: JmapAuth,
    accountId: string,
    emailId: string,
    identityId: string,
  ): Promise<void> {
    const resp = await this.execute(auth, [
      ['EmailSubmission/set', {
        accountId,
        create: { sub: { emailId, identityId } },
      }, 's0'],
    ]);
    const [, result] = resp.methodResponses[0];
    const notCreated = result.notCreated as Record<string, unknown> | undefined;
    if (notCreated?.sub) {
      throw new Error(`JMAP submit failed: ${JSON.stringify(notCreated.sub)}`);
    }
  }

  // ── Create + Submit (convenience) ─────────────────────────────────────

  async sendEmail(
    auth: JmapAuth,
    accountId: string,
    identityId: string,
    email: Parameters<JmapClient['createEmail']>[2],
  ): Promise<string> {
    // Put in Sent folder
    const sentMailboxId = await this.findMailboxByRole(auth, accountId, 'sent');
    email.mailboxIds = { [sentMailboxId]: true };

    const resp = await this.execute(auth, [
      ['Email/set', {
        accountId,
        create: { draft: this.buildCreatePayload(email) },
      }, 'c0'],
      ['EmailSubmission/set', {
        accountId,
        create: { sub: { emailId: '#draft', identityId } },
      }, 's0'],
    ]);

    const [, createResult] = resp.methodResponses[0];
    const created = createResult.created as Record<string, { id: string }> | undefined;
    if (!created?.draft?.id) {
      const notCreated = createResult.notCreated as Record<string, unknown> | undefined;
      throw new Error(`JMAP send failed at create: ${JSON.stringify(notCreated?.draft)}`);
    }

    const [, submitResult] = resp.methodResponses[1];
    const notCreatedSub = submitResult.notCreated as Record<string, unknown> | undefined;
    if (notCreatedSub?.sub) {
      throw new Error(`JMAP send failed at submit: ${JSON.stringify(notCreatedSub.sub)}`);
    }

    return created.draft.id;
  }

  private buildCreatePayload(email: Parameters<JmapClient['createEmail']>[2]): Record<string, unknown> {
    const bodyValues: Record<string, { value: string }> = {
      textPart: { value: email.textBody },
    };
    const bodyStructure: Record<string, unknown> = email.htmlBody
      ? {
          type: 'multipart/alternative',
          subParts: [
            { type: 'text/plain', partId: 'textPart' },
            { type: 'text/html', partId: 'htmlPart' },
          ],
        }
      : { type: 'text/plain', partId: 'textPart' };

    if (email.htmlBody) {
      bodyValues.htmlPart = { value: email.htmlBody };
    }

    let finalStructure = bodyStructure;
    if (email.attachments?.length) {
      finalStructure = {
        type: 'multipart/mixed',
        subParts: [
          bodyStructure,
          ...email.attachments.map(att => ({
            type: att.type,
            blobId: att.blobId,
            name: att.name,
            disposition: att.disposition || 'attachment',
            size: att.size,
          })),
        ],
      };
    }

    const create: Record<string, unknown> = {
      mailboxIds: email.mailboxIds,
      from: email.from,
      to: email.to,
      subject: email.subject,
      bodyValues,
      bodyStructure: finalStructure,
      keywords: email.keywords ?? {},
    };
    if (email.cc?.length) create.cc = email.cc;
    if (email.bcc?.length) create.bcc = email.bcc;
    if (email.inReplyTo?.length) create.inReplyTo = email.inReplyTo;
    if (email.references?.length) create.references = email.references;
    return create;
  }

  // ── Blob Upload ───────────────────────────────────────────────────────

  async uploadBlob(
    auth: JmapAuth,
    accountId: string,
    data: Buffer,
    contentType: string,
  ): Promise<{ blobId: string; type: string; size: number }> {
    const res = await fetch(`${this.baseUrl}/jmap/upload/${accountId}/`, {
      method: 'POST',
      headers: this.headers(auth, { 'Content-Type': contentType }),
      body: new Uint8Array(data),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`JMAP blob upload failed: ${res.status} — ${text}`);
    }
    return res.json() as Promise<{ blobId: string; type: string; size: number }>;
  }

  // ── Blob Download ─────────────────────────────────────────────────────

  async downloadBlob(
    auth: JmapAuth,
    accountId: string,
    blobId: string,
    name: string,
  ): Promise<{ data: Buffer; contentType: string }> {
    const res = await fetch(
      `${this.baseUrl}/jmap/download/${accountId}/${encodeURIComponent(blobId)}/${encodeURIComponent(name)}`,
      { headers: this.headers(auth) },
    );
    if (!res.ok) {
      throw new Error(`JMAP blob download failed: ${res.status}`);
    }
    const arrayBuf = await res.arrayBuffer();
    return {
      data: Buffer.from(arrayBuf),
      contentType: res.headers.get('content-type') || 'application/octet-stream',
    };
  }

  // ── Identity ──────────────────────────────────────────────────────────

  async getIdentities(auth: JmapAuth, accountId: string): Promise<Array<{ id: string; email: string; name: string }>> {
    const resp = await this.execute(auth, [
      ['Identity/get', { accountId }, 'i0'],
    ]);
    const [, result] = resp.methodResponses[0];
    return (result.list as Array<{ id: string; email: string; name: string }>) || [];
  }

  // ── Mailbox helpers ───────────────────────────────────────────────────

  async findMailboxByRole(auth: JmapAuth, accountId: string, role: string): Promise<string> {
    const mailboxes = await this.listMailboxes(auth, accountId);
    const match = mailboxes.find(m => m.role === role);
    if (!match) throw new Error(`No JMAP mailbox with role "${role}"`);
    return match.id;
  }

  async getOrCreateArchiveMailbox(auth: JmapAuth, accountId: string): Promise<string> {
    const mailboxes = await this.listMailboxes(auth, accountId);
    const archive = mailboxes.find(m => m.role === 'archive' || m.name.toLowerCase() === 'archive');
    if (archive) return archive.id;

    // Create archive mailbox
    const resp = await this.execute(auth, [
      ['Mailbox/set', {
        accountId,
        create: { archive: { name: 'Archive', role: 'archive' } },
      }, 'ma0'],
    ]);
    const [, result] = resp.methodResponses[0];
    const created = result.created as Record<string, { id: string }> | undefined;
    if (!created?.archive?.id) {
      throw new Error('Failed to create Archive mailbox');
    }
    return created.archive.id;
  }
}
