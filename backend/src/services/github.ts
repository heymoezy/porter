/**
 * GitHub Service
 *
 * Octokit wrapper providing repo operations for agents.
 * Credentials are decrypted from workspace_connections at call time — never cached.
 *
 * Exported functions:
 *   getGitHubClient  — resolve Octokit instance from stored connection
 *   listRepos        — list repos for the authenticated user
 *   readFile         — read a file from a repo (returns decoded content + sha)
 *   createBranch     — create a new branch from a source ref
 *   createPullRequest — open a PR between two branches
 *
 * Each function accepts an optional `connectionId` to support project-level
 * overrides (different GitHub account per project). When omitted, the first
 * connected GitHub account in workspace_connections is used.
 *
 * 401 errors are treated as credential expiry: the connection status is updated
 * to 'needs_reauth' and an SSE event is emitted so the UI can prompt reconnection.
 */

import { Octokit } from 'octokit';
import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';
import { decryptCredential } from '../lib/credential-crypto.js';
import { pool } from '../db/client.js';
import { emitSSE } from './scheduler.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GitHubCredentials {
  access_token: string;
  refresh_token?: string;
  github_username?: string;
}

interface ConnectionRow {
  id: string;
  meta_json: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Mark a connection as needing re-authorization and notify via SSE.
 * Called on 401 responses from the GitHub API.
 */
async function markNeedsReauth(connectionId: string): Promise<void> {
  await pool.query(
    "UPDATE workspace_connections SET status = 'needs_reauth', updated_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $1",
    [connectionId]
  );

  emitSSE('connection:status', {
    provider: 'github',
    status: 'needs_reauth',
    connection_id: connectionId,
  }).catch(() => {
    // Best-effort SSE — never block
  });
}

/**
 * Resolve the Octokit client for a given connection.
 * Returns both the client and the connection id for 401 error handling.
 */
async function resolveClient(connectionId?: string): Promise<{ octokit: Octokit; id: string }> {
  let row: ConnectionRow | undefined;

  if (connectionId) {
    row = (await pool.query(
      'SELECT id, meta_json FROM workspace_connections WHERE id = $1 AND status = $2',
      [connectionId, 'connected']
    )).rows[0] as ConnectionRow | undefined;
  } else {
    row = (await pool.query(
      "SELECT id, meta_json FROM workspace_connections WHERE provider = 'github' AND status = 'connected' LIMIT 1"
    )).rows[0] as ConnectionRow | undefined;
  }

  if (!row) {
    throw new Error('No GitHub connection found — connect via Connections page');
  }

  const creds = JSON.parse(decryptCredential(row.meta_json)) as GitHubCredentials;

  // Deliberately NOT logging access_token value
  const octokit = new Octokit({ auth: creds.access_token });

  return { octokit, id: row.id };
}

// ── Exported functions ────────────────────────────────────────────────────────

/**
 * Get an authenticated Octokit client for a GitHub connection.
 *
 * @param connectionId Optional. Uses first connected GitHub account when omitted.
 * @throws Error when no connected GitHub account found or credentials are invalid.
 */
export async function getGitHubClient(connectionId?: string): Promise<Octokit> {
  const { octokit } = await resolveClient(connectionId);
  return octokit;
}

/**
 * List repositories for the authenticated GitHub user.
 *
 * @param connectionId Optional connection override.
 * @returns Array of repository summaries (name, full_name, private flag, html_url).
 */
export async function listRepos(
  connectionId?: string,
): Promise<{ name: string; full_name: string; private: boolean; html_url: string }[]> {
  const { octokit, id } = await resolveClient(connectionId);

  try {
    const response = await octokit.rest.repos.listForAuthenticatedUser({
      per_page: 100,
      sort: 'updated',
    });

    type RepoItem = RestEndpointMethodTypes['repos']['listForAuthenticatedUser']['response']['data'][number];
    return response.data.map((repo: RepoItem) => ({
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      html_url: repo.html_url,
    }));
  } catch (error: unknown) {
    if (isOctokitError(error) && error.status === 401) {
      await markNeedsReauth(id);
      throw new Error('GitHub credentials expired — please reconnect via Connections page');
    }
    throw new Error(`Failed to list repos: ${errorMessage(error)}`);
  }
}

/**
 * Read a file from a GitHub repository.
 *
 * @param owner Repo owner (user or org login).
 * @param repo  Repository name.
 * @param path  File path within the repo.
 * @param ref   Optional git ref (branch, tag, or commit SHA). Defaults to repo's default branch.
 * @param connectionId Optional connection override.
 * @returns Decoded file content (UTF-8) and the blob SHA.
 */
export async function readFile(
  owner: string,
  repo: string,
  path: string,
  ref?: string,
  connectionId?: string,
): Promise<{ content: string; sha: string }> {
  const { octokit, id } = await resolveClient(connectionId);

  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ...(ref ? { ref } : {}),
    });

    const data = response.data;

    // getContent returns an array for directories — we only handle files
    if (Array.isArray(data)) {
      throw new Error(`Path '${path}' is a directory, not a file`);
    }

    if (data.type !== 'file') {
      throw new Error(`Path '${path}' is a ${data.type}, not a file`);
    }

    const content = Buffer.from(data.content, 'base64').toString('utf8');
    const sha = data.sha;

    return { content, sha };
  } catch (error: unknown) {
    if (isOctokitError(error) && error.status === 401) {
      await markNeedsReauth(id);
      throw new Error('GitHub credentials expired — please reconnect via Connections page');
    }
    throw new Error(`Failed to read file '${path}': ${errorMessage(error)}`);
  }
}

