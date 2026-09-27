/**
 * Proves an explicit tool allow-list on a sandbox dispatch LIMITS the tools, not just pre-approves them.
 *
 * ⚠️ WHY (2026-09-28): `--allowedTools Read,Grep,Glob` under `--permission-mode auto` left Write and
 * Bash loaded; the model said so when asked to write a file. ymc's analyst reads code unattended and
 * must not be able to change it, so the allow-list has to become `--tools` as well.
 *
 *   npx tsx scripts/verify-claude-tool-allowlist.ts
 */
import { readFileSync } from 'node:fs';
import { allowListToolsArgs } from '../src/services/bridge/adapters/claude-cli.js';

let failures = 0;
const check = (c: boolean, m: string) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) failures++; };

check(JSON.stringify(allowListToolsArgs(false, 'Read,Grep,Glob')) === JSON.stringify(['--tools', 'Read,Grep,Glob']),
  'a sandbox dispatch with an allow-list gets --tools with exactly that list');
check(allowListToolsArgs(true, 'Read,Grep,Glob').length === 0, 'a workspace dispatch keeps the full set');
check(allowListToolsArgs(false, null).length === 0, 'no allow-list, no restriction (default and none paths unchanged)');

const src = readFileSync(new URL('../src/services/bridge/adapters/claude-cli.ts', import.meta.url), 'utf8');
const uses = src.match(/\.\.\.allowListToolsArgs\(isWorkspace, toolAllowList\)/g) ?? [];
check(uses.length === 2, `both spawn paths (dispatch and stream) pass it (found ${uses.length})`);

console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
