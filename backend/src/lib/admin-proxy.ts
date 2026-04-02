/**
 * Admin Backend Proxy — forwards requests from Brain (:3001) to Admin Backend (:5175)
 * Used for filesystem operations (skill packs, etc.) that Admin owns.
 */

const ADMIN_URL = process.env.ADMIN_BACKEND_URL || 'http://127.0.0.1:5175';

export async function proxyToAdmin<T = unknown>(
  path: string,
  options?: { method?: string; body?: unknown; timeout?: number }
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const { method = 'GET', body, timeout = 15000 } = options ?? {};
  try {
    const res = await fetch(`${ADMIN_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
    const json = await res.json() as { data?: T; error?: { message: string } };
    if (!res.ok || json.error) {
      return { ok: false, error: json.error?.message || `Admin returned ${res.status}` };
    }
    return { ok: true, data: json.data as T };
  } catch (e) {
    return { ok: false, error: `Admin backend unreachable: ${(e as Error).message}` };
  }
}
