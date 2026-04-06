/**
 * Mail provider abstraction — shared types for all mail backends.
 */

export interface CreateDomainInput {
  domain: string;
}

export interface CreateDomainResult {
  domainId: string;
  status: string;
}

export interface DnsRecord {
  type: string;
  name: string;
  value: string;
  priority?: number;
}

export interface CreateMailboxInput {
  address: string;
  displayName: string;
  password?: string;
  quotaBytes?: number;
}

export interface CreateMailboxResult {
  mailboxId: string;
  address: string;
}

export interface UpdateMailboxInput {
  mailboxId: string;
  displayName?: string;
  quotaBytes?: number;
}

export interface CreateAliasInput {
  mailboxAddress: string;
  aliasAddress: string;
}

export interface CreateAliasResult {
  aliasId: string;
}

export interface MailboxCredentialResult {
  password: string;
}

export interface SyncMailboxInput {
  mailboxId: string;
  since?: number;
}

export interface SyncMailboxResult {
  newMessages: number;
}

export interface ProviderSendMessageInput {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody: string;
  htmlBody?: string;
  inReplyTo?: string;
  references?: string;
}

export interface ProviderSendMessageResult {
  providerMessageId: string;
}

// ── JMAP types ────────────────────────────────────────────────────────────

export interface JmapAuth {
  username: string;
  password: string;
}

export interface JmapEmailAddress {
  name?: string;
  email: string;
}

export interface JmapMailboxInfo {
  id: string;
  name: string;
  role: string | null;
  totalEmails: number;
  unreadEmails: number;
  totalThreads: number;
  parentId: string | null;
  sortOrder: number;
}

export interface JmapAttachment {
  blobId: string;
  name: string | null;
  type: string;
  size: number;
  cid?: string | null;
  disposition?: string;
}

export interface JmapEmailSummary {
  id: string;
  blobId: string;
  threadId: string;
  mailboxIds: Record<string, boolean>;
  from: JmapEmailAddress[] | null;
  to: JmapEmailAddress[] | null;
  cc: JmapEmailAddress[] | null;
  replyTo: JmapEmailAddress[] | null;
  subject: string;
  receivedAt: string;
  sentAt: string | null;
  preview: string;
  hasAttachment: boolean;
  keywords: Record<string, boolean>;
  size: number;
  messageId: string[] | null;
  inReplyTo: string[] | null;
  references: string[] | null;
}

export interface JmapEmailFull extends JmapEmailSummary {
  textBody: Array<{ partId: string; blobId: string; type: string }>;
  htmlBody: Array<{ partId: string; blobId: string; type: string }>;
  attachments: JmapAttachment[];
  bodyValues: Record<string, { value: string; isEncodingProblem?: boolean }>;
}

export interface JmapSession {
  accounts: Record<string, { name: string; isPersonal: boolean; accountCapabilities: Record<string, unknown> }>;
  primaryAccounts: Record<string, string>;
  uploadUrl: string;
  downloadUrl: string;
  state: string;
}

export type JmapMethodCall = [string, Record<string, unknown>, string];

export interface JmapRequest {
  using: string[];
  methodCalls: JmapMethodCall[];
}

export interface JmapResponse {
  methodResponses: [string, Record<string, unknown>, string][];
  sessionState: string;
}
