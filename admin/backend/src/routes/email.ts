import { FastifyInstance } from 'fastify';
import { ok, err } from '../lib/envelope.js';
import { sqlite } from '../db/client.js';
import { config } from '../config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getSetting(key: string): string | null {
  try {
    const row = sqlite.prepare('SELECT value FROM workspace_settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch { return null; }
}

function setSetting(key: string, value: string) {
  sqlite.prepare('INSERT OR REPLACE INTO workspace_settings (key, value) VALUES (?, ?)').run(key, value);
}

export default async function emailRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/email/config — SMTP settings (for Settings page)
  fastify.get('/config', async () => {
    const smtpHost = getSetting('smtp_host') || config.smtp.host;
    const smtpPort = getSetting('smtp_port') || String(config.smtp.port);
    const smtpUser = getSetting('smtp_user') || config.smtp.user;
    const fromName = getSetting('smtp_from_name') || config.smtp.fromName;
    const fromEmail = getSetting('smtp_from_email') || config.smtp.fromEmail;
    const replyTo = getSetting('smtp_reply_to') || config.smtp.replyTo;
    return ok({
      configured: !!(smtpHost && smtpUser),
      host: smtpHost, port: parseInt(smtpPort) || 587, user: smtpUser,
      hasPassword: !!(getSetting('smtp_pass') || config.smtp.pass),
      fromName, fromEmail, replyTo,
    });
  });

  // PUT /api/admin/email/config — save SMTP settings
  fastify.put('/config', async (req) => {
    const body = req.body as Record<string, string>;
    for (const field of ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from_name', 'smtp_from_email', 'smtp_reply_to']) {
      if (body[field] !== undefined) setSetting(field, body[field]);
    }
    return ok({ saved: true });
  });

  // GET /api/admin/email/messages — list messages by folder
  fastify.get('/messages', async (req) => {
    const { folder = 'inbox', limit = '50' } = req.query as Record<string, string>;
    try {
      const messages = sqlite.prepare(`
        SELECT id, folder, from_email, from_name, to_email, to_name, subject, status,
               sent_at, read_at, created_at, updated_at,
               substr(body, 1, 200) as preview
        FROM email_messages
        WHERE folder = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(folder, parseInt(limit) || 50) as Array<Record<string, unknown>>;

      const counts = sqlite.prepare(`
        SELECT folder, count(*) as cnt FROM email_messages GROUP BY folder
      `).all() as Array<{ folder: string; cnt: number }>;
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
    const msg = sqlite.prepare('SELECT * FROM email_messages WHERE id = ?').get(id);
    if (!msg) { reply.status(404); return err('NOT_FOUND', 'Message not found'); }
    // Mark as read
    sqlite.prepare("UPDATE email_messages SET read_at = unixepoch('now') WHERE id = ? AND read_at IS NULL").run(id);
    return ok(msg);
  });

  // POST /api/admin/email/messages — create/send message
  fastify.post('/messages', async (req) => {
    const { from_email, from_name, to_email, to_name, subject, body, body_html, folder = 'drafts', send } = req.body as Record<string, string>;
    const fromEmail = from_email || getSetting('smtp_from_email') || config.smtp.fromEmail || 'porter@askporter.app';
    const fromName = from_name || getSetting('smtp_from_name') || config.smtp.fromName || 'Porter';

    const targetFolder = send === 'true' ? 'sent' : folder;
    const status = send === 'true' ? 'sent' : 'draft';
    const sentAt = send === 'true' ? Date.now() / 1000 : null;

    const result = sqlite.prepare(`
      INSERT INTO email_messages (folder, from_email, from_name, to_email, to_name, subject, body, body_html, status, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(targetFolder, fromEmail, fromName, to_email || '', to_name || '', subject || '', body || '', body_html || '', status, sentAt);

    return ok({ id: result.lastInsertRowid, folder: targetFolder, status });
  });

  // PUT /api/admin/email/messages/:id — update message (draft editing, move folder)
  fastify.put('/messages/:id', async (req) => {
    const { id } = req.params as { id: string };
    const updates = req.body as Record<string, string>;
    const allowed = ['to_email', 'to_name', 'subject', 'body', 'body_html', 'folder', 'status'];
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (allowed.includes(k)) { sets.push(`${k} = ?`); vals.push(v); }
    }
    if (sets.length === 0) return ok({ updated: false });
    sets.push("updated_at = unixepoch('now')");
    vals.push(id);
    sqlite.prepare(`UPDATE email_messages SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return ok({ updated: true, id });
  });

  // DELETE /api/admin/email/messages/:id — move to trash or hard delete
  fastify.delete('/messages/:id', async (req) => {
    const { id } = req.params as { id: string };
    const msg = sqlite.prepare('SELECT folder FROM email_messages WHERE id = ?').get(id) as { folder: string } | undefined;
    if (!msg) return ok({ deleted: false });
    if (msg.folder === 'trash') {
      sqlite.prepare('DELETE FROM email_messages WHERE id = ?').run(id);
      return ok({ deleted: true, permanent: true });
    }
    sqlite.prepare("UPDATE email_messages SET folder = 'trash', updated_at = unixepoch('now') WHERE id = ?").run(id);
    return ok({ deleted: true, permanent: false });
  });

  // GET /api/admin/email/changelog — serve CHANGELOG.md as release notes
  fastify.get('/changelog', async () => {
    try {
      const changelogPath = path.resolve(__dirname, '../../../../CHANGELOG.md');
      const content = fs.readFileSync(changelogPath, 'utf-8');
      return ok({ content });
    } catch {
      return ok({ content: '# No release notes found' });
    }
  });
}
