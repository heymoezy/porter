import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { pool } from '../db/client.js';
import { config } from '../config.js';

// ── SMTP Config ──────────────────────────────────────────────────────────────

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

async function getSetting(key: string): Promise<string | null> {
  try {
    const row = (await pool.query('SELECT value FROM workspace_settings WHERE key = $1', [key])).rows[0] as { value: string } | undefined;
    return row?.value ?? null;
  } catch { return null; }
}

async function getSmtpConfig(): Promise<SmtpConfig | null> {
  // Read from workspace_settings (admin SMTP config UI), fall back to env vars
  const host = await getSetting('smtp_host') || process.env.SMTP_HOST || '';
  const port = parseInt(await getSetting('smtp_port') || process.env.SMTP_PORT || '587');
  const user = await getSetting('smtp_user') || process.env.SMTP_USER || '';
  const pass = await getSetting('smtp_pass') || process.env.SMTP_PASS || '';
  const fromName = await getSetting('smtp_from_name') || process.env.SMTP_FROM_NAME || 'Porter';
  const fromEmail = await getSetting('smtp_from_email') || process.env.SMTP_FROM_EMAIL || '';

  if (!host || !user || !pass || !fromEmail) return null;
  return { host, port, user, pass, fromName, fromEmail };
}

// ── Transport (lazy init) ────────────────────────────────────────────────────

let transport: Transporter | null = null;
let lastConfigHash = '';

async function getTransport(): Promise<Transporter | null> {
  const cfg = await getSmtpConfig();
  if (!cfg) return null;

  const hash = `${cfg.host}:${cfg.port}:${cfg.user}`;
  if (transport && hash === lastConfigHash) return transport;

  transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  lastConfigHash = hash;
  return transport;
}

// ── Send Functions ───────────────────────────────────────────────────────────

async function sendEmailInternal(to: string, subject: string, html: string): Promise<boolean> {
  const cfg = await getSmtpConfig();
  const mailer = await getTransport();

  if (!mailer || !cfg) {
    // Dev fallback: no SMTP configured
    console.log(`[email-dev] Would send to ${to}: ${subject}`);
    return false;
  }

  await mailer.sendMail({
    from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
    to,
    subject,
    html,
  });
  return true;
}

export async function sendVerificationCode(email: string, code: string): Promise<void> {
  const sent = await sendEmailInternal(email, `${code} is your Porter verification code`, `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 440px; margin: 0 auto; padding: 32px 0;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="margin: 0; font-size: 20px; color: #1a1a2e;">Verify your email</h2>
      </div>
      <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; text-align: center;">
        <p style="margin: 0 0 16px; color: #555; font-size: 14px;">Enter this code to complete your registration:</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #6366f1; font-family: monospace;">${code}</div>
        <p style="margin: 16px 0 0; color: #888; font-size: 12px;">This code expires in 15 minutes.</p>
      </div>
      <p style="text-align: center; color: #aaa; font-size: 11px; margin-top: 24px;">
        If you didn't create a Porter account, ignore this email.
      </p>
    </div>
  `);

  if (!sent) {
    console.log(`[email-dev] Verification code for ${email}: ${code}`);
  }
}

export async function sendPasswordResetCode(email: string, code: string): Promise<void> {
  const sent = await sendEmailInternal(email, `${code} is your Porter password reset code`, `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 440px; margin: 0 auto; padding: 32px 0;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="margin: 0; font-size: 20px; color: #1a1a2e;">Reset your password</h2>
      </div>
      <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; text-align: center;">
        <p style="margin: 0 0 16px; color: #555; font-size: 14px;">Enter this code to reset your password:</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #6366f1; font-family: monospace;">${code}</div>
        <p style="margin: 16px 0 0; color: #888; font-size: 12px;">This code expires in 15 minutes.</p>
      </div>
      <p style="text-align: center; color: #aaa; font-size: 11px; margin-top: 24px;">
        If you didn't request a password reset, ignore this email.
      </p>
    </div>
  `);

  if (!sent) {
    console.log(`[email-dev] Password reset code for ${email}: ${code}`);
  }
}

// ── Collaboration Invite Emails ──────────────────────────────────────────────

export async function sendInviteEmail(opts: {
  to: string;
  projectName: string;
  inviterName: string;
  role: string;
  token: string;
}): Promise<boolean> {
  const { to, projectName, inviterName, role, token } = opts;
  const publicUrl = config.publicUrl || 'http://localhost:5174';
  const acceptUrl = `${publicUrl}/accept-invite?token=${token}`;
  const subject = `${inviterName} invited you to "${projectName}" on Porter`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px;">You've been invited</h2>
      <p><strong>${inviterName}</strong> invited you to join <strong>${projectName}</strong> as a <strong>${role}</strong>.</p>
      <a href="${acceptUrl}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">Accept Invitation</a>
      <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">Or copy this link: ${acceptUrl}</p>
    </div>
  `;
  const sent = await sendEmailInternal(to, subject, html);
  if (!sent) {
    console.log(`[email-dev] Invite for ${to}: ${acceptUrl}`);
  }
  return sent;
}

export async function sendDripReminder(opts: {
  to: string;
  projectName: string;
  inviterName: string;
  role: string;
  token: string;
  dripCount: number;
}): Promise<boolean> {
  const { to, projectName, inviterName, role, token, dripCount } = opts;
  const publicUrl = config.publicUrl || 'http://localhost:5174';
  const acceptUrl = `${publicUrl}/accept-invite?token=${token}`;
  const subject = `Reminder: You're invited to "${projectName}" on Porter`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px;">Friendly reminder</h2>
      <p><strong>${inviterName}</strong> invited you to join <strong>${projectName}</strong> as a <strong>${role}</strong>. Your invite is still waiting.</p>
      <a href="${acceptUrl}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">Accept Invitation</a>
      <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">Or copy this link: ${acceptUrl}</p>
    </div>
  `;
  const sent = await sendEmailInternal(to, subject, html);
  if (!sent) {
    console.log(`[email-dev] Drip reminder #${dripCount + 1} for ${to}: ${acceptUrl}`);
  }
  return sent;
}

// ── Token Helpers ────────────────────────────────────────────────────────────

export function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

export async function createAuthToken(email: string, purpose: string, ttlMinutes = 15): Promise<string> {
  const code = generateCode();
  const expiresAt = Date.now() / 1000 + ttlMinutes * 60;

  // Invalidate prior unused tokens for this email + purpose
  await pool.query(`
    UPDATE auth_tokens SET used_at = EXTRACT(EPOCH FROM NOW())
    WHERE email = $1 AND purpose = $2 AND used_at IS NULL
  `, [email, purpose]);

  await pool.query(`
    INSERT INTO auth_tokens (email, code, purpose, expires_at)
    VALUES ($1, $2, $3, $4)
  `, [email, code, purpose, expiresAt]);

  return code;
}

export async function verifyAuthToken(email: string, code: string, purpose: string): Promise<boolean> {
  const now = Date.now() / 1000;

  const token = (await pool.query(`
    SELECT id FROM auth_tokens
    WHERE email = $1 AND code = $2 AND purpose = $3 AND used_at IS NULL AND expires_at > $4
    ORDER BY created_at DESC LIMIT 1
  `, [email, code, purpose, now])).rows[0] as { id: number } | undefined;

  if (!token) return false;

  // Mark as used
  await pool.query(`UPDATE auth_tokens SET used_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $1`, [token.id]);
  return true;
}
