/**
 * Mailbox lifecycle service — manages mailboxes, aliases, agent identity binding,
 * and bulk provisioning. Follows the same pattern as domain-service.ts.
 */

import crypto from 'node:crypto';
import { pool } from '../../db/client.js';
import type { StalwartMailProvider } from './stalwart-provider.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface MailboxRow {
  id: string;
  domain_id: string;
  provider_mailbox_id: string | null;
  address: string;
  local_part: string;
  display_name: string;
  mailbox_type: string;
  status: string;
  auth_type: string;
  secret_ref: string | null;
  quota_bytes: string | null;
  last_sync_at: number | null;
  last_error: string | null;
  created_at: number | null;
  updated_at: number | null;
}

export interface AliasRow {
  id: string;
  mailbox_id: string;
  alias_address: string;
  receive_enabled: number;
  send_as_enabled: number;
  created_at: number | null;
  updated_at: number | null;
}

export interface AgentIdentity {
  mailboxId: string;
  address: string;
  displayName: string;
  agentId: string;
  agentName: string;
  role: string;
  isPrimary: boolean;
}

// ── Create Mailbox ─────────────────────────────────────────────────────

export async function createMailbox(
  provider: StalwartMailProvider | null,
  opts: {
    domainId: string;
    localPart: string;
    displayName: string;
    mailboxType?: string;
    agentId?: string;
  },
): Promise<{ id: string; address: string }> {
  // 1. Look up domain
  const { rows: domainRows } = await pool.query<{ domain: string }>(
    `SELECT domain FROM mail_domains WHERE id = $1`,
    [opts.domainId],
  );
  if (domainRows.length === 0) {
    throw new Error(`Domain not found: ${opts.domainId}`);
  }
  const domain = domainRows[0].domain;

  // 2. Build address
  const address = `${opts.localPart}@${domain}`;

  // 3. Check for duplicate
  const { rows: existing } = await pool.query(
    `SELECT id FROM mailboxes WHERE address = $1`,
    [address],
  );
  if (existing.length > 0) {
    throw new Error(`Mailbox already exists: ${address}`);
  }

  // 4. Insert into mailboxes
  const id = crypto.randomUUID();
  const now = Date.now() / 1000;
  const mailboxType = opts.mailboxType ?? 'agent';

  await pool.query(
    `INSERT INTO mailboxes (id, domain_id, address, local_part, display_name, mailbox_type, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $7)`,
    [id, opts.domainId, address, opts.localPart, opts.displayName, mailboxType, now],
  );

  // 5. If provider available, create in Stalwart and store provider_mailbox_id
  if (provider) {
    try {
      const result = await provider.createMailbox({ address, displayName: opts.displayName });
      await pool.query(
        `UPDATE mailboxes SET provider_mailbox_id = $1, updated_at = $2 WHERE id = $3`,
        [result.mailboxId, Date.now() / 1000, id],
      );
    } catch (err) {
      console.error(`[mailbox-service] provider.createMailbox failed for ${address}:`, err);
      // Mailbox created in DB but provider failed — continue (can retry later)
    }
  }

  // 6. If agentId provided, bind it
  if (opts.agentId) {
    await pool.query(
      `INSERT INTO agent_mailboxes (agent_id, mailbox_id, role, created_at)
       VALUES ($1, $2, 'primary', $3)
       ON CONFLICT (agent_id, mailbox_id) DO NOTHING`,
      [opts.agentId, id, now],
    );
  }

  return { id, address };
}

// ── List Mailboxes ─────────────────────────────────────────────────────

