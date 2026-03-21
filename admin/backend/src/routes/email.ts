import { FastifyInstance } from 'fastify';
import { ok, err } from '../lib/envelope.js';
import { sqlite } from '../db/client.js';
import { config } from '../config.js';

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

  // GET /api/admin/email/config — read SMTP config
  fastify.get('/config', async () => {
    const smtpHost = getSetting('smtp_host') || config.smtp.host;
    const smtpPort = getSetting('smtp_port') || String(config.smtp.port);
    const smtpUser = getSetting('smtp_user') || config.smtp.user;
    const fromName = getSetting('smtp_from_name') || config.smtp.fromName;
    const fromEmail = getSetting('smtp_from_email') || config.smtp.fromEmail;
    const replyTo = getSetting('smtp_reply_to') || config.smtp.replyTo;
    const configured = !!(smtpHost && smtpUser);

    return ok({
      configured,
      host: smtpHost,
      port: parseInt(smtpPort) || 587,
      user: smtpUser,
      hasPassword: !!(getSetting('smtp_pass') || config.smtp.pass),
      fromName,
      fromEmail,
      replyTo,
    });
  });

  // PUT /api/admin/email/config — save SMTP config
  fastify.put('/config', async (req) => {
    const body = req.body as Record<string, string>;
    const fields = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from_name', 'smtp_from_email', 'smtp_reply_to'];
    for (const field of fields) {
      if (body[field] !== undefined) {
        setSetting(field, body[field]);
      }
    }
    return ok({ saved: true });
  });

  // GET /api/admin/email/queue — email queue stats
  fastify.get('/queue', async () => {
    // Check if email_queue table exists
    try {
      const stats = sqlite.prepare(`
        SELECT
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
        FROM email_queue
      `).get() as { pending: number; sent: number; failed: number };

      const recent = sqlite.prepare(`
        SELECT id, to_email, subject, status, error, created_at, sent_at
        FROM email_queue ORDER BY created_at DESC LIMIT 20
      `).all() as Array<{
        id: number; to_email: string; subject: string;
        status: string; error: string | null; created_at: number; sent_at: number | null;
      }>;

      return ok({ ...stats, recent });
    } catch {
      // Table doesn't exist yet
      return ok({ pending: 0, sent: 0, failed: 0, recent: [] });
    }
  });

  // POST /api/admin/email/test — send test email
  fastify.post('/test', async (req) => {
    const { to } = req.body as { to: string };
    if (!to) return err('MISSING_TO', 'Recipient email required');

    // TODO: Wire to nodemailer when SMTP is configured
    return ok({ sent: false, message: 'SMTP not yet wired — config saved, sending not implemented' });
  });
}