/**
 * Create a new branch in a GitHub repository.
 *
 * @param owner    Repo owner.
 * @param repo     Repository name.
 * @param branchName New branch name.
 * @param fromRef  Source ref to branch from (default: 'main').
 * @param connectionId Optional connection override.
 * @returns The new branch name.
 */
export async function createBranch(
  owner: string,
  repo: string,
  branchName: string,
  fromRef?: string,
  connectionId?: string,
): Promise<string> {
  const { octokit, id } = await resolveClient(connectionId);

  try {
    const sourceRef = fromRef ?? 'main';

    // Get the SHA of the source ref
    const refResponse = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${sourceRef}`,
    });

    const sha = refResponse.data.object.sha;

    // Create the new branch ref
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha,
    });

    return branchName;
  } catch (error: unknown) {
    if (isOctokitError(error) && error.status === 401) {
      await markNeedsReauth(id);
      throw new Error('GitHub credentials expired — please reconnect via Connections page');
    }
    throw new Error(`Failed to create branch '${branchName}': ${errorMessage(error)}`);
  }
}

/**
 * Create a pull request in a GitHub repository.
 *
 * @param owner  Repo owner.
 * @param repo   Repository name.
 * @param params PR parameters (title, body, head branch, optional base branch).
 * @param connectionId Optional connection override.
 * @returns PR number and URL.
 */
export async function createPullRequest(
  owner: string,
  repo: string,
  params: { title: string; body: string; head: string; base?: string },
  connectionId?: string,
): Promise<{ number: number; html_url: string }> {
  const { octokit, id } = await resolveClient(connectionId);

  try {
    const response = await octokit.rest.pulls.create({
      owner,
      repo,
      title: params.title,
      body: params.body,
      head: params.head,
      base: params.base ?? 'main',
    });

    return {
      number: response.data.number,
      html_url: response.data.html_url,
    };
  } catch (error: unknown) {
    if (isOctokitError(error) && error.status === 401) {
      await markNeedsReauth(id);
      throw new Error('GitHub credentials expired — please reconnect via Connections page');
    }
    throw new Error(`Failed to create pull request '${params.title}': ${errorMessage(error)}`);
  }
}

// ── Utility helpers ───────────────────────────────────────────────────────────

interface OctokitError {
  status: number;
  message: string;
}

function isOctokitError(error: unknown): error is OctokitError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as OctokitError).status === 'number'
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isOctokitError(error)) return error.message;
  return String(error);
}
