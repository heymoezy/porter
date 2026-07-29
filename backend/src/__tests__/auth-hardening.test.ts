/**
 * Tests for the round-2 auth hardening.
 *
 * Run with: npx tsx --test backend/src/__tests__/auth-hardening.test.ts
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Three separate holes on the credential surface, all of which type-check fine
 * and none of which any existing test would have caught:
 *
 *  1. `generateCode()` drew the emailed 6-digit codes from `Math.random()` — a
 *     seeded xorshift whose internal state is recoverable from a handful of
 *     observed outputs. It feeds `reset_password`, so a predicted code is
 *     account takeover, not a nuisance.
 *
 *  2. `verifyAuthToken()` charged NOTHING for a wrong guess. 10^6 codes, a
 *     15-minute TTL and unlimited attempts on an unauthenticated route is a
 *     walkable space. The cap now burns the token at 5.
 *
 *  3. `POST /api/v1/auth/login` had no brute-force budget of any kind. The
 *     `rate_limits` tables in this repo meter API and gateway usage and have
 *     never been consulted by the login path.
 *
 * The rate-limit tests exercise the real shared Map, so each case resets it
 * first — a leaked counter between cases is exactly the bug this module would
 * have in production if the sweep or the window roll were wrong.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { generateCode, MAX_TOKEN_ATTEMPTS } from '../services/transactional-email.js';
import {
  __resetLoginFailures,
  clearLoginFailures,
  loginAttemptKey,
  loginRateLimited,
  recordLoginFailure,
} from '../lib/login-rate-limit.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, '..');

describe('generateCode() — reset codes come from the CSPRNG', () => {
  it('always returns exactly 6 digits, in range, across many draws', () => {
    for (let i = 0; i < 2000; i++) {
      const code = generateCode();
      assert.match(code, /^[0-9]{6}$/, `not a 6-digit code: ${code}`);
      const n = Number(code);
      assert.ok(n >= 100000 && n <= 999999, `out of range: ${n}`);
    }
  });

  it('does not collapse to a narrow set — 2000 draws yield many distinct codes', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(generateCode());
    // Birthday collisions over 900k are rare; anything under 1900 distinct
    // means the source is not behaving like a uniform draw.
    assert.ok(seen.size > 1900, `only ${seen.size} distinct codes in 2000 draws`);
  });

  it('the source file no longer references Math.random', () => {
    const src = readFileSync(path.join(srcRoot, 'services/transactional-email.ts'), 'utf8');
    const code = src
      .split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n');
    assert.ok(!code.includes('Math.random'), 'Math.random is back in transactional-email.ts');
    assert.ok(code.includes('crypto.randomInt'), 'crypto.randomInt is not being used');
  });
});

describe('auth-token attempt cap', () => {
  it('is capped at 5 — the same budget the login form uses', () => {
    assert.equal(MAX_TOKEN_ATTEMPTS, 5);
  });

  it('the miss path charges an attempt and burns the token at the cap', () => {
    const src = readFileSync(path.join(srcRoot, 'services/transactional-email.ts'), 'utf8');
    // The cap must be applied in the SELECT, so a burned token stops matching...
    assert.match(src, /attempts\s*<\s*\$5/, 'the lookup does not filter on attempts');
    // ...and the increment must be a guarded UPDATE, not read-then-write, or
    // concurrent guesses race straight past the cap.
    assert.match(src, /SET attempts = attempts \+ 1/, 'the miss path does not charge an attempt');
    assert.match(
      src,
      /used_at = CASE WHEN attempts \+ 1 >= \$4 THEN/,
      'the token is not burned when the cap is reached',
    );
  });
});

describe('login rate limit — per (ip, email), 8 failures per 15 minutes', () => {
  beforeEach(() => __resetLoginFailures());

  it('a fresh key is not limited', () => {
    assert.equal(loginRateLimited(loginAttemptKey('1.2.3.4', 'a@b.com')), false);
  });

  it('allows 7 failures and limits on the 8th', () => {
    const key = loginAttemptKey('1.2.3.4', 'a@b.com');
    for (let i = 0; i < 7; i++) {
      recordLoginFailure(key);
      assert.equal(loginRateLimited(key), false, `limited early at failure ${i + 1}`);
    }
    recordLoginFailure(key);
    assert.equal(loginRateLimited(key), true, 'not limited after 8 failures');
  });

  it('budgets are per-email — one address cannot lock out another', () => {
    const victim = loginAttemptKey('1.2.3.4', 'victim@b.com');
    const other = loginAttemptKey('1.2.3.4', 'other@b.com');
    for (let i = 0; i < 8; i++) recordLoginFailure(victim);
    assert.equal(loginRateLimited(victim), true);
    assert.equal(loginRateLimited(other), false, 'a different email shares the budget');
  });

  it('budgets are per-IP — one client cannot lock an account out globally', () => {
    const attacker = loginAttemptKey('9.9.9.9', 'moe@example.com');
    const owner = loginAttemptKey('1.1.1.1', 'moe@example.com');
    for (let i = 0; i < 8; i++) recordLoginFailure(attacker);
    assert.equal(loginRateLimited(attacker), true);
    assert.equal(
      loginRateLimited(owner), false,
      'an attacker on another IP locked the real owner out — this is the DoS the burn design has',
    );
  });

  it('a successful login clears the budget', () => {
    const key = loginAttemptKey('1.2.3.4', 'a@b.com');
    for (let i = 0; i < 8; i++) recordLoginFailure(key);
    assert.equal(loginRateLimited(key), true);
    clearLoginFailures(key);
    assert.equal(loginRateLimited(key), false, 'the budget survived a successful login');
  });

  it('normalises the email the same way /login does', () => {
    assert.equal(
      loginAttemptKey('1.2.3.4', '  MOE@Example.COM '),
      loginAttemptKey('1.2.3.4', 'moe@example.com'),
      'case/whitespace variants get separate budgets — 8 attempts each',
    );
  });
});

describe('/login refuses credential-less rows', () => {
  it('guards on an empty hash or salt before comparing', () => {
    const src = readFileSync(path.join(srcRoot, 'routes/v1/auth.ts'), 'utf8');
    const guard = src.indexOf('if (!user.password_hash || !user.salt)');
    const compare = src.indexOf('await verifyPassword(password,');
    assert.ok(guard > 0, 'the non-login-identity guard is gone from /login');
    assert.ok(
      guard < compare,
      'the guard must run BEFORE verifyPassword, or `system` is only safe by accident',
    );
  });
});

describe('/change-password stays open by decision', () => {
  it('does not require a current password (Moe, 2026-07-29)', () => {
    const src = readFileSync(path.join(srcRoot, 'routes/v1/auth.ts'), 'utf8');
    const route = src.slice(src.indexOf("fastify.post('/change-password'"));
    const body = route.slice(0, route.indexOf('fastify.post(', 10));
    assert.ok(
      !body.includes('current_password'),
      'a current-password requirement came back — it was reverted deliberately: ' +
      'smtp_host has no listener, so the emailed reset cannot deliver and this ' +
      'would leave direct DB access as the only recovery. Re-raise only with mail working.',
    );
  });
});
