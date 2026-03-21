import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import oauth2, { OAuth2Namespace } from '@fastify/oauth2';
import { encryptCredential } from '../../lib/credential-crypto.js';
import { config } from '../../config.js';
import { sqlite } from '../../db/client.js';
import { emitSSE } from '../../services/scheduler.js';
import crypto from 'crypto';
import { err } from '../../lib/envelope.js';

// Extend FastifyInstance with the githubOAuth2 namespace added by plugin registration
declare module 'fastify' {
  interface FastifyInstance {
    githubOAuth2: OAuth2Namespace;
  }
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export default async function oauthGithubRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions,
) {
  // Guard: if GITHUB_CLIENT_ID is not set, register a stub /start that returns 400
  if (!process.env.GITHUB_CLIENT_ID) {
    fastify.get('/start', async (_request, reply) => {
      return reply.code(400).send(err('GITHUB_NOT_CONFIGURED', 'GitHub OAuth not configured — set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET env vars'));
    });
    return;
  }

  // Register @fastify/oauth2 plugin for GitHub
  await fastify.register(oauth2, {
    name: 'githubOAuth2',
    credentials: {
      client: {
        id: process.env.GITHUB_CLIENT_ID ?? '',
        secret: process.env.GITHUB_CLIENT_SECRET ?? '',
      },
      auth: oauth2.GITHUB_CONFIGURATION,
    },
    scope: ['repo', 'read:user'],
    startRedirectPath: '/start',
    callbackUri: `${config.publicUrl}/api/v1/oauth/github/callback`,
  });

  // ── GET /callback — handle GitHub OAuth2 callback ───────────────────────────
  fastify.get('/callback', async (request, reply) => {
    try {
      // Exchange authorization code for access token
      const tokenResult = await fastify.githubOAuth2!.getAccessTokenFromAuthorizationCodeFlow(request);
      const access_token: string = tokenResult.token.access_token;
      const refresh_token: string | undefined = tokenResult.token.refresh_token;

      // Fetch GitHub user info to get the username
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'User-Agent': 'Porter-App/1.0',
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!userResponse.ok) {
        throw new Error(`GitHub user fetch failed: ${userResponse.status}`);
      }

      const userData = await userResponse.json() as { login: string; name?: string };
      const githubUsername: string = userData.login;

      // Encrypt credentials — never store tokens in plaintext
      const encryptedCreds = encryptCredential(
        JSON.stringify({ access_token, refresh_token, github_username: githubUsername }),
      );

      // Check if a github connection already exists to reuse the same id
      const existing = sqlite.prepare(
        "SELECT id FROM workspace_connections WHERE provider = 'github' LIMIT 1",
      ).get() as { id: string } | undefined;

      const connectionId = existing?.id ?? crypto.randomUUID();
      const displayName = githubUsername;

      // Upsert into workspace_connections
      sqlite.prepare(`
        INSERT OR REPLACE INTO workspace_connections
          (id, provider, kind, status, display_name, meta_json, meta_encrypted, installed_by, scopes_json, updated_at)
        VALUES
          (@id, 'github', 'oauth2', 'connected', @displayName, @metaJson, 1, @installedBy, '["repo","read:user"]', unixepoch('now'))
      `).run({
        id: connectionId,
        displayName,
        metaJson: encryptedCreds,
        installedBy: githubUsername,
      });

      // Emit SSE notification — best-effort, never block response
      emitSSE('connection:status', {
        provider: 'github',
        status: 'connected',
        display_name: githubUsername,
      }).catch(() => {
        // Best-effort
      });

      // Redirect back to SPA connections tab
      return reply.redirect('/v2/?tab=connections&connected=github');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      fastify.log.error({ error: message }, 'GitHub OAuth callback failed');
      return reply.redirect('/v2/?tab=connections&error=github_auth_failed');
    }
  });
}
