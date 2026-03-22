import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { sqlite } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';
import { z } from 'zod';
import crypto from 'crypto';

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const emailSchema = z.object({
  value: z.string().email(),
  label: z.enum(['work', 'personal', 'other']).default('work'),
  is_primary: z.boolean().default(false),
});

const phoneSchema = z.object({
  value: z.string().min(1),
  country_code: z.string().max(5).optional(),
  label: z.enum(['mobile', 'work', 'home', 'other']).default('mobile'),
  is_primary: z.boolean().default(false),
});

const socialSchema = z.record(
  z.enum(['linkedin', 'x', 'github', 'instagram', 'facebook', 'other']),
  z.string(),
);

const createContactSchema = z.object({
  display_name: z.string().min(1).max(200),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company_id: z.string().optional(),
  job_title: z.string().optional(),
  notes: z.string().optional(),
  emails: z.array(emailSchema).optional(),
  phones: z.array(phoneSchema).optional(),
  social: socialSchema.optional(),
});

const updateContactSchema = z.object({
  display_name: z.string().min(1).max(200).optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  company_id: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  emails: z.array(emailSchema).optional(),
  phones: z.array(phoneSchema).optional(),
  social: socialSchema.optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function getContactFull(contactId: string) {
  const contact = sqlite.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId) as any;
  if (!contact) return null;

  const emails = sqlite.prepare(
    'SELECT id, value, label, is_primary FROM contact_emails WHERE contact_id = ?'
  ).all(contactId) as any[];

  const phones = sqlite.prepare(
    'SELECT id, value, country_code, label, is_primary FROM contact_phones WHERE contact_id = ?'
  ).all(contactId) as any[];

  const socialRows = sqlite.prepare(
    'SELECT id, platform, handle FROM contact_social WHERE contact_id = ?'
  ).all(contactId) as any[];

  // Convert social rows to object: { linkedin: "url", x: "handle" }
  const social: Record<string, string> = {};
  for (const s of socialRows) social[s.platform] = s.handle;

  return {
    ...contact,
    emails: emails.map(e => ({ ...e, is_primary: !!e.is_primary })),
    phones: phones.map(p => ({ ...p, is_primary: !!p.is_primary })),
    social,
  };
}

// ── Route plugin ──────────────────────────────────────────────────────────────

export default async function contactV1Routes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET / — list contacts
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const query = request.query as {
      company_id?: string;
      q?: string;
      limit?: string;
      offset?: string;
    };

    const limit = Math.min(parseInt(query.limit ?? '50', 10) || 50, 200);
    const offset = parseInt(query.offset ?? '0', 10) || 0;

    const conditions: string[] = [];
    const params: any[] = [];

    if (query.company_id) {
      conditions.push('company_id = ?');
      params.push(query.company_id);
    }

    if (query.q) {
      const like = `%${query.q}%`;
      conditions.push('(display_name LIKE ? OR first_name LIKE ? OR last_name LIKE ?)');
      params.push(like, like, like);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = (sqlite.prepare(
      `SELECT COUNT(*) as count FROM contacts ${where}`
    ).get(...params) as { count: number }).count;

    const rows = sqlite.prepare(
      `SELECT id FROM contacts ${where} ORDER BY display_name ASC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as Array<{ id: string }>;

    const contacts = rows.map(r => getContactFull(r.id)).filter(Boolean);

    return reply.send(ok({ contacts, total }));
  });

  // POST / — create a contact (CRM-01, CRM-02)
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const parsed = createContactSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const body = parsed.data;

    // Verify company exists if company_id provided
    if (body.company_id) {
      const company = sqlite.prepare('SELECT id FROM companies WHERE id = ?').get(body.company_id);
      if (!company) {
        return reply.code(404).send(err('COMPANY_NOT_FOUND', 'Company not found'));
      }
    }

    const id = crypto.randomUUID();
    const createdBy = request.sessionUser!.username;

    sqlite.transaction(() => {
      sqlite.prepare(`
        INSERT INTO contacts (id, display_name, first_name, last_name, company_id, job_title, notes, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch('now'), unixepoch('now'))
      `).run(
        id,
        body.display_name,
        body.first_name ?? null,
        body.last_name ?? null,
        body.company_id ?? null,
        body.job_title ?? null,
        body.notes ?? null,
        createdBy,
      );

      if (body.emails) {
        for (const email of body.emails) {
          sqlite.prepare(`
            INSERT INTO contact_emails (contact_id, value, label, is_primary) VALUES (?, ?, ?, ?)
          `).run(id, email.value, email.label, email.is_primary ? 1 : 0);
        }
      }

      if (body.phones) {
        for (const phone of body.phones) {
          sqlite.prepare(`
            INSERT INTO contact_phones (contact_id, value, country_code, label, is_primary) VALUES (?, ?, ?, ?, ?)
          `).run(id, phone.value, phone.country_code ?? null, phone.label, phone.is_primary ? 1 : 0);
        }
      }

      if (body.social) {
        for (const [platform, handle] of Object.entries(body.social)) {
          sqlite.prepare(`
            INSERT INTO contact_social (contact_id, platform, handle) VALUES (?, ?, ?)
          `).run(id, platform, handle);
        }
      }
    })();

    return reply.code(201).send(ok({ contact: getContactFull(id) }));
  });

  // POST /:id/analyze — queue AI analysis job (CRM-03)
  fastify.post<{ Params: { id: string } }>('/:id/analyze', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;
    const existing = sqlite.prepare('SELECT id FROM contacts WHERE id = ?').get(id);
    if (!existing) return reply.code(404).send(err('CONTACT_NOT_FOUND', 'Contact not found'));

    const jobId = crypto.randomUUID();
    sqlite.prepare(`
      INSERT INTO agent_jobs (id, agent_id, trigger_type, trigger_data, status, scheduled_for, created_at)
      VALUES (?, 'system', 'contact_analysis', ?, 'pending', unixepoch('now'), unixepoch('now'))
    `).run(jobId, JSON.stringify({ contact_id: id }));

    return reply.code(202).send(ok({ job_id: jobId, message: 'Analysis queued' }));
  });

  // GET /:id — get full contact with sub-resources
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;

    const contact = getContactFull(id);
    if (!contact) {
      return reply.code(404).send(err('CONTACT_NOT_FOUND', 'Contact not found'));
    }

    const conversationRows = sqlite.prepare(
      'SELECT cc.conversation_id FROM contact_conversations cc WHERE cc.contact_id = ?'
    ).all(id) as Array<{ conversation_id: string }>;

    const projectRows = sqlite.prepare(
      'SELECT cp.project_id FROM contact_projects cp WHERE cp.contact_id = ?'
    ).all(id) as Array<{ project_id: string }>;

    // Fetch latest AI analysis (CRM-03)
    const latestAnalysis = sqlite.prepare(`
      SELECT id, sentiment, engagement_score, churn_risk, relationship_stage,
             key_topics, last_interaction_summary, communication_style, created_at
      FROM contact_analyses
      WHERE contact_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(id) as any | undefined;

    const aiAnalysis = latestAnalysis ? {
      ...latestAnalysis,
      key_topics: JSON.parse(latestAnalysis.key_topics || '[]'),
    } : null;

    return reply.send(ok({
      contact: {
        ...contact,
        conversation_ids: conversationRows.map(r => r.conversation_id),
        project_ids: projectRows.map(r => r.project_id),
        ai_analysis: aiAnalysis,
      },
    }));
  });

  // PATCH /:id — update contact and multi-value fields (CRM-01, CRM-02)
  fastify.patch<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;

    const parsed = updateContactSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    // Verify contact exists
    const existing = sqlite.prepare('SELECT id FROM contacts WHERE id = ?').get(id);
    if (!existing) {
      return reply.code(404).send(err('CONTACT_NOT_FOUND', 'Contact not found'));
    }

    const body = parsed.data;

    sqlite.transaction(() => {
      // Build dynamic UPDATE for scalar fields
      const setClauses: string[] = ['updated_at = unixepoch(\'now\')'];
      const setParams: any[] = [];

      if (body.display_name !== undefined) {
        setClauses.push('display_name = ?');
        setParams.push(body.display_name);
      }
      if (body.first_name !== undefined) {
        setClauses.push('first_name = ?');
        setParams.push(body.first_name);
      }
      if (body.last_name !== undefined) {
        setClauses.push('last_name = ?');
        setParams.push(body.last_name);
      }
      if (body.company_id !== undefined) {
        setClauses.push('company_id = ?');
        setParams.push(body.company_id);
      }
      if (body.job_title !== undefined) {
        setClauses.push('job_title = ?');
        setParams.push(body.job_title);
      }
      if (body.notes !== undefined) {
        setClauses.push('notes = ?');
        setParams.push(body.notes);
      }

      if (setParams.length > 0 || setClauses.length > 0) {
        sqlite.prepare(
          `UPDATE contacts SET ${setClauses.join(', ')} WHERE id = ?`
        ).run(...setParams, id);
      }

      // Replace-all semantics for emails
      if (body.emails !== undefined) {
        sqlite.prepare('DELETE FROM contact_emails WHERE contact_id = ?').run(id);
        for (const email of body.emails) {
          sqlite.prepare(`
            INSERT INTO contact_emails (contact_id, value, label, is_primary) VALUES (?, ?, ?, ?)
          `).run(id, email.value, email.label, email.is_primary ? 1 : 0);
        }
      }

      // Replace-all semantics for phones
      if (body.phones !== undefined) {
        sqlite.prepare('DELETE FROM contact_phones WHERE contact_id = ?').run(id);
        for (const phone of body.phones) {
          sqlite.prepare(`
            INSERT INTO contact_phones (contact_id, value, country_code, label, is_primary) VALUES (?, ?, ?, ?, ?)
          `).run(id, phone.value, phone.country_code ?? null, phone.label, phone.is_primary ? 1 : 0);
        }
      }

      // Replace-all semantics for social
      if (body.social !== undefined) {
        sqlite.prepare('DELETE FROM contact_social WHERE contact_id = ?').run(id);
        for (const [platform, handle] of Object.entries(body.social)) {
          sqlite.prepare(`
            INSERT INTO contact_social (contact_id, platform, handle) VALUES (?, ?, ?)
          `).run(id, platform, handle);
        }
      }
    })();

    return reply.send(ok({ contact: getContactFull(id) }));
  });

  // DELETE /:id — delete contact and all sub-resources
  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;

    const existing = sqlite.prepare('SELECT id FROM contacts WHERE id = ?').get(id);
    if (!existing) {
      return reply.code(404).send(err('CONTACT_NOT_FOUND', 'Contact not found'));
    }

    sqlite.transaction(() => {
      sqlite.prepare('DELETE FROM contact_emails WHERE contact_id = ?').run(id);
      sqlite.prepare('DELETE FROM contact_phones WHERE contact_id = ?').run(id);
      sqlite.prepare('DELETE FROM contact_social WHERE contact_id = ?').run(id);
      sqlite.prepare('DELETE FROM contact_conversations WHERE contact_id = ?').run(id);
      sqlite.prepare('DELETE FROM contact_projects WHERE contact_id = ?').run(id);
      sqlite.prepare('DELETE FROM file_contacts WHERE contact_id = ?').run(id);
      sqlite.prepare('DELETE FROM contacts WHERE id = ?').run(id);
    })();

    return reply.send(ok({ deleted: true }));
  });

  // GET /:id/conversations — list conversations linked to this contact
  fastify.get<{ Params: { id: string } }>('/:id/conversations', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;

    const existing = sqlite.prepare('SELECT id FROM contacts WHERE id = ?').get(id);
    if (!existing) {
      return reply.code(404).send(err('CONTACT_NOT_FOUND', 'Contact not found'));
    }

    const conversations = sqlite.prepare(`
      SELECT c.* FROM conversations c
      JOIN contact_conversations cc ON cc.conversation_id = c.id
      WHERE cc.contact_id = ?
      ORDER BY c.created_at DESC
    `).all(id) as any[];

    return reply.send(ok({ conversations }));
  });

  // POST /:id/conversations — link a conversation to this contact
  fastify.post<{ Params: { id: string } }>('/:id/conversations', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;

    const body = request.body as { conversation_id?: string };
    if (!body?.conversation_id) {
      return reply.code(400).send(err('INVALID_INPUT', 'conversation_id is required'));
    }

    const existing = sqlite.prepare('SELECT id FROM contacts WHERE id = ?').get(id);
    if (!existing) {
      return reply.code(404).send(err('CONTACT_NOT_FOUND', 'Contact not found'));
    }

    const conv = sqlite.prepare('SELECT id FROM conversations WHERE id = ?').get(body.conversation_id);
    if (!conv) {
      return reply.code(404).send(err('CONVERSATION_NOT_FOUND', 'Conversation not found'));
    }

    sqlite.prepare(`
      INSERT OR IGNORE INTO contact_conversations (contact_id, conversation_id) VALUES (?, ?)
    `).run(id, body.conversation_id);

    return reply.code(201).send(ok({ linked: true }));
  });

  // POST /:id/projects — link a project to this contact
  fastify.post<{ Params: { id: string } }>('/:id/projects', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;

    const body = request.body as { project_id?: string };
    if (!body?.project_id) {
      return reply.code(400).send(err('INVALID_INPUT', 'project_id is required'));
    }

    const existing = sqlite.prepare('SELECT id FROM contacts WHERE id = ?').get(id);
    if (!existing) {
      return reply.code(404).send(err('CONTACT_NOT_FOUND', 'Contact not found'));
    }

    const proj = sqlite.prepare('SELECT id FROM projects WHERE id = ?').get(body.project_id);
    if (!proj) {
      return reply.code(404).send(err('PROJECT_NOT_FOUND', 'Project not found'));
    }

    sqlite.prepare(`
      INSERT OR IGNORE INTO contact_projects (contact_id, project_id) VALUES (?, ?)
    `).run(id, body.project_id);

    return reply.code(201).send(ok({ linked: true }));
  });

  // GET /:id/timeline — contact activity timeline (CRM-04)
  fastify.get<{ Params: { id: string } }>('/:id/timeline', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;
    const query = request.query as { limit?: string; offset?: string };

    const existing = sqlite.prepare('SELECT id FROM contacts WHERE id = ?').get(id);
    if (!existing) {
      return reply.code(404).send(err('CONTACT_NOT_FOUND', 'Contact not found'));
    }

    const limit = Math.min(parseInt(query.limit ?? '50', 10) || 50, 200);
    const offset = parseInt(query.offset ?? '0', 10) || 0;

    const rows = sqlite.prepare(`
      SELECT 'message' as type, CAST(m.id AS TEXT) as ref_id, m.content as detail,
             m.created_at, m.sender_type as actor
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      JOIN contact_conversations cc ON cc.conversation_id = c.id
      WHERE cc.contact_id = ?

      UNION ALL

      SELECT 'project_event' as type, p.id as ref_id, p.name as detail,
             p.created_at, 'system' as actor
      FROM contact_projects cp
      JOIN projects p ON p.id = cp.project_id
      WHERE cp.contact_id = ?

      UNION ALL

      SELECT 'file' as type, f.id as ref_id, f.filename as detail,
             fc.attached_at as created_at, f.uploaded_by as actor
      FROM files f
      JOIN file_contacts fc ON fc.file_id = f.id
      WHERE fc.contact_id = ?

      UNION ALL

      SELECT 'analysis' as type, ca.id as ref_id,
             ca.raw_json as detail, ca.created_at, 'system' as actor
      FROM contact_analyses ca
      WHERE ca.contact_id = ?

      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(id, id, id, id, limit, offset) as Array<{
      type: string;
      ref_id: string;
      detail: string | null;
      created_at: number;
      actor: string;
    }>;

    // Get total count for pagination metadata
    const totalRow = sqlite.prepare(`
      SELECT (
        (SELECT COUNT(*) FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         JOIN contact_conversations cc ON cc.conversation_id = c.id
         WHERE cc.contact_id = ?) +
        (SELECT COUNT(*) FROM contact_projects WHERE contact_id = ?) +
        (SELECT COUNT(*) FROM file_contacts WHERE contact_id = ?) +
        (SELECT COUNT(*) FROM contact_analyses WHERE contact_id = ?)
      ) as total
    `).get(id, id, id, id) as { total: number };

    return reply.send(ok({
      timeline: rows,
      total: totalRow.total,
      limit,
      offset,
    }));
  });
}
