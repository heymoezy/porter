import { FastifyInstance } from 'fastify';
import oauth2, { OAuth2Namespace } from '@fastify/oauth2';
import { encryptCredential } from '../../lib/credential-crypto.js';
import { config } from '../../config.js';
import { pool } from '../../db/client.js';
import { emitSSE } from '../../services/scheduler.js';
import crypto from 'crypto';
import { err } from '../../lib/envelope.js';

// Extend FastifyInstance with the googleOAuth2 namespace added by plugin registration
declare module 'fastify' {
  interface FastifyInstance {
    googleOAuth2: OAuth2Namespace;
  }
}

/**
 * Insert or update a workspace_connections row for a given provider.
 * workspace_connections has no UNIQUE on provider, so we use SELECT + INSERT/UPDATE.
 */
async function upsertConnection(
  provider: string,
  displayName: string,
  encryptedMeta: string,
  now: number
): Promise<void> {
  const existing = (await pool.query(
    `SELECT id FROM workspace_connections WHERE provider = $1 LIMIT 1`,
    [provider]
  )).rows[0] as { id: string } | undefined;

  if (existing) {
    await pool.query(`
      UPDATE workspace_connections
      SET status = 'connected',
          display_name = $1,
          meta_json = $2,
          meta_encrypted = 1,
          updated_at = $3
      WHERE id = $4
    `, [displayName, encryptedMeta, now, existing.id]);
  } else {
    await pool.query(`
      INSERT INTO workspace_connections
        (id, provider, kind, status, display_name, meta_json, meta_encrypted, created_at, updated_at)
      VALUES
        ($1, $2, 'oauth2', 'connected', $3, $4, 1, $5, $6)
    `, [crypto.randomUUID(), provider, displayName, encryptedMeta, now, now]);
  }
}

export default async function oauthGoogleRoutes(fastify: FastifyInstance) {
  // Guard: skip OAuth2 plugin registration if Google OAuth is not configured
  if (!process.env.GOOGLE_CLIENT_ID) {
    fastify.get('/start', async (_request, reply) => {
      return reply.code(400).send(err('GOOGLE_NOT_CONFIGURED', 'Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars'));
    });
    fastify.get('/callback', async (_request, reply) => {
      return reply.code(400).send(err('GOOGLE_NOT_CONFIGURED', 'Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars'));
    });
    return;
  }

  // Register @fastify/oauth2 for Google with combined email + calendar scopes
  fastify.register(oauth2, {
    name: 'googleOAuth2',
    credentials: {
      client: {
        id: process.env.GOOGLE_CLIENT_ID ?? '',
        secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      },
      auth: oauth2.GOOGLE_CONFIGURATION,
    },
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://mail.google.com/', // IMAP access scope
      'openid',
      'email',
      'profile',
    ],
    startRedirectPath: '/start',
    callbackUri: `${config.publicUrl}/api/v1/oauth/google/callback`,
    callbackUriParams: {
      access_type: 'offline', // request refresh_token from Google
      prompt: 'consent',      // force consent screen to always get refresh_token
    },
  });

  // OAuth2 callback — stores tokens for both email and google_calendar connections
  fastify.get('/callback', async (request, reply) => {
    try {
      const { token } = await fastify.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);

      const accessToken = token.access_token as string;
      const refreshToken = (token.refresh_token as string) ?? '';
      const expiresIn = (token.expires_in as number) ?? 3600;
      const expiresAt = Date.now() + expiresIn * 1000;

      // Fetch Google user info to get email address
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userInfoResponse.ok) {
        throw new Error(`Failed to fetch Google user info: ${userInfoResponse.status}`);
      }

      const userInfo = await userInfoResponse.json() as { email?: string };
      const userEmail = userInfo.email ?? 'unknown@gmail.com';

      // Encrypt credentials — both email and calendar share the same Google token
      const encryptedMeta = encryptCredential(
        JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAt,
          email: userEmail,
        })
      );

      const now = Math.floor(Date.now() / 1000);

      // Upsert email connection (provider='email')
      await upsertConnection('email', userEmail, encryptedMeta, now);

      // Upsert google_calendar connection (same token grants calendar access)
      await upsertConnection('google_calendar', userEmail, encryptedMeta, now);

      // Emit SSE to notify clients both connections are now active
      await emitSSE('connection:status', {
        provider: 'email',
        status: 'connected',
        display_name: userEmail,
      }).catch(() => {});

      await emitSSE('connection:status', {
        provider: 'google_calendar',
        status: 'connected',
        display_name: userEmail,
      }).catch(() => {});

      // Tranche 12: IMAP IDLE auto-start removed. Gmail is a connector, not the primary mail system.
      // Tokens are stored above for the Gmail connector + Google Calendar. No IMAP listener needed.

      return reply.redirect(`/v2/?tab=connections&connected=google`);
    } catch (err) {
      console.error('[oauth-google] callback error:', err);
      return reply.redirect(`/v2/?tab=connections&error=google_auth_failed`);
    }
  });
}
