/**
 * Login rate limit — in-memory, per (ip, email). 8 failed attempts within
 * 15 minutes → limited until the window rolls.
 *
 * WHY THIS EXISTS
 * ---------------
 * POST /api/v1/auth/login had NO brute-force protection of any kind. The
 * `rate_limits` tables in this codebase meter API and gateway usage — they have
 * never been consulted by the login path. An attacker who knew an address could
 * grind passwords against askporter.app as fast as scrypt would answer, and the
 * only platform_admin account on the box is reachable through that form.
 *
 * WHY THIS SHAPE AND NOT ymc's
 * ----------------------------
 * There are two existing patterns in the workspace and this deliberately copies
 * the BYD one (lib/login-rate-limit.ts) rather than ymc's, which burns the
 * credential — NULLs `password_hash` — after 5 failures.
 *
 * An account burn is only safe where the owner can recover, and ymc's recovery
 * is the emailed reset code. Porter's `smtp_host` is 127.0.0.1:587 with nothing
 * listening (see CHECKPOINT: mail delivery is an open item), so a burn here
 * would not be a 15-minute inconvenience — it would be a permanent lockout
 * recoverable only by hand-editing the users table, and it could be triggered by
 * anyone who knows the admin's address. That is a denial-of-service handed to
 * the attacker, not a defence.
 *
 * A time-boxed counter costs the attacker the same and costs the owner 15
 * minutes. It self-heals, it destroys nothing, and it needs no working mailbox.
 * Switching to the burn is worth revisiting once mail actually delivers.
 *
 * Keyed on (ip, email), which is only meaningful because `trustProxy` is now set
 * to the loopback addresses in index.ts. Before that fix every request off the
 * internet reported Caddy's own 127.0.0.1 as `request.ip`, so an IP-keyed budget
 * would have been ONE global bucket — every visitor sharing a counter, which
 * locks out the world the moment one attacker starts guessing.
 *
 * Single-process service (one systemd unit, no cluster), so a Map is sufficient.
 * If Porter is ever run multi-process this must move to the database or the
 * budget silently multiplies by the worker count.
 */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;

const loginFailures = new Map<string, { count: number; windowStart: number }>();

/** One budget per (ip, email). Email is normalised the same way /login does. */
export function loginAttemptKey(ip: string, email: string): string {
  return `${ip}|${email.toLowerCase().trim()}`;
}

export function loginRateLimited(key: string): boolean {
  const entry = loginFailures.get(key);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > LOGIN_WINDOW_MS) {
    loginFailures.delete(key);
    return false;
  }
  return entry.count >= LOGIN_MAX_FAILURES;
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const entry = loginFailures.get(key);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
    loginFailures.set(key, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
  }
  // Bounded memory: sweep stale keys if the map ever grows large.
  if (loginFailures.size > 10_000) {
    for (const [k, v] of loginFailures) {
      if (now - v.windowStart > LOGIN_WINDOW_MS) loginFailures.delete(k);
    }
  }
}

export function clearLoginFailures(key: string): void {
  loginFailures.delete(key);
}

/** Test seam only — resets the shared Map between cases. */
export function __resetLoginFailures(): void {
  loginFailures.clear();
}
