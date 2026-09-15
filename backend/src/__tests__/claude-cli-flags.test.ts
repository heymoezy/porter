/**
 * Claude CLI adapter flag mapping.
 *
 * 2.1.50 rejects `--permission-mode auto`. 2.1.27x accepts it. The adapter
 * used to hardcode `auto`, so a PATH that resolved to /usr/bin/claude (2.1.50)
 * died before any model call. These tests pin the mapping off --help text.
 *
 * Run: npx tsx --test src/__tests__/claude-cli-flags.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { permissionModeArgs, resolveClaudeBinary } from '../services/bridge/adapters/claude-cli.js';
import { existsSync } from 'node:fs';

const HELP_2150 = `
  --permission-mode <mode>                          Permission mode to use for the session (choices: "acceptEdits", "bypassPermissions", "default", "dontAsk", "plan")
  --dangerously-skip-permissions                    Bypass all permission checks.
`;

const HELP_21272 = `
  --permission-mode <mode>              Permission mode to use for the session
                                        (choices: "acceptEdits", "auto",
                                        "bypassPermissions", "manual",
                                        "dontAsk", "plan")
`;

describe('permissionModeArgs', () => {
  it('uses auto when the binary lists it', () => {
    assert.deepEqual(permissionModeArgs(HELP_21272), ['--permission-mode', 'auto']);
  });

  it('uses bypassPermissions on 2.1.50, which has no auto', () => {
    assert.deepEqual(permissionModeArgs(HELP_2150), ['--permission-mode', 'bypassPermissions']);
  });

  it('falls back to bypassPermissions when help is empty', () => {
    assert.deepEqual(permissionModeArgs(''), ['--permission-mode', 'bypassPermissions']);
  });
});

describe('resolveClaudeBinary', () => {
  it('keeps a stored path that still exists', () => {
    const stored = process.execPath;
    assert.equal(resolveClaudeBinary(stored), stored);
  });

  it('does not return a stored path that is gone', () => {
    const missing = '/tmp/porter-claude-does-not-exist-' + Date.now();
    assert.equal(existsSync(missing), false);
    const resolved = resolveClaudeBinary(missing);
    assert.notEqual(resolved, missing);
  });
});
