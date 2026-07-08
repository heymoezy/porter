/**
 * release-kit — announce adapter (R1).
 *
 * The ONLY announce sender remains ymc's lib/release-announce.ts, reached over
 * HTTP via POST /api/v1/admin/announce-release. Porter NEVER reimplements
 * announce — this adapter just POSTs. It mirrors the EXACT working contract of
 * backend/scripts/announce-porter-update.ts (same endpoint, same header, same
 * body shape, same idempotence-handled-server-side semantics) so that script
 * could later be refactored to call this. That script is NOT rewritten here.
 *
 * Idempotence + @g.us group-guard + Tom-voice render all live server-side.
 */

const DEFAULT_YMC_BACKEND_URL = 'http://127.0.0.1:5182';
const ANNOUNCE_PATH = '/api/v1/admin/announce-release';

export interface AnnounceInput {
  kind: string;
  version: string;
  title: string;
  bullets: string[];
  /** override endpoint (else env YMC_BACKEND_URL + path, else default). */
  endpoint?: string;
  /** preview render only, no send. */
  dry?: boolean;
  /** re-announce even if already marked. */
  force?: boolean;
}

export interface AnnounceResult {
  ok: boolean;
  sent: boolean;
  skipped: boolean;
  reason?: string;
  status?: number;
  /** rendered preview lines (always produced, incl. --dry). */
  preview: string;
  error?: string;
}

function resolveEndpoint(override?: string): string {
  if (override) return override;
  const base = (process.env.YMC_BACKEND_URL || DEFAULT_YMC_BACKEND_URL).replace(/\/$/, '');
  return `${base}${ANNOUNCE_PATH}`;
}

function serviceToken(): string {
  return (
    process.env.PORTER_SERVICE_TOKEN ||
    process.env.YMC_SERVICE_TOKEN ||
    'porter-local-service-2026'
  );
}

function renderPreview(input: AnnounceInput): string {
  const icon = input.kind === 'porter' ? '🧠 Porter update' : `📣 ${input.kind} update`;
  const lines = [
    `${icon} — v${input.version}${input.dry ? ' (DRY-RUN)' : ''}`,
    input.title,
    ...input.bullets.map((b) => `  • ${b}`),
  ];
  return lines.join('\n');
}

/**
 * Announce a release via the shared ymc HTTP announcer. Mirrors
 * announce-porter-update.ts. On --dry, renders the preview WITHOUT sending
 * (server still no-ops on dry, but we short-circuit the network for the kit's
 * isolated tests and honest local previews).
 */
export async function announceViaYmc(input: AnnounceInput): Promise<AnnounceResult> {
  const preview = renderPreview(input);

  if (input.dry) {
    return { ok: true, sent: false, skipped: false, reason: 'dry-run (not sent)', preview };
  }

  const endpoint = resolveEndpoint(input.endpoint);
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Service-Token': serviceToken() },
    body: JSON.stringify({
      kind: input.kind,
      version: input.version,
      title: input.title,
      bullets: input.bullets,
      dry: false,
      force: input.force ?? false,
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch((e) => {
    return { __error: e instanceof Error ? e.message : String(e) } as const;
  });

  if ('__error' in resp) {
    return { ok: false, sent: false, skipped: false, error: resp.__error, preview };
  }

  const j = (await resp.json().catch(() => null)) as
    | { ok?: boolean; data?: { sent?: boolean; skipped?: boolean; reason?: string }; error?: unknown }
    | null;

  if (!resp.ok || !j?.ok) {
    return {
      ok: false,
      sent: false,
      skipped: false,
      status: resp.status,
      error: JSON.stringify(j?.error ?? j),
      preview,
    };
  }

  return {
    ok: true,
    sent: Boolean(j.data?.sent),
    skipped: Boolean(j.data?.skipped),
    reason: j.data?.reason,
    status: resp.status,
    preview,
  };
}
