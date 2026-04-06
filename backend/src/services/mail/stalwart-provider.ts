/**
 * Stalwart MailProvider implementation.
 * Bridges the generic MailProvider interface to the Stalwart Management API.
 */

import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { config } from '../../config.js';
import { StalwartAdminClient } from './stalwart-admin-client.js';
import { JmapClient } from './jmap-client.js';
import type { MailProvider } from './provider-interface.js';
import type {
  JmapAuth,
  JmapSession,
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

interface CachedCred { password: string; cachedAt: number }
interface CachedSession { accountId: string; identityId: string; cachedAt: number }

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class StalwartMailProvider implements MailProvider {
  private client: StalwartAdminClient;
  private _jmap: JmapClient;
  private credCache = new Map<string, CachedCred>();
  private sessionCache = new Map<string, CachedSession>();

  constructor(baseUrl: string, apiKey: string) {
    this.client = new StalwartAdminClient(baseUrl, apiKey);
    this._jmap = new JmapClient(baseUrl);
  }

  /** Expose the underlying client for direct health-checks etc. */
  get adminClient(): StalwartAdminClient {
    return this.client;
  }

  /** Expose JMAP client for direct use by routes. */
  get jmap(): JmapClient {
    return this._jmap;
  }

  // ── JMAP Auth Resolution ────────────────────────────────────────────

  async getJmapAuth(mailboxAddress: string): Promise<JmapAuth> {
    const localPart = mailboxAddress.split('@')[0];
    const now = Date.now();

    const cached = this.credCache.get(localPart);
    if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
      return { username: localPart, password: cached.password };
    }

    const account = await this.client.getAccount(localPart) as { data?: { secrets?: string[] } } | null;
    const password = account?.data?.secrets?.[0];
    if (!password) throw new Error(`No credentials for mailbox ${mailboxAddress}`);

    this.credCache.set(localPart, { password, cachedAt: now });
    return { username: localPart, password };
  }

  async getJmapSession(mailboxAddress: string): Promise<{ auth: JmapAuth; accountId: string; identityId: string }> {
    const auth = await this.getJmapAuth(mailboxAddress);
    const now = Date.now();

    const cached = this.sessionCache.get(auth.username);
    if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
      return { auth, accountId: cached.accountId, identityId: cached.identityId };
    }

    const session = await this._jmap.getSession(auth);
    const accountId = session.primaryAccounts?.['urn:ietf:params:jmap:mail']
      || Object.keys(session.accounts)[0];
    if (!accountId) throw new Error(`No JMAP account for ${mailboxAddress}`);

    // Resolve identity
    const identities = await this._jmap.getIdentities(auth, accountId);
    const identity = identities.find(i => i.email === mailboxAddress) || identities[0];
    const identityId = identity?.id || '';

    this.sessionCache.set(auth.username, { accountId, identityId, cachedAt: now });
    return { auth, accountId, identityId };
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
    const messageId = `<${crypto.randomUUID()}@askporter.app>`;

    // Auth as the sending mailbox — look up password from Stalwart
    const localPart = input.from.split('@')[0];
    const account = await this.client.getAccount(localPart) as { data?: { secrets?: string[] } } | null;
    const password = account?.data?.secrets?.[0];
    if (!password) throw new Error(`No credentials for mailbox ${input.from}`);

    const transport = nodemailer.createTransport({
      host: '127.0.0.1',
      port: 465,
      secure: true,
      auth: { user: localPart, pass: password },
      tls: { rejectUnauthorized: false },
    });

    const info = await transport.sendMail({
      from: input.from,
      to: input.to.join(', '),
      cc: input.cc?.join(', ') || undefined,
      bcc: input.bcc?.join(', ') || undefined,
      subject: input.subject,
      text: input.textBody,
      html: input.htmlBody || undefined,
      messageId,
      inReplyTo: input.inReplyTo || undefined,
      references: input.references || undefined,
    });

    console.log(`[mail-send] sent from=${input.from} to=${input.to.join(',')} msgId=${info.messageId}`);
    return { providerMessageId: info.messageId || messageId };
  }
}
