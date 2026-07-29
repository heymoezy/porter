/**
 * Tests for the "async function called without await in a guard position" class.
 *
 * Run with: npx tsx --test backend/src/__tests__/await-guards.test.ts
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `routes/v1/auth.ts` did this, on two public routes:
 *
 *     const valid = verifyAuthToken(emailLower, code, 'reset_password');
 *     if (!valid) { return reply.code(400).send(err('INVALID_CODE', ...)); }
 *
 * `verifyAuthToken` is `async`. Without `await`, `valid` is a Promise, a Promise
 * is always truthy, `!valid` is never true, and the emailed 6-digit code was
 * never checked. `POST /api/v1/auth/reset-password` and `/verify-email` are both
 * unauthenticated, so anyone who knew an address could set its password or mint
 * a session. Both admin rows use the same address.
 *
 * There is nothing about this that a type-checker catches — `Promise<boolean>`
 * in a truthiness test is legal TypeScript — and nothing about it that shows up
 * at runtime, because the failure is silent success. It is only ever found by
 * someone reading the line. So it gets a test instead of a memory.
 *
 * Two invariants, both enforced against the real source tree:
 *   1. Every call to verifyAuthToken / verifyPassword is awaited, and they are
 *      still async (an invariant about awaiting a sync function is vacuous).
 *   2. No async function anywhere under src/ is called in a boolean guard
 *      position without `await` — the general shape, so the next instance goes
 *      red instead of shipping.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      sourceFiles(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const FILES = sourceFiles(SRC);
const read = (f: string) => fs.readFileSync(f, 'utf8');
const rel = (f: string) => path.relative(SRC, f);

/** Strip line comments so a commented-out example can never fail a test. */
function codeLines(src: string): string[] {
  return src.split('\n').map((l) => {
    const t = l.trimStart();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return '';
    return l;
  });
}

/**
 * Names declared `async` somewhere and NEVER declared non-async anywhere.
 *
 * The "never non-async" half matters: `run` and `detect` each exist as both a
 * sync local helper and an async one in a different file, and treating those
 * call sites as suspects is pure noise.
 */
function unambiguouslyAsyncNames(): Set<string> {
  const asyncNames = new Set<string>();
  const syncNames = new Set<string>();
  const asyncDecl = /\basync\s+function\s+([A-Za-z_$][\w$]*)/g;
  const asyncAssign = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*async\b/g;
  const syncDecl = /(?<!async\s)\bfunction\s+([A-Za-z_$][\w$]*)/g;

  for (const f of FILES) {
    const src = read(f);
    for (const m of src.matchAll(asyncDecl)) asyncNames.add(m[1]);
    for (const m of src.matchAll(asyncAssign)) asyncNames.add(m[1]);
    for (const m of src.matchAll(syncDecl)) syncNames.add(m[1]);
  }
  for (const n of syncNames) asyncNames.delete(n);
  return asyncNames;
}

describe('await guards — the reset-password bug class', () => {
  it('verifyAuthToken and verifyPassword are still async', () => {
    const email = read(path.join(SRC, 'services/transactional-email.ts'));
    const auth = read(path.join(SRC, 'routes/v1/auth.ts'));
    assert.match(
      email,
      /export\s+async\s+function\s+verifyAuthToken\s*\(/,
      'verifyAuthToken must be async — otherwise the await assertions below prove nothing',
    );
    assert.match(
      auth,
      /async\s+function\s+verifyPassword\s*\(/,
      'verifyPassword must be async — otherwise the await assertions below prove nothing',
    );
  });

  it('every call to a credential check is awaited', () => {
    const CHECKS = ['verifyAuthToken', 'verifyPassword'];
    const offenders: string[] = [];

    for (const f of FILES) {
      if (rel(f).startsWith('__tests__/')) continue;
      codeLines(read(f)).forEach((line, i) => {
        for (const name of CHECKS) {
          // A call site, not the declaration and not the import.
          const call = new RegExp(`(?<![\\w$.])${name}\\s*\\(`);
          const m = call.exec(line);
          if (!m) continue;
          if (/\b(async\s+)?function\s+$/.test(line.slice(0, m.index))) continue;
          if (!/await\s+$/.test(line.slice(0, m.index))) {
            offenders.push(`${rel(f)}:${i + 1}: ${line.trim()}`);
          }
        }
      });
    }

    assert.deepEqual(
      offenders,
      [],
      `credential check called without await — the check silently passes:\n${offenders.join('\n')}`,
    );
  });

  it('no async function is used in a boolean guard without await', () => {
    const asyncNames = unambiguouslyAsyncNames();
    const offenders: string[] = [];

    for (const f of FILES) {
      if (rel(f).startsWith('__tests__/')) continue;
      const lines = codeLines(read(f));

      lines.forEach((line, i) => {
        for (const m of line.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) {
          const name = m[1];
          if (!asyncNames.has(name)) continue;

          const before = line.slice(0, m.index);
          const after = line.slice(m.index);
          if (/(await|void)\s+$/.test(before)) continue;
          if (/\b(async\s+)?function\s+$/.test(before)) continue;
          // Returned or chained — the caller owns the await.
          if (/\breturn\b[^;]*$/.test(before)) continue;
          if (/\)\s*\.(then|catch|finally)/.test(after)) continue;

          // (a) directly inside a truthiness test
          if (/\bif\s*\(\s*!?\s*$/.test(before) || /(&&|\|\|)\s*!?\s*$/.test(before)) {
            offenders.push(`${rel(f)}:${i + 1}: ${line.trim()}`);
            continue;
          }

          // (b) assigned, then that binding is tested for truthiness nearby
          //     without an await — exactly the reset-password shape.
          const assign = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*$/.exec(before);
          if (!assign) continue;
          const binding = assign[1];
          const guard = new RegExp(`\\bif\\s*\\(\\s*!?\\s*${binding}\\s*[)&|=!]`);
          for (const probe of lines.slice(i + 1, i + 6)) {
            if (guard.test(probe) && !new RegExp(`await\\s+${binding}`).test(probe)) {
              offenders.push(`${rel(f)}:${i + 1}: ${line.trim()}`);
              break;
            }
          }
        }
      });
    }

    assert.deepEqual(
      offenders,
      [],
      `async call in a guard position with no await — the guard always passes:\n${offenders.join('\n')}`,
    );
  });
});
