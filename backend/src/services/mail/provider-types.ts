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
