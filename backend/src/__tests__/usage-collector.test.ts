import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractCodexRateLimitsFromJsonl } from '../services/bridge/usage-collector.js';

describe('extractCodexRateLimitsFromJsonl()', () => {
  it('returns the latest token_count rate limits from a Codex session log', () => {
    const jsonl = [
      JSON.stringify({
        timestamp: '2026-03-01T09:28:17.859Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          rate_limits: {
            primary: { used_percent: 24.0, resets_at: 1772361026 },
            secondary: { used_percent: 94.0, resets_at: 1772357053 },
          },
        },
      }),
      JSON.stringify({
        timestamp: '2026-03-01T09:28:29.687Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          rate_limits: {
            primary: { used_percent: 35.0, resets_at: 1772362026 },
            secondary: { used_percent: 7.0, resets_at: 1772962107 },
          },
        },
      }),
    ].join('\n');

    const parsed = extractCodexRateLimitsFromJsonl(jsonl);
    assert.deepStrictEqual(parsed, {
      timestamp: '2026-03-01T09:28:29.687Z',
      primary: { usedPercent: 35, resetAt: 1772362026 },
      secondary: { usedPercent: 7, resetAt: 1772962107 },
    });
  });

  it('returns null when no usable token_count event exists', () => {
    const jsonl = JSON.stringify({ type: 'event_msg', payload: { type: 'other' } });
    assert.equal(extractCodexRateLimitsFromJsonl(jsonl), null);
  });
});
