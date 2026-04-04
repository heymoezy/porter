/**
 * Mail admin routes — platform admin mail management.
 * Handles domain lifecycle, mailbox listing, mail config, and delivery diagnostics.
 */

import { FastifyInstance } from 'fastify';
import { ok, err } from '../../lib/envelope.js';
import { config } from '../../config.js';
import { getProvider } from '../../services/mail/provider-factory.js';
import * as domainService from '../../services/mail/domain-service.js';
import * as mailboxService from '../../services/mail/mailbox-service.js';
import * as deliveryService from '../../services/mail/delivery-service.js';
import * as learningService from '../../services/mail/mail-learning-service.js';
import { syncMailbox } from '../../services/mail/sync-service.js';
import { checkGmailHealth } from '../../services/mail/gmail-connector.js';

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
    const gmailStatus = await checkGmailHealth();
    return reply.send(ok({
      provider: config.mail.provider,
      defaultDomain: config.mail.defaultDomain,
      stalwartConfigured: !!config.mail.stalwartApiKey,
      stalwartReachable,
      connectors: {
        gmail: gmailStatus,
      },
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
  fastify.get('/mailboxes', async (request, reply) => {
    const query = request.query as { domainId?: string; status?: string };
    const mailboxes = await mailboxService.listMailboxes({
      domainId: query.domainId,
      status: query.status,
    });
    return reply.send(ok({ mailboxes }));
  });

  // POST /mailboxes — create a new mailbox
  fastify.post('/mailboxes', async (request, reply) => {
    const body = request.body as {
      domainId?: string;
      localPart?: string;
      displayName?: string;
      mailboxType?: string;
      agentId?: string;
    } | undefined;

    if (!body?.domainId || !body?.localPart || !body?.displayName) {
      return reply.status(400).send(
        err('MISSING_FIELDS', 'domainId, localPart, and displayName are required'),
      );
    }

    const provider = getProvider();
    try {
      const result = await mailboxService.createMailbox(provider, {
        domainId: body.domainId,
        localPart: body.localPart,
        displayName: body.displayName,
        mailboxType: body.mailboxType,
        agentId: body.agentId,
      });
      return reply.status(201).send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('already exists')) {
        return reply.status(409).send(err('MAILBOX_EXISTS', message));
      }
      if (message.includes('not found')) {
        return reply.status(404).send(err('NOT_FOUND', message));
      }
      return reply.status(500).send(err('CREATE_FAILED', message));
    }
  });

  // POST /mailboxes/:id/aliases — create an alias for a mailbox
  fastify.post('/mailboxes/:id/aliases', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { aliasAddress?: string } | undefined;

    if (!body?.aliasAddress) {
      return reply.status(400).send(err('MISSING_FIELDS', 'aliasAddress is required'));
    }

    const provider = getProvider();
    try {
      const result = await mailboxService.createMailboxAlias(provider, {
        mailboxId: id,
        aliasAddress: body.aliasAddress,
      });
      return reply.status(201).send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('not found')) {
        return reply.status(404).send(err('NOT_FOUND', message));
      }
      return reply.status(500).send(err('CREATE_FAILED', message));
    }
  });

  // POST /mailboxes/:id/rotate-credential — generate new password
  fastify.post('/mailboxes/:id/rotate-credential', async (request, reply) => {
    const { id } = request.params as { id: string };
    const provider = getProvider();
    try {
      const result = await mailboxService.rotateCredential(provider, id);
      return reply.send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('not found')) {
        return reply.status(404).send(err('NOT_FOUND', message));
      }
      return reply.status(500).send(err('ROTATE_FAILED', message));
    }
  });

  // POST /provision-agents — bulk provision mailboxes for all unbound agents
  fastify.post('/provision-agents', async (request, reply) => {
    const body = request.body as { domainId?: string } | undefined;

    if (!body?.domainId) {
      return reply.status(400).send(err('MISSING_FIELDS', 'domainId is required'));
    }

    const provider = getProvider();
    try {
      const result = await mailboxService.bulkProvisionAgentMailboxes(provider, body.domainId);
      return reply.send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('PROVISION_FAILED', message));
    }
  });

  // GET /deliveries — recent delivery records (admin diagnostics)
  fastify.get('/deliveries', async (request, reply) => {
    const query = request.query as { status?: string; limit?: string };
    const deliveries = await deliveryService.getRecentDeliveries({
      status: query.status,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return reply.send(ok({ deliveries }));
  });

  // POST /sync/:mailboxId — trigger manual mailbox sync
  fastify.post('/sync/:mailboxId', async (request, reply) => {
    const { mailboxId } = request.params as { mailboxId: string };

    try {
      const result = await syncMailbox(mailboxId);
      return reply.send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('not found')) {
        return reply.status(404).send(err('NOT_FOUND', message));
      }
      return reply.status(500).send(err('SYNC_FAILED', message));
    }
  });

  // GET /learning-events — full audit trail of learning pipeline decisions
  fastify.get('/learning-events', async (request, reply) => {
    const query = request.query as {
      agentId?: string;
      eventType?: string;
      limit?: string;
    };
    const events = await learningService.getLearningEvents({
      agentId: query.agentId,
      eventType: query.eventType,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return reply.send(ok({ events }));
  });
}
