/**
 * Domain lifecycle service — manages mail_domains records and coordinates with
 * the mail provider for DNS records and domain provisioning.
 */

import crypto from 'node:crypto';
import { pool } from '../../db/client.js';
import type { StalwartMailProvider } from './stalwart-provider.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface DomainRow {
  id: string;
  domain: string;
  provider: string;
  status: string;
  is_primary: number;
  dkim_selector: string | null;
  dkim_public_key: string | null;
  return_path_domain: string | null;
  dns_last_checked_at: number | null;
  dns_status_json: unknown;
  created_at: number | null;
  updated_at: number | null;
}

// ── Create ─────────────────────────────────────────────────────────────

export async function createDomain(
  provider: StalwartMailProvider | null,
  domain: string,
  isPrimary: boolean = false,
): Promise<{ id: string; domain: string; status: string }> {
  const id = crypto.randomUUID();
  const now = Date.now() / 1000;

  await pool.query(
    `INSERT INTO mail_domains (id, domain, provider, status, is_primary, created_at, updated_at)
     VALUES ($1, $2, 'stalwart', $3, $4, $5, $5)`,
    [id, domain, 'pending_dns', isPrimary ? 1 : 0, now],
  );

  let status = 'pending_dns';

  if (provider) {
    try {
      await provider.createDomain({ domain });
      status = 'active';
      await pool.query(
        `UPDATE mail_domains SET status = $1, updated_at = $2 WHERE id = $3`,
        [status, Date.now() / 1000, id],
      );
    } catch (err) {
      // Domain created in DB but provider failed — leave as pending_dns
      console.error(`[domain-service] provider.createDomain failed for ${domain}:`, err);
    }
  }

  return { id, domain, status };
}

// ── List ───────────────────────────────────────────────────────────────

export async function listDomains(): Promise<DomainRow[]> {
  const { rows } = await pool.query<DomainRow>(
    `SELECT * FROM mail_domains ORDER BY is_primary DESC, created_at ASC`,
  );
  return rows;
}

// ── Get by ID ──────────────────────────────────────────────────────────

export async function getDomainById(domainId: string): Promise<DomainRow | null> {
  const { rows } = await pool.query<DomainRow>(
    `SELECT * FROM mail_domains WHERE id = $1`,
    [domainId],
  );
  return rows[0] ?? null;
}

// ── DNS Records ────────────────────────────────────────────────────────

export async function getDomainDns(
  provider: StalwartMailProvider | null,
  domainId: string,
): Promise<{ domain: string; records: unknown[]; status: string }> {
  const row = await getDomainById(domainId);
  if (!row) throw new Error(`Domain not found: ${domainId}`);

  let records: unknown[] = [];

  if (provider) {
    try {
      records = await provider.getDomainDnsRecords(row.domain);
      const now = Date.now() / 1000;
      await pool.query(
        `UPDATE mail_domains SET dns_status_json = $1, dns_last_checked_at = $2, updated_at = $2 WHERE id = $3`,
        [JSON.stringify(records), now, domainId],
      );
    } catch (err) {
      console.error(`[domain-service] getDomainDnsRecords failed for ${row.domain}:`, err);
    }
  }

  return { domain: row.domain, records, status: row.status };
}
