/**
 * Stalwart MailProvider implementation.
 * Bridges the generic MailProvider interface to the Stalwart Management API.
 */

import crypto from 'node:crypto';
import { StalwartAdminClient } from './stalwart-admin-client.js';
import type { MailProvider } from './provider-interface.js';
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

export class StalwartMailProvider implements MailProvider {
  private client: StalwartAdminClient;

  constructor(baseUrl: string, apiKey: string) {
    this.client = new StalwartAdminClient(baseUrl, apiKey);
  }

  /** Expose the underlying client for direct health-checks etc. */
  get adminClient(): StalwartAdminClient {
    return this.client;
  }

  // ── Domain ───────────────────────────────────────────────────────────

  async createDomain(input: CreateDomainInput): Promise<CreateDomainResult> {
    await this.client.createDomain(input.domain);
    return { domainId: input.domain, status: 'active' };
  }

  async getDomainDnsRecords(domain: string): Promise<DnsRecord[]> {
    return this.client.getDnsRecords(domain);
  }

  // ── Mailbox ──────────────────────────────────────────────────────────

  async createMailbox(input: CreateMailboxInput): Promise<CreateMailboxResult> {
    const password = input.password ?? crypto.randomBytes(24).toString('base64url');
    const localPart = input.address.split('@')[0];
    await this.client.createAccount({
      name: localPart,
      email: input.address,
      password,
      quota: input.quotaBytes,
    });
    return { mailboxId: localPart, address: input.address };
  }

  async updateMailbox(input: UpdateMailboxInput): Promise<void> {
    const updates: Record<string, unknown> = {};
    if (input.displayName !== undefined) updates.description = input.displayName;
    if (input.quotaBytes !== undefined) updates.quota = input.quotaBytes;
    await this.client.updateAccount(input.mailboxId, updates);
  }

  // ── Alias ────────────────────────────────────────────────────────────

  async createAlias(input: CreateAliasInput): Promise<CreateAliasResult> {
    const aliasLocal = input.aliasAddress.split('@')[0];
    await this.client.createAlias({
      name: aliasLocal,
      targetAddress: input.mailboxAddress,
    });
    return { aliasId: aliasLocal };
  }

  async deleteAlias(aliasAddress: string): Promise<void> {
    const aliasLocal = aliasAddress.split('@')[0];
    await this.client.deleteAlias(aliasLocal);
  }

  // ── Credentials ──────────────────────────────────────────────────────

  async generateMailboxCredential(mailboxAddress: string): Promise<MailboxCredentialResult> {
    const password = crypto.randomBytes(24).toString('base64url');
    const localPart = mailboxAddress.split('@')[0];
    await this.client.updateAccount(localPart, { secrets: [password] });
    return { password };
  }

  // ── Stubs (later tranches) ───────────────────────────────────────────

  async syncMailbox(_input: SyncMailboxInput): Promise<SyncMailboxResult> {
    // Tranche 7 — JMAP sync
    return { newMessages: 0 };
  }

  // ── Send Message ────────────────────────────────────────────────────

  async sendMessage(input: ProviderSendMessageInput): Promise<ProviderSendMessageResult> {
    // Generate Message-ID for tracking
    const messageId = `<${crypto.randomUUID()}@askporter.app>`;

    // For now (no Stalwart SMTP submission running): log the send and return the message-id.
    // This allows the full pipeline to work end-to-end without infrastructure.
    // When Stalwart is running, this will submit via SMTP port 587.
    console.log(
      `[mail-send] from=${input.from} to=${input.to.join(',')} subject=${input.subject}`,
    );

    return { providerMessageId: messageId };
  }
}