export async function listMailboxes(
  filters?: { domainId?: string; status?: string },
): Promise<MailboxRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters?.domainId) {
    conditions.push(`domain_id = $${idx++}`);
    params.push(filters.domainId);
  }
  if (filters?.status) {
    conditions.push(`status = $${idx++}`);
    params.push(filters.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query<MailboxRow>(
    `SELECT * FROM mailboxes ${where} ORDER BY address`,
    params,
  );
  return rows;
}

// ── Get by ID ──────────────────────────────────────────────────────────

export async function getMailboxById(id: string): Promise<MailboxRow | null> {
  const { rows } = await pool.query<MailboxRow>(
    `SELECT * FROM mailboxes WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// ── Get by Address ─────────────────────────────────────────────────────

export async function getMailboxByAddress(address: string): Promise<MailboxRow | null> {
  const { rows } = await pool.query<MailboxRow>(
    `SELECT * FROM mailboxes WHERE address = $1`,
    [address],
  );
  return rows[0] ?? null;
}

// ── Update Mailbox ────────────────────────────────────────────────────

export async function updateMailbox(
  id: string,
  updates: { displayName?: string; status?: string },
): Promise<{ id: string; address: string; displayName: string; status: string }> {
  const mailbox = await getMailboxById(id);
  if (!mailbox) {
    throw new Error(`Mailbox not found: ${id}`);
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (updates.displayName !== undefined) {
    sets.push(`display_name = $${idx++}`);
    params.push(updates.displayName);
  }
  if (updates.status !== undefined) {
    sets.push(`status = $${idx++}`);
    params.push(updates.status);
  }

  sets.push(`updated_at = $${idx++}`);
  params.push(Date.now() / 1000);
  params.push(id);

  await pool.query(
    `UPDATE mailboxes SET ${sets.join(', ')} WHERE id = $${idx}`,
    params,
  );

  return {
    id,
    address: mailbox.address,
    displayName: updates.displayName ?? mailbox.display_name,
    status: updates.status ?? mailbox.status,
  };
}

// ── Deactivate Mailbox ────────────────────────────────────────────────

export async function deactivateMailbox(
  id: string,
): Promise<{ id: string; address: string; status: string }> {
  const mailbox = await getMailboxById(id);
  if (!mailbox) {
    throw new Error(`Mailbox not found: ${id}`);
  }

  const now = Date.now() / 1000;
  await pool.query(
    `UPDATE mailboxes SET status = 'deactivated', updated_at = $1 WHERE id = $2`,
    [now, id],
  );

  return { id, address: mailbox.address, status: 'deactivated' };
}

// ── Hard Delete Mailbox ───────────────────────────────────────────────

export async function deleteMailboxPermanently(
  id: string,
): Promise<{ id: string; address: string; deleted: true }> {
  const mailbox = await getMailboxById(id);
  if (!mailbox) {
    throw new Error(`Mailbox not found: ${id}`);
  }

  // Delete all related data
  await pool.query(`DELETE FROM agent_mailboxes WHERE mailbox_id = $1`, [id]);
  await pool.query(`DELETE FROM mail_aliases WHERE mailbox_id = $1`, [id]);
  await pool.query(`DELETE FROM mail_deliveries WHERE message_id IN (SELECT id FROM mail_messages WHERE mailbox_id = $1)`, [id]);
  await pool.query(`DELETE FROM mail_messages WHERE mailbox_id = $1`, [id]);
  await pool.query(`DELETE FROM mail_threads WHERE mailbox_id = $1`, [id]);
  await pool.query(`DELETE FROM mailboxes WHERE id = $1`, [id]);

  return { id, address: mailbox.address, deleted: true };
}

// ── Create Alias ───────────────────────────────────────────────────────

export async function createMailboxAlias(
  provider: StalwartMailProvider | null,
  opts: {
    mailboxId: string;
    aliasAddress: string;
    receiveEnabled?: boolean;
    sendAsEnabled?: boolean;
  },
): Promise<{ id: string; aliasAddress: string }> {
  // Verify mailbox exists
  const mailbox = await getMailboxById(opts.mailboxId);
  if (!mailbox) {
    throw new Error(`Mailbox not found: ${opts.mailboxId}`);
  }

  const id = crypto.randomUUID();
  const now = Date.now() / 1000;

  await pool.query(
    `INSERT INTO mail_aliases (id, mailbox_id, alias_address, receive_enabled, send_as_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6)`,
    [
      id,
      opts.mailboxId,
      opts.aliasAddress,
      opts.receiveEnabled !== false ? 1 : 0,
      opts.sendAsEnabled !== false ? 1 : 0,
      now,
    ],
  );

  // Create in provider if available
  if (provider) {
    try {
      await provider.createAlias({
        mailboxAddress: mailbox.address,
        aliasAddress: opts.aliasAddress,
      });
    } catch (err) {
      console.error(`[mailbox-service] provider.createAlias failed for ${opts.aliasAddress}:`, err);
    }
  }

  return { id, aliasAddress: opts.aliasAddress };
}

// ── Rotate Credential ──────────────────────────────────────────────────

export async function rotateCredential(
  provider: StalwartMailProvider | null,
  mailboxId: string,
): Promise<{ password: string }> {
  const mailbox = await getMailboxById(mailboxId);
  if (!mailbox) {
    throw new Error(`Mailbox not found: ${mailboxId}`);
  }

  const password = crypto.randomBytes(24).toString('base64url');

  // Update via provider if available
  if (provider) {
    try {
      await provider.generateMailboxCredential(mailbox.address);
    } catch (err) {
      console.error(`[mailbox-service] credential rotation failed for ${mailbox.address}:`, err);
    }
  }

  // Store secret_ref (in production this would be an encrypted vault reference)
  const now = Date.now() / 1000;
  await pool.query(
    `UPDATE mailboxes SET secret_ref = $1, updated_at = $2 WHERE id = $3`,
    [`managed:${password.substring(0, 8)}...`, now, mailboxId],
  );

  return { password };
}

// ── Agent Identities ───────────────────────────────────────────────────

export async function getAgentIdentities(): Promise<AgentIdentity[]> {
  const { rows } = await pool.query<{
    mailbox_id: string;
    address: string;
    display_name: string;
    agent_id: string;
    agent_name: string;
    role: string;
  }>(
    `SELECT
       m.id AS mailbox_id,
       m.address,
       m.display_name,
       am.agent_id,
       p.name AS agent_name,
       am.role
     FROM mailboxes m
     JOIN agent_mailboxes am ON am.mailbox_id = m.id
     JOIN personas p ON p.id = am.agent_id
     WHERE m.status = 'active'
     ORDER BY p.name, am.role`,
  );

  return rows.map((r) => ({
    mailboxId: r.mailbox_id,
    address: r.address,
    displayName: r.display_name,
    agentId: r.agent_id,
    agentName: r.agent_name,
    role: r.role,
    isPrimary: r.role === 'primary',
  }));
}

// ── Provision Agent Mailbox ────────────────────────────────────────────

/**
 * Generate a stable local_part from an agent name:
 *   "Porter" -> "porter"
 *   "Skills Curator" -> "skills.curator"
 *   "Bridge-Vigil" -> "bridge.vigil"
 */
function nameToLocalPart(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s_-]+/g, '.')
    .replace(/[^a-z0-9.]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

export async function provisionAgentMailbox(
  provider: StalwartMailProvider | null,
  agentId: string,
  agentName: string,
  domainId: string,
): Promise<{ id: string; address: string }> {
  const localPart = nameToLocalPart(agentName);
  if (!localPart) {
    throw new Error(`Cannot derive local_part from agent name: ${agentName}`);
  }

  return createMailbox(provider, {
    domainId,
    localPart,
    displayName: agentName,
    mailboxType: 'agent',
    agentId,
  });
}

// ── Bulk Provision ─────────────────────────────────────────────────────

export async function bulkProvisionAgentMailboxes(
  provider: StalwartMailProvider | null,
  domainId: string,
): Promise<{ provisioned: number; skipped: number; errors: string[] }> {
  // Get all personas that do NOT already have an agent_mailboxes record
  const { rows: personas } = await pool.query<{ id: string; name: string }>(
    `SELECT p.id, p.name
     FROM personas p
     WHERE NOT EXISTS (
       SELECT 1 FROM agent_mailboxes am WHERE am.agent_id = p.id
     )
     ORDER BY p.name`,
  );

  let provisioned = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const persona of personas) {
    try {
      await provisionAgentMailbox(provider, persona.id, persona.name, domainId);
      provisioned++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already exists')) {
        skipped++;
      } else {
        errors.push(`${persona.name} (${persona.id}): ${msg}`);
      }
    }
  }

  return { provisioned, skipped, errors };
}
