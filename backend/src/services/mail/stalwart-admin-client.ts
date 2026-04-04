/**
 * Stalwart Management API HTTP client.
 * Typed wrapper around fetch() for domain/account/alias CRUD.
 */

import type { DnsRecord } from './provider-types.js';

export class StalwartAdminClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  // ── Helpers ──────────────────────────────────────────────────────────

  private headers(): Record<string, string> {
    // Stalwart uses HTTP Basic Auth (user:password format in apiKey)
    const encoded = Buffer.from(this.apiKey).toString('base64');
    return {
      Authorization: `Basic ${encoded}`,
      'Content-Type': 'application/json',
    };
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return res;
  }

  /** Throw a descriptive error for non-2xx responses (excluding 404). */
  private async assertOk(res: Response, context: string): Promise<void> {
    if (res.ok) return;
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`Stalwart ${context}: ${res.status} — ${text}`);
  }

  // ── Domain ───────────────────────────────────────────────────────────

  async createDomain(domain: string): Promise<void> {
    const res = await this.request('POST', '/api/principal', {
      type: 'domain',
      name: domain,
    });
    await this.assertOk(res, `createDomain(${domain})`);
  }

  async getDomain(domain: string): Promise<unknown | null> {
    const res = await this.request('GET', `/api/principal/${encodeURIComponent(domain)}`);
    if (res.status === 404) return null;
    await this.assertOk(res, `getDomain(${domain})`);
    return res.json();
  }

  async getDnsRecords(domain: string): Promise<DnsRecord[]> {
    const res = await this.request('GET', `/api/dns/records/${encodeURIComponent(domain)}`);
    await this.assertOk(res, `getDnsRecords(${domain})`);
    const data = (await res.json()) as { data?: DnsRecord[] } | DnsRecord[];
    return Array.isArray(data) ? data : (data.data ?? []);
  }

  // ── Account ──────────────────────────────────────────────────────────

  async createAccount(opts: {
    name: string;
    email: string;
    password: string;
    quota?: number;
  }): Promise<void> {
    const body: Record<string, unknown> = {
      type: 'individual',
      name: opts.name,
      emails: [opts.email],
      secrets: [opts.password],
    };
    if (opts.quota !== undefined) {
      body.quota = opts.quota;
    }
    const res = await this.request('POST', '/api/principal', body);
    await this.assertOk(res, `createAccount(${opts.name})`);
  }

  async updateAccount(name: string, updates: Record<string, unknown>): Promise<void> {
    const res = await this.request('PATCH', `/api/principal/${encodeURIComponent(name)}`, updates);
    await this.assertOk(res, `updateAccount(${name})`);
  }

  async getAccount(name: string): Promise<unknown | null> {
    const res = await this.request('GET', `/api/principal/${encodeURIComponent(name)}`);
    if (res.status === 404) return null;
    await this.assertOk(res, `getAccount(${name})`);
    return res.json();
  }

  async deleteAccount(name: string): Promise<void> {
    const res = await this.request('DELETE', `/api/principal/${encodeURIComponent(name)}`);
    if (res.status === 404) return; // already gone
    await this.assertOk(res, `deleteAccount(${name})`);
  }

  // ── Alias ────────────────────────────────────────────────────────────

  async createAlias(opts: { name: string; targetAddress: string }): Promise<void> {
    const res = await this.request('POST', '/api/principal', {
      type: 'individual',
      name: opts.name,
      emails: [opts.targetAddress],
    });
    await this.assertOk(res, `createAlias(${opts.name})`);
  }

  async deleteAlias(name: string): Promise<void> {
    const res = await this.request('DELETE', `/api/principal/${encodeURIComponent(name)}`);
    if (res.status === 404) return; // already gone
    await this.assertOk(res, `deleteAlias(${name})`);
  }

  // ── Health ───────────────────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.request('GET', '/api/principal?type=domain&limit=1');
      return res.ok;
    } catch {
      return false;
    }
  }
}
