import { FastifyInstance } from 'fastify';
import { ok, err } from '../../lib/admin-envelope.js';
import { getSetting, setSetting } from '../../lib/workspace-settings.js';
import { queryOne, queryAll, execute } from '../../db/pg-helpers.js';
import { config } from '../../config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function emailRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/email/config — SMTP settings (for Settings page)
  fastify.get('/config', async () => {
    const smtpHost = (await getSetting('smtp_host')) || config.smtp.host;
    const smtpPort = (await getSetting('smtp_port')) || String(config.smtp.port);
    const smtpUser = (await getSetting('smtp_user')) || config.smtp.user;
    const fromName = (await getSetting('smtp_from_name')) || config.smtp.fromName;
    const fromEmail = (await getSetting('smtp_from_email')) || config.smtp.fromEmail;
    const replyTo = (await getSetting('smtp_reply_to')) || config.smtp.replyTo;
    return ok({
      configured: !!(smtpHost && smtpUser),
      host: smtpHost, port: parseInt(smtpPort) || 587, user: smtpUser,
      hasPassword: !!((await getSetting('smtp_pass')) || config.smtp.pass),
      fromName, fromEmail, replyTo,
    });
  });

  // PUT /api/admin/email/config — save SMTP settings
  fastify.put('/config', async (req) => {
    const body = req.body as Record<string, string>;
    for (const field of ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from_name', 'smtp_from_email', 'smtp_reply_to']) {
      if (body[field] !== undefined) await setSetting(field, body[field]);
    }
    return ok({ saved: true });
  });

  // GET /api/admin/email/messages — list messages by folder
  fastify.get('/messages', async (req) => {
    const { folder = 'inbox', limit = '50' } = req.query as Record<string, string>;
    try {
      const messages = await queryAll(
        `SELECT id, folder, from_email, from_name, to_email, to_name, subject, status,
                sent_at, read_at, created_at, updated_at,
                left(body, 200) as preview
         FROM email_messages
         WHERE folder = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [folder, parseInt(limit) || 50]
      );

      const counts = await queryAll<{ folder: string; cnt: number }>(
        'SELECT folder, count(*)::int as cnt FROM email_messages GROUP BY folder'
      );
      const folderCounts: Record<string, number> = {};
      for (const c of counts) folderCounts[c.folder] = c.cnt;

      return ok({ messages, folderCounts, folder });
    } catch {
      return ok({ messages: [], folderCounts: {}, folder });
    }
  });

  // GET /api/admin/email/messages/:id — single message
  fastify.get('/messages/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const msg = await queryOne('SELECT * FROM email_messages WHERE id = $1', [id]);
    if (!msg) { reply.status(404); return err('NOT_FOUND', 'Message not found'); }
    // Mark as read
    await execute(
      "UPDATE email_messages SET read_at = EXTRACT(epoch FROM now()) WHERE id = $1 AND read_at IS NULL",
      [id]
    );
    return ok(msg);
  });

  // POST /api/admin/email/messages — create/send message
  fastify.post('/messages', async (req) => {
    const { from_email, from_name, to_email, to_name, subject, body, body_html, folder = 'drafts', send } = req.body as Record<string, string>;
    const fromEmail = from_email || (await getSetting('smtp_from_email')) || config.smtp.fromEmail || 'porter@askporter.app';
    const fromName = from_name || (await getSetting('smtp_from_name')) || config.smtp.fromName || 'Porter';

    const targetFolder = send === 'true' ? 'sent' : folder;
    const status = send === 'true' ? 'sent' : 'draft';
    const sentAt = send === 'true' ? Date.now() / 1000 : null;

    const row = await queryOne<{ id: number }>(`
      INSERT INTO email_messages (folder, from_email, from_name, to_email, to_name, subject, body, body_html, status, sent_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [targetFolder, fromEmail, fromName, to_email || '', to_name || '', subject || '', body || '', body_html || '', status, sentAt]);

    return ok({ id: row?.id, folder: targetFolder, status });
  });

  // PUT /api/admin/email/messages/:id — update message (draft editing, move folder)
  fastify.put('/messages/:id', async (req) => {
    const { id } = req.params as { id: string };
    const updates = req.body as Record<string, string>;
    const allowed = ['to_email', 'to_name', 'subject', 'body', 'body_html', 'folder', 'status'];
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const [k, v] of Object.entries(updates)) {
      if (allowed.includes(k)) { sets.push(`${k} = $${idx}`); vals.push(v); idx++; }
    }
    if (sets.length === 0) return ok({ updated: false });
    sets.push(`updated_at = EXTRACT(epoch FROM now())`);
    vals.push(id);
    await execute(`UPDATE email_messages SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
    return ok({ updated: true, id });
  });

  // DELETE /api/admin/email/messages/:id — move to trash or hard delete
  fastify.delete('/messages/:id', async (req) => {
    const { id } = req.params as { id: string };
    const msg = await queryOne<{ folder: string }>('SELECT folder FROM email_messages WHERE id = $1', [id]);
    if (!msg) return ok({ deleted: false });
    if (msg.folder === 'trash') {
      await execute('DELETE FROM email_messages WHERE id = $1', [id]);
      return ok({ deleted: true, permanent: true });
    }
    await execute("UPDATE email_messages SET folder = 'trash', updated_at = EXTRACT(epoch FROM now()) WHERE id = $1", [id]);
    return ok({ deleted: true, permanent: false });
  });

  // GET /api/admin/email/changelog — serve CHANGELOG.md as release notes
  fastify.get('/changelog', async () => {
    try {
      // Try multiple paths since __dirname varies with tsx vs compiled
      const candidates = [
        path.resolve(__dirname, '../../../CHANGELOG.md'),
        path.resolve(__dirname, '../../CHANGELOG.md'),
        path.resolve(__dirname, '../../../CHANGELOG.md'),
        path.resolve(process.cwd(), 'CHANGELOG.md'),
        path.resolve(process.cwd(), '../CHANGELOG.md'),
      ];
      let changelogPath = '';
      for (const p of candidates) {
        if (fs.existsSync(p)) { changelogPath = p; break; }
      }
      if (!changelogPath) return ok({ content: '# No release notes found' });
      const content = fs.readFileSync(changelogPath, 'utf-8');
      return ok({ content });
    } catch {
      return ok({ content: '# No release notes found' });
    }
  });
}
