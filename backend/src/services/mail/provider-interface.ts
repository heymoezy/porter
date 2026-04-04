/**
 * Mail provider interface — contract for all mail backends (Stalwart, etc.).
 */

import type {
  CreateDomainInput,
  CreateDomainResult,
  DnsRecord,
  CreateMailboxInput,
  CreateMailboxResult,
  UpdateMailboxInput,
  CreateAliasInput,
  CreateAliasResult,
  MailboxCredentialResult,
  SyncMailboxInput,
  SyncMailboxResult,
  ProviderSendMessageInput,
  ProviderSendMessageResult,
} from './provider-types.js';

export interface MailProvider {
  createDomain(input: CreateDomainInput): Promise<CreateDomainResult>;
  getDomainDnsRecords(domain: string): Promise<DnsRecord[]>;
  createMailbox(input: CreateMailboxInput): Promise<CreateMailboxResult>;
  updateMailbox(input: UpdateMailboxInput): Promise<void>;
  createAlias(input: CreateAliasInput): Promise<CreateAliasResult>;
  deleteAlias(aliasAddress: string): Promise<void>;
  generateMailboxCredential(mailboxAddress: string): Promise<MailboxCredentialResult>;
  syncMailbox(input: SyncMailboxInput): Promise<SyncMailboxResult>;
  sendMessage(input: ProviderSendMessageInput): Promise<ProviderSendMessageResult>;
}
