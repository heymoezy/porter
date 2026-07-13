/**
 * release-kit — audit-only register client (R3 delegate/compat).
 *
 * Non-fatal telemetry: records a project's LAST release with Porter so the
 * release audit can surface that the repo is wired + when it last shipped —
 * WITHOUT changing any release behavior. This NEVER throws and never fails a
 * git hook: every failure path returns a benign result.
 *
 * Used by:
 *   (a) the `porter-release register` CLI subcommand appended (non-fatal) to a
 *       delegate-mode repo's EXISTING post-commit hook; and
 *   (b) run.ts delegate mode, when manifest.register.mode === 'audit-only'.
 *
 * Auth: POSTs to Porter's admin releases intake with the localhost service
 * token (X-Porter-Service-Token). Porter's auth plugin maps a valid localhost
 * service token to a platform_admin identity, so the register route's
 * requirePlatformAdmin guard is satisfied without distributing a new secret.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReleaseManifest } from './manifest-schema.js';

const DEFAULT_PORTER_URL = 'http://127.0.0.1:3001';
const REGISTER_PATH = '/api/admin/releases/register';

function porterServiceToken(): string {
  return process.env.PORTER_SERVICE_TOKEN ?? ''; // no fallback: the old default leaked (public repo)
}

function resolveEndpoint(override?: string): string {
  const base = (override || process.env.PORTER_URL || DEFAULT_PORTER_URL).replace(/\/$/, '');
  return `${base}${REGISTER_PATH}`;
}

/** Read the semver-looking version out of the manifest's versionFile. */
function readVersion(repoRoot: string, manifest: ReleaseManifest): string {
  try {
    const txt = readFileSync(join(repoRoot, manifest.versionFile), 'utf8');
    const m = txt.match(/[0-9]+\.[0-9]+\.[0-9]+/);
    return m ? m[0] : 'unknown';
  } catch {
    return 'unknown';
  }
}

export interface RegisterResult {
  /** true when Porter accepted the record (2xx). */
  ok: boolean;
  /** true when a network POST was actually made and accepted. */
  sent: boolean;
  version: string;
  status?: number;
  /** human-readable, always safe to log. */
  detail: string;
}

/**
 * Record the project's last release with Porter. ALWAYS resolves (never throws).
 * On --dry, renders what WOULD be sent and makes no network call.
 */
export async function registerRelease(
  repoRoot: string,
  manifest: ReleaseManifest,
  opts: { dry?: boolean; endpoint?: string } = {},
): Promise<RegisterResult> {
  const version = readVersion(repoRoot, manifest);
  const payload = {
    project: manifest.project,
    kind: manifest.kind,
    version,
    kitVersion: manifest.kitVersion,
    mode: manifest.register?.mode ?? 'full',
    at: new Date().toISOString(),
  };

  if (opts.dry) {
    return { ok: true, sent: false, version, detail: `dry — would POST ${JSON.stringify(payload)}` };
  }

  const endpoint = resolveEndpoint(opts.endpoint);
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Porter-Service-Token': porterServiceToken() },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
    if (!resp.ok) {
      return { ok: false, sent: false, version, status: resp.status, detail: `Porter returned ${resp.status} (non-fatal)` };
    }
    return { ok: true, sent: true, version, status: resp.status, detail: `recorded ${manifest.project} v${version}` };
  } catch (e) {
    return {
      ok: false,
      sent: false,
      version,
      detail: `register POST failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
