/**
 * Mail admin routes — platform admin mail management.
 * Handles domain lifecycle, mailbox listing, mail config, and delivery diagnostics.
 */

import { FastifyInstance } from 'fastify';
import { ok, err } from '../../lib/envelope.js';
import { config } from '../../config.js';
import { pool } from '../../db/client.js';
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

  // PATCH /mailboxes/:id — update mailbox display_name and/or status
  fastify.patch('/mailboxes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { displayName?: string; status?: string } | undefined;

    if (!body?.displayName && !body?.status) {
      return reply.status(400).send(err('MISSING_FIELDS', 'At least one of displayName or status is required'));
    }

    try {
      const result = await mailboxService.updateMailbox(id, {
        displayName: body.displayName,
        status: body.status,
      });
      return reply.send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('not found')) {
        return reply.status(404).send(err('NOT_FOUND', message));
      }
      return reply.status(500).send(err('UPDATE_FAILED', message));
    }
  });

  // DELETE /mailboxes/:id — soft-delete (deactivate) a mailbox
  fastify.delete('/mailboxes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const result = await mailboxService.deactivateMailbox(id);
      return reply.send(ok(result));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('not found')) {
        return reply.status(404).send(err('NOT_FOUND', message));
      }
      return reply.status(500).send(err('DELETE_FAILED', message));
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

  // ── Tranche 13: Deliverability & Ops Visibility ─────────────────────────

  // GET /stats — aggregate mail stats
  fastify.get('/stats', async (_request, reply) => {
    // Mailbox counts by status
    const { rows: mbxCounts } = await pool.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM mailboxes GROUP BY status`,
    );

    // Message counts by direction
    const { rows: msgCounts } = await pool.query<{ direction: string; count: string }>(
      `SELECT direction, COUNT(*)::text AS count FROM mail_messages GROUP BY direction`,
    );

    // Delivery counts by status
    const { rows: dlvCounts } = await pool.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM mail_deliveries GROUP BY status`,
    );

    // Newsletter source counts by trust level
    const { rows: srcCounts } = await pool.query<{ trust_level: string; count: string }>(
      `SELECT trust_level, COUNT(*)::text AS count FROM newsletter_sources GROUP BY trust_level`,
    );

    // Subscription counts (active vs cancelled via status column)
    const { rows: subCounts } = await pool.query<{ active: string; cancelled: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active')::text AS active,
         COUNT(*) FILTER (WHERE status != 'active')::text AS cancelled
       FROM newsletter_subscriptions`,
    );

    // Learning event counts by type
    const { rows: learnCounts } = await pool.query<{ event_type: string; count: string }>(
      `SELECT event_type, COUNT(*)::text AS count FROM mail_learning_events GROUP BY event_type`,
    );

    return reply.send(ok({
      mailboxes: Object.fromEntries(mbxCounts.map(r => [r.status, parseInt(r.count, 10)])),
      messages: Object.fromEntries(msgCounts.map(r => [r.direction, parseInt(r.count, 10)])),
      deliveries: Object.fromEntries(dlvCounts.map(r => [r.status, parseInt(r.count, 10)])),
      newsletterSources: Object.fromEntries(srcCounts.map(r => [r.trust_level, parseInt(r.count, 10)])),
      subscriptions: {
        active: parseInt(subCounts[0]?.active ?? '0', 10),
        cancelled: parseInt(subCounts[0]?.cancelled ?? '0', 10),
      },
      learningEvents: Object.fromEntries(learnCounts.map(r => [r.event_type, parseInt(r.count, 10)])),
    }));
  });

  // GET /queue — outbound queue (queued/deferred deliveries)
  fastify.get('/queue', async (_request, reply) => {
    const { rows } = await pool.query<{
      delivery_id: string;
      message_id: string;
      from_address: string;
      recipient: string;
      subject: string;
      status: string;
      queued_at: number | null;
      attempt: number;
    }>(
      `SELECT
         d.id AS delivery_id,
         d.message_id,
         m.from_address,
         d.recipient,
         m.subject,
         d.status,
         d.queued_at,
         d.attempt
       FROM mail_deliveries d
       LEFT JOIN mail_messages m ON m.id = d.message_id
       WHERE d.status IN ('queued', 'deferred')
       ORDER BY d.queued_at ASC
       LIMIT 100`,
    );

    return reply.send(ok({
      queue: rows.map(r => ({
        deliveryId: r.delivery_id,
        messageId: r.message_id,
        from: r.from_address ?? '',
        to: r.recipient,
        subject: r.subject ?? '',
        status: r.status,
        queuedAt: r.queued_at,
        attempts: r.attempt,
      })),
    }));
  });

  // GET /bounces — recent bounced/failed deliveries
  fastify.get('/bounces', async (_request, reply) => {
    const { rows } = await pool.query<{
      id: string;
      message_id: string;
      recipient: string;
      status: string;
      smtp_response: string | null;
      remote_mx: string | null;
      completed_at: number | null;
    }>(
      `SELECT id, message_id, recipient, status, smtp_response, remote_mx, completed_at
       FROM mail_deliveries
       WHERE status IN ('bounced', 'failed')
       ORDER BY completed_at DESC
       LIMIT 100`,
    );

    return reply.send(ok({
      bounces: rows.map(r => ({
        deliveryId: r.id,
        messageId: r.message_id,
        recipient: r.recipient,
        status: r.status,
        smtpResponse: r.smtp_response,
        remoteMx: r.remote_mx,
        completedAt: r.completed_at,
      })),
    }));
  });

  // GET /domains/:id/health — domain health check with issue detection
  fastify.get('/domains/:id/health', async (request, reply) => {
    const { id } = request.params as { id: string };
    const provider = getProvider();
    try {
      const dns = await domainService.getDomainDns(provider, id);
      const domain = await domainService.getDomainById(id);
      if (!domain) {
        return reply.status(404).send(err('NOT_FOUND', `Domain not found: ${id}`));
      }

      // Detect issues from DNS records
      const issues: string[] = [];
      const records = dns.records as Array<{ type?: string; valid?: boolean; name?: string; content?: string }>;
      if (!records || records.length === 0) {
        issues.push('No DNS records found — provider may not be configured');
      } else {
        const hasMx = records.some(r => r.type?.toUpperCase() === 'MX');
        const hasSpf = records.some(r => r.content?.startsWith('v=spf1'));
        const hasDkim = records.some(r => r.content?.startsWith('v=DKIM1') || r.name?.includes('_domainkey'));
        const hasDmarc = records.some(r => r.content?.startsWith('v=DMARC1') || r.name?.includes('_dmarc'));
        if (!hasMx) issues.push('Missing MX record');
        if (!hasSpf) issues.push('Missing SPF record');
        if (!hasDkim) issues.push('Missing DKIM record');
        if (!hasDmarc) issues.push('Missing DMARC record');
        const invalid = records.filter(r => r.valid === false);
        for (const r of invalid) {
          issues.push(`Invalid ${r.type ?? 'unknown'} record: ${r.name ?? '(unnamed)'}`);
        }
      }

      return reply.send(ok({
        domain: domain.domain,
        status: domain.status,
        dnsRecords: dns.records,
        lastChecked: domain.dns_last_checked_at,
        issues,
      }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('not found')) {
        return reply.status(404).send(err('NOT_FOUND', message));
      }
      return reply.status(500).send(err('HEALTH_CHECK_FAILED', message));
    }
  });

  // GET /mailboxes/:id/health — mailbox sync health
  fastify.get('/mailboxes/:id/health', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const mailbox = await mailboxService.getMailboxById(id);
      if (!mailbox) {
        return reply.status(404).send(err('NOT_FOUND', `Mailbox not found: ${id}`));
      }

      // Count messages for this mailbox
      const { rows: msgCountRows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM mail_messages WHERE mailbox_id = $1`,
        [id],
      );

      // Count queued deliveries associated with messages from this mailbox
      const { rows: queuedRows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM mail_deliveries d
         JOIN mail_messages m ON m.id = d.message_id
         WHERE m.mailbox_id = $1 AND d.status IN ('queued', 'deferred')`,
        [id],
      );

      return reply.send(ok({
        address: mailbox.address,
        status: mailbox.status,
        lastSyncAt: mailbox.last_sync_at,
        lastError: mailbox.last_error,
        messageCount: parseInt(msgCountRows[0]?.count ?? '0', 10),
        queuedDeliveries: parseInt(queuedRows[0]?.count ?? '0', 10),
      }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('HEALTH_CHECK_FAILED', message));
    }
  });
}
