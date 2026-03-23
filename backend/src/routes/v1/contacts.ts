import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { pool } from '../../db/client.js';
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

async function getContactFull(contactId: string) {
  const contact = (await pool.query('SELECT * FROM contacts WHERE id = $1', [contactId])).rows[0] as any;
  if (!contact) return null;

  const emails = (await pool.query(
    'SELECT id, value, label, is_primary FROM contact_emails WHERE contact_id = $1', [contactId]
  )).rows as any[];

  const phones = (await pool.query(
    'SELECT id, value, country_code, label, is_primary FROM contact_phones WHERE contact_id = $1', [contactId]
  )).rows as any[];

  const socialRows = (await pool.query(
    'SELECT id, platform, handle FROM contact_social WHERE contact_id = $1', [contactId]
  )).rows as any[];

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
    let paramIdx = 1;

    if (query.company_id) {
      conditions.push(`company_id = $${paramIdx}`);
      params.push(query.company_id);
      paramIdx++;
    }

    if (query.q) {
      const like = `%${query.q}%`;
      conditions.push(`(display_name ILIKE $${paramIdx} OR first_name ILIKE $${paramIdx + 1} OR last_name ILIKE $${paramIdx + 2})`);
      params.push(like, like, like);
      paramIdx += 3;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = ((await pool.query(
      `SELECT COUNT(*) as count FROM contacts ${where}`, params
    )).rows[0] as { count: number }).count;

    const rows = (await pool.query(
      `SELECT id FROM contacts ${where} ORDER BY display_name ASC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    )).rows as Array<{ id: string }>;

    const contacts = [];
    for (const r of rows) {
      const c = await getContactFull(r.id);
      if (c) contacts.push(c);
    }

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
      const company = (await pool.query('SELECT id FROM companies WHERE id = $1', [body.company_id])).rows[0];
      if (!company) {
        return reply.code(404).send(err('COMPANY_NOT_FOUND', 'Company not found'));
      }
    }

    const id = crypto.randomUUID();
    const createdBy = request.sessionUser!.username;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
        INSERT INTO contacts (id, display_name, first_name, last_name, company_id, job_title, notes, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
      `, [
        id,
        body.display_name,
        body.first_name ?? null,
        body.last_name ?? null,
        body.company_id ?? null,
        body.job_title ?? null,
        body.notes ?? null,
        createdBy,
      ]);

      if (body.emails) {
        for (const email of body.emails) {
          await client.query(`
            INSERT INTO contact_emails (contact_id, value, label, is_primary) VALUES ($1, $2, $3, $4)
          `, [id, email.value, email.label, email.is_primary ? 1 : 0]);
        }
      }

      if (body.phones) {
        for (const phone of body.phones) {
          await client.query(`
            INSERT INTO contact_phones (contact_id, value, country_code, label, is_primary) VALUES ($1, $2, $3, $4, $5)
          `, [id, phone.value, phone.country_code ?? null, phone.label, phone.is_primary ? 1 : 0]);
        }
      }

      if (body.social) {
        for (const [platform, handle] of Object.entries(body.social)) {
          await client.query(`
            INSERT INTO contact_social (contact_id, platform, handle) VALUES ($1, $2, $3)
          `, [id, platform, handle]);
        }
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return reply.code(201).send(ok({ contact: await getContactFull(id) }));
  });

  // POST /:id/analyze — queue AI analysis job (CRM-03)
  fastify.post<{ Params: { id: string } }>('/:id/analyze', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;
    const existing = (await pool.query('SELECT id FROM contacts WHERE id = $1', [id])).rows[0];
    if (!existing) return reply.code(404).send(err('CONTACT_NOT_FOUND', 'Contact not found'));

    const jobId = crypto.randomUUID();
    await pool.query(`
      INSERT INTO agent_jobs (id, agent_id, trigger_type, trigger_data, status, scheduled_for, created_at)
      VALUES ($1, 'system', 'contact_analysis', $2, 'pending', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
    `, [jobId, JSON.stringify({ contact_id: id })]);

    return reply.code(202).send(ok({ job_id: jobId, message: 'Analysis queued' }));
  });

  // GET /:id — get full contact with sub-resources
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;

    const contact = await getContactFull(id);
    if (!contact) {
      return reply.code(404).send(err('CONTACT_NOT_FOUND', 'Contact not found'));
    }

    const conversationRows = (await pool.query(
      'SELECT cc.conversation_id FROM contact_conversations cc WHERE cc.contact_id = $1', [id]
    )).rows as Array<{ conversation_id: string }>;

    const projectRows = (await pool.query(
      'SELECT cp.project_id FROM contact_projects cp WHERE cp.contact_id = $1', [id]
    )).rows as Array<{ project_id: string }>;

    // Fetch latest AI analysis (CRM-03)
    const latestAnalysis = (await pool.query(`
      SELECT id, sentiment, engagement_score, churn_risk, relationship_stage,
             key_topics, last_interaction_summary, communication_style, created_at
      FROM contact_analyses
      WHERE contact_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [id])).rows[0] as any | undefined;

    const aiAnalysis = latestAnalysis ? {
      ...latestAnalysis,
      key_topics: typeof latestAnalysis.key_topics === 'string' ? JSON.parse(latestAnalysis.key_topics || '[]') : (latestAnalysis.key_topics || []),
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
    const existing = (await pool.query('SELECT id FROM contacts WHERE id = $1', [id])).rows[0];
    if (!existing) {
      return reply.code(404).send(err('CONTACT_NOT_FOUND', 'Contact not found'));
    }

    const body = parsed.data;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Build dynamic UPDATE for scalar fields
      const setClauses: string[] = ['updated_at = EXTRACT(EPOCH FROM NOW())'];
      const setParams: any[] = [];
      let paramIdx = 1;

      if (body.display_name !== undefined) {
        setClauses.push(`display_name = $${paramIdx}`);
        setParams.push(body.display_name);
        paramIdx++;
      }
      if (body.first_name !== undefined) {
        setClauses.push(`first_name = $${paramIdx}`);
        setParams.push(body.first_name);
        paramIdx++;
      }
      if (body.last_name !== undefined) {
        setClauses.push(`last_name = $${paramIdx}`);
        setParams.push(body.last_name);
        paramIdx++;
      }
      if (body.company_id !== undefined) {
        setClauses.push(`company_id = $${paramIdx}`);
        setParams.push(body.company_id);
        paramIdx++;
      }
      if (body.job_title !== undefined) {
        setClauses.push(`job_title = $${paramIdx}`);
        setParams.push(body.job_title);
        paramIdx++;
      }
      if (body.notes !== undefined) {
        setClauses.push(`notes = $${paramIdx}`);
        setParams.push(body.notes);
        paramIdx++;
      }

      if (setParams.length > 0 || setClauses.length > 0) {
        await client.query(
          `UPDATE contacts SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
          [...setParams, id]
        );
      }

      // Replace-all semantics for emails
      if (body.emails !== undefined) {
        await client.query('DELETE FROM contact_emails WHERE contact_id = $1', [id]);
        for (const email of body.emails) {
          await client.query(`
            INSERT INTO contact_emails (contact_id, value, label, is_primary) VALUES ($1, $2, $3, $4)
          `, [id, email.value, email.label, email.is_primary ? 1 : 0]);
        }
      }

      // Replace-all semantics for phones
      if (body.phones !== undefined) {
        await client.query('DELETE FROM contact_phones WHERE contact_id = $1', [id]);
        for (const phone of body.phones) {
          await client.query(`
            INSERT INTO contact_phones (contact_id, value, country_code, label, is_primary) VALUES ($1, $2, $3, $4, $5)
          `, [id, phone.value, phone.country_code ?? null, phone.label, phone.is_primary ? 1 : 0]);
        }
      }

      // Replace-all semantics for social
      if (body.social !== undefined) {
        await client.query('DELETE FROM contact_social WHERE contact_id = $1', [id]);
        for (const [platform, handle] of Object.entries(body.social)) {
          await client.query(`
            INSERT INTO contact_social (contact_id, platform, handle) VALUES ($1, $2, $3)
          `, [id, platform, handle]);
        }
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return reply.send(ok({ contact: await getContactFull(id) }));
  });

  // DELETE /:id — delete contact and all sub-resources
  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;

    const existing = (await pool.query('SELECT id FROM contacts WHERE id = $1', [id])).rows[0];
    if (!existing) {
      return reply.code(404).send(err('CONTACT_NOT_FOUND', 'Contact not found'));
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM contact_emails WHERE contact_id = $1', [id]);
      await client.query('DELETE FROM contact_phones WHERE contact_id = $1', [id]);
      await client.query('DELETE FROM contact_social WHERE contact_id = $1', [id]);
      await client.query('DELETE FROM contact_conversations WHERE contact_id = $1', [id]);
      await client.query('DELETE FROM contact_projects WHERE contact_id = $1', [id]);
      await client.query('DELETE FROM file_contacts WHERE contact_id = $1', [id]);
      await client.query('DELETE FROM contacts WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return reply.send(ok({ deleted: true }));
  });

  // GET /:id/conversations — list conversations linked to this contact
  fastify.get<{ Params: { id: string } }>('/:id/conversations', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;

    const existing = (await pool.query('SELECT id FROM contacts WHERE id = $1', [id])).rows[0];
    if (!existing) {
      return reply.code(404).send(err('CONTACT_NOT_FOUND', 'Contact not found'));
    }

    const conversations = (await pool.query(`
      SELECT c.* FROM conversations c
      JOIN contact_conversations cc ON cc.conversation_id = c.id
      WHERE cc.contact_id = $1
      ORDER BY c.created_at DESC
    `, [id])).rows as any[];

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

    const existing = (await pool.query('SELECT id FROM contacts WHERE id = $1', [id])).rows[0];
    if (!existing) {
      return reply.code(404).send(err('CONTACT_NOT_FOUND', 'Contact not found'));
    }

    const conv = (await pool.query('SELECT id FROM conversations WHERE id = $1', [body.conversation_id])).rows[0];
    if (!conv) {
      return reply.code(404).send(err('CONVERSATION_NOT_FOUND', 'Conversation not found'));
    }

    await pool.query(`
      INSERT INTO contact_conversations (contact_id, conversation_id) VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [id, body.conversation_id]);

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

    const existing = (await pool.query('SELECT id FROM contacts WHERE id = $1', [id])).rows[0];
    if (!existing) {
      return reply.code(404).send(err('CONTACT_NOT_FOUND', 'Contact not found'));
    }

    const proj = (await pool.query('SELECT id FROM projects WHERE id = $1', [body.project_id])).rows[0];
    if (!proj) {
      return reply.code(404).send(err('PROJECT_NOT_FOUND', 'Project not found'));
    }

    await pool.query(`
      INSERT INTO contact_projects (contact_id, project_id) VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [id, body.project_id]);

    return reply.code(201).send(ok({ linked: true }));
  });

  // GET /:id/timeline — contact activity timeline (CRM-04)
  fastify.get<{ Params: { id: string } }>('/:id/timeline', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;
    const query = request.query as { limit?: string; offset?: string };

    const existing = (await pool.query('SELECT id FROM contacts WHERE id = $1', [id])).rows[0];
    if (!existing) {
      return reply.code(404).send(err('CONTACT_NOT_FOUND', 'Contact not found'));
    }

    const limit = Math.min(parseInt(query.limit ?? '50', 10) || 50, 200);
    const offset = parseInt(query.offset ?? '0', 10) || 0;

    const rows = (await pool.query(`
      SELECT 'message' as type, CAST(m.id AS TEXT) as ref_id, m.content as detail,
             m.created_at, m.sender_type as actor
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      JOIN contact_conversations cc ON cc.conversation_id = c.id
      WHERE cc.contact_id = $1

      UNION ALL

      SELECT 'project_event' as type, p.id as ref_id, p.name as detail,
             p.created_at, 'system' as actor
      FROM contact_projects cp
      JOIN projects p ON p.id = cp.project_id
      WHERE cp.contact_id = $2

      UNION ALL

      SELECT 'file' as type, f.id as ref_id, f.filename as detail,
             fc.attached_at as created_at, f.uploaded_by as actor
      FROM files f
      JOIN file_contacts fc ON fc.file_id = f.id
      WHERE fc.contact_id = $3

      UNION ALL

      SELECT 'analysis' as type, ca.id as ref_id,
             ca.raw_json as detail, ca.created_at, 'system' as actor
      FROM contact_analyses ca
      WHERE ca.contact_id = $4

      ORDER BY created_at DESC
      LIMIT $5 OFFSET $6
    `, [id, id, id, id, limit, offset])).rows as Array<{
      type: string;
      ref_id: string;
      detail: string | null;
      created_at: number;
      actor: string;
    }>;

    // Get total count for pagination metadata
    const totalRow = (await pool.query(`
      SELECT (
        (SELECT COUNT(*) FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         JOIN contact_conversations cc ON cc.conversation_id = c.id
         WHERE cc.contact_id = $1) +
        (SELECT COUNT(*) FROM contact_projects WHERE contact_id = $2) +
        (SELECT COUNT(*) FROM file_contacts WHERE contact_id = $3) +
        (SELECT COUNT(*) FROM contact_analyses WHERE contact_id = $4)
      ) as total
    `, [id, id, id, id])).rows[0] as { total: number };

    return reply.send(ok({
      timeline: rows,
      total: totalRow.total,
      limit,
      offset,
    }));
  });
}
