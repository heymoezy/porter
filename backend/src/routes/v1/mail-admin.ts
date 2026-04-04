/**
 * Mail admin routes — platform admin mail management.
 * Handles domain lifecycle, mailbox listing, and mail config.
 */

import { FastifyInstance } from 'fastify';
import { ok, err } from '../../lib/envelope.js';
import { config } from '../../config.js';
import { pool } from '../../db/client.js';
import { StalwartMailProvider } from '../../services/mail/stalwart-provider.js';
import * as domainService from '../../services/mail/domain-service.js';

// ── Lazy provider singleton ────────────────────────────────────────────

let _provider: StalwartMailProvider | null | undefined;

function getProvider(): StalwartMailProvider | null {
  if (_provider !== undefined) return _provider;
  if (!config.mail.stalwartApiKey) {
    _provider = null;
    return null;
  }
  _provider = new StalwartMailProvider(config.mail.stalwartUrl, config.mail.stalwartApiKey);
  return _provider;
}

// ── Routes ─────────────────────────────────────────────────────────────

export default async function mailAdminRoutes(fastify: FastifyInstance) {

  // GET /config — mail subsystem config summary
  fastify.get('/config', async (_request, reply) => {
    const provider = getProvider();
    let stalwartReachable = false;
    if (provider) {
      try {
        stalwartReachable = await provider.adminClient.healthCheck();
      } catch {
        stalwartReachable = false;
      }
    }
    return reply.send(ok({
      provider: config.mail.provider,
      defaultDomain: config.mail.defaultDomain,
      stalwartConfigured: !!config.mail.stalwartApiKey,
      stalwartReachable,
    }));
  });

  // PUT /config — placeholder for updating mail settings
  fastify.put('/config', async (_request, reply) => {
    // TODO: persist to workspace_settings
    return reply.send(ok({ updated: false, message: 'Not implemented yet' }));
  });

  // GET /domains — list managed domains
  fastify.get('/domains', async (_request, reply) => {
    const domains = await domainService.listDomains();
    return reply.send(ok({ domains }));
  });

  // POST /domains — create a new managed domain
  fastify.post('/domains', async (request, reply) => {
    const body = request.body as { domain?: string; isPrimary?: boolean } | undefined;
    if (!body?.domain) {
      return reply.status(400).send(err('MISSING_DOMAIN', 'domain is required'));
    }
    const provider = getProvider();
    try {
      const result = await domainService.createDomain(
        provider,
        body.domain,
        body.isPrimary ?? false,
      );
      return reply.status(201).send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      // Unique constraint violation (domain already exists)
      if (message.includes('unique') || message.includes('duplicate')) {
        return reply.status(409).send(err('DOMAIN_EXISTS', `Domain already exists: ${body.domain}`));
      }
      return reply.status(500).send(err('CREATE_FAILED', message));
    }
  });

  // GET /domains/:id/dns — DNS records for a domain
  fastify.get('/domains/:id/dns', async (request, reply) => {
    const { id } = request.params as { id: string };
    const provider = getProvider();
    try {
      const dns = await domainService.getDomainDns(provider, id);
      return reply.send(ok(dns));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('not found')) {
        return reply.status(404).send(err('NOT_FOUND', message));
      }
      return reply.status(500).send(err('DNS_FAILED', message));
    }
  });

  // GET /mailboxes — list all mailboxes (admin view)
  fastify.get('/mailboxes', async (_request, reply) => {
    const { rows } = await pool.query(
      `SELECT * FROM mailboxes ORDER BY created_at DESC`,
    );
    return reply.send(ok({ mailboxes: rows }));
  });
}
