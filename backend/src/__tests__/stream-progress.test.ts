/**
 * claude-cli stream progress (v6.162.3).
 *
 * A turn that is thinking writes a line for every delta but no text, so the caller used to see
 * nothing until the answer and could not tell a slow turn from a hung one. The adapter now yields
 * an empty token at most every STREAM_PROGRESS_EVERY_MS while the child is writing, and the chat
 * route sends it as `{progress:true}`.
 *
 * Driven against a fake `claude` binary: twelve seconds of thinking lines, then an answer.
 *
 * Run: npx tsx --test src/__tests__/stream-progress.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeCLIAdapter, STREAM_PROGRESS_EVERY_MS } from '../services/bridge/adapters/claude-cli.js';
import type { GatewayRow } from '../services/bridge/types.js';

const THINK_SECONDS = 12;

function fakeClaude(dir: string, thinkSeconds: number): string {
  const bin = join(dir, 'claude');
  writeFileSync(bin, `#!/usr/bin/env node
if (process.argv.includes('--help') || process.argv.includes('--version')) { process.exit(0); }
process.stdin.resume();
process.stdin.on('end', async () => {
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  out({ type: 'system', subtype: 'init', model: 'fake' });
  for (let i = 0; i < ${thinkSeconds}; i++) {
    await sleep(1000);
    out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hm' } } });
  }
  out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'the answer' } } });
  out({ type: 'result', result: 'the answer' });
  process.exit(0);
});
`);
  chmodSync(bin, 0o755);
  return bin;
}

describe('claude-cli stream progress', () => {
  it('yields empty progress tokens while the child thinks, and the text is unchanged', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fake-claude-'));
    try {
      const row = { id: 't', type: 'claude_cli', name: 'claude_cli', url: null, authMethod: 'none', status: 'active',
        source: 'detected', priority: 1, capabilities: [], metadata: { binary_path: fakeClaude(dir, THINK_SECONDS) } } as unknown as GatewayRow;
      const adapter = new ClaudeCLIAdapter(row);
      const tokens: string[] = [];
      const ac = new AbortController();
      for await (const t of adapter.stream({ messages: [{ role: 'user', content: 'x' }] } as never, ac.signal)) tokens.push(t);

      const progress = tokens.filter((t) => t === '').length;
      const expected = Math.floor((THINK_SECONDS * 1000) / STREAM_PROGRESS_EVERY_MS);
      assert.ok(progress >= expected - 1 && progress <= expected + 1, `progress marks ${progress}, expected about ${expected}`);
      assert.equal(tokens.join(''), 'the answer', 'the text is exactly the answer');
      assert.equal(tokens.at(-1), 'the answer', 'the answer comes last');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
