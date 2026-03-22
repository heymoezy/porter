/**
 * Unit tests for stream-service.ts
 * Uses Node.js built-in test runner (node:test) + tsx for TypeScript support.
 * Run with: npx tsx --test backend/src/services/stream-service.test.ts
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Mock fetch before importing the module under test.
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof mock.fn>;

// We stub globalThis.fetch before each test group.
function makeFetchMock(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  return mock.fn(impl);
}

// Helper: build a ReadableStream that emits the given strings as Uint8Array chunks.
function makeBodyStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let idx = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(encoder.encode(chunks[idx++]));
      } else {
        controller.close();
      }
    },
  });
}

// Helper: build a minimal Response-like object.
function makeResponse(opts: { body?: ReadableStream<Uint8Array> | null; text?: string; ok?: boolean }): Response {
  const r = {
    ok: opts.ok ?? true,
    status: opts.ok === false ? 500 : 200,
    body: opts.body ?? null,
    text: () => Promise.resolve(opts.text ?? ''),
    json: async () => JSON.parse(opts.text ?? 'null'),
    headers: new Headers(),
  } as unknown as Response;
  return r;
}

// ---------------------------------------------------------------------------
// Collect all yielded values from an AsyncIterable.
// ---------------------------------------------------------------------------
async function collectIterable(iter: AsyncIterable<string>): Promise<string[]> {
  const results: string[] = [];
  for await (const val of iter) {
    results.push(val);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Dynamic import after mocking global fetch.
// ---------------------------------------------------------------------------
// We use a dynamic import inside each test to pick up the mocked globals.
// However, since Node caches modules, we import once at the top and rely on
// the module using `globalThis.fetch` which we override per-test.
// ---------------------------------------------------------------------------

import {
  OllamaStreamBackend,
  OpenClawStreamBackend,
  selectStreamBackend,
} from './stream-service.js';

// ---------------------------------------------------------------------------
// Test 1: OllamaStreamBackend yields individual tokens from mock NDJSON lines
// ---------------------------------------------------------------------------

describe('OllamaStreamBackend', () => {
  beforeEach(() => {
    // Each test installs its own fetch mock
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it('yields individual tokens from NDJSON stream', async () => {
    const ndjson = [
      '{"response":"Hello","done":false}\n',
      '{"response":" world","done":false}\n',
      '{"response":"","done":true,"total_duration":12345}\n',
    ];

    globalThis.fetch = makeFetchMock(async (_url, _init) =>
      makeResponse({ body: makeBodyStream(ndjson) }),
    ) as typeof globalThis.fetch;

    const backend = new OllamaStreamBackend();
    const controller = new AbortController();
    const tokens = await collectIterable(backend.stream('Hello', controller.signal));

    assert.deepEqual(tokens, ['Hello', ' world']);
  });

  it('handles NDJSON split across multiple read chunks', async () => {
    // Split the NDJSON line across two chunks to test buffering logic.
    const chunks = [
      '{"response":"tok1","done":false}\n{"respon',
      'se":"tok2","done":false}\n{"response":"","done":true}\n',
    ];

    globalThis.fetch = makeFetchMock(async (_url, _init) =>
      makeResponse({ body: makeBodyStream(chunks) }),
    ) as typeof globalThis.fetch;

    const backend = new OllamaStreamBackend();
    const controller = new AbortController();
    const tokens = await collectIterable(backend.stream('test', controller.signal));

    assert.deepEqual(tokens, ['tok1', 'tok2']);
  });

  it('stops yielding when AbortSignal is aborted mid-stream', async () => {
    const encoder = new TextEncoder();
    const controller = new AbortController();
    let pullCount = 0;

    // Stream that emits lines indefinitely until aborted
    const body = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        if (pullCount >= 5) {
          // Abort after 5 chunks
          controller.abort();
        }
        pullCount++;
        ctrl.enqueue(encoder.encode(`{"response":"tok${pullCount}","done":false}\n`));
      },
    });

    let fetchAborted = false;
    globalThis.fetch = makeFetchMock(async (_url, init) => {
      const signal = (init as RequestInit)?.signal as AbortSignal | undefined;
      if (signal) {
        signal.addEventListener('abort', () => { fetchAborted = true; });
      }
      return makeResponse({ body });
    }) as typeof globalThis.fetch;

    const backend = new OllamaStreamBackend();
    const tokens: string[] = [];
    try {
      for await (const tok of backend.stream('test', controller.signal)) {
        tokens.push(tok);
      }
    } catch (e) {
      // AbortError is expected and acceptable
      const err = e as Error;
      assert.ok(err.name === 'AbortError' || err.message.includes('abort') || err.message.includes('abort'),
        `Unexpected error: ${err.message}`);
    }

    // Must stop before reading all possible tokens from an infinite stream
    assert.ok(tokens.length < 100, `Expected early termination but got ${tokens.length} tokens`);
  });
});

// ---------------------------------------------------------------------------
// Test 2: OpenClawStreamBackend word-chunks a blocking response
// ---------------------------------------------------------------------------

describe('OpenClawStreamBackend', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('yields word-chunked tokens from a mock blocking response', async () => {
    const fullText = 'The quick brown fox jumps over the lazy dog';

    globalThis.fetch = makeFetchMock(async (_url, _init) =>
      makeResponse({ text: fullText }),
    ) as typeof globalThis.fetch;

    const backend = new OpenClawStreamBackend();
    const controller = new AbortController();
    const tokens = await collectIterable(backend.stream('test', controller.signal));

    // All tokens combined should equal the original text
    const combined = tokens.join('');
    assert.equal(combined, fullText);

    // Should have more than 1 chunk (word-chunked, not one big block)
    assert.ok(tokens.length > 1, `Expected multiple chunks, got ${tokens.length}`);
  });

  it('stops early when AbortSignal is aborted before yielding', async () => {
    const fullText = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10';

    globalThis.fetch = makeFetchMock(async (_url, _init) =>
      makeResponse({ text: fullText }),
    ) as typeof globalThis.fetch;

    const controller = new AbortController();
    // Abort immediately before streaming starts
    controller.abort();

    const backend = new OpenClawStreamBackend();
    const tokens = await collectIterable(backend.stream('test', controller.signal));

    // Should yield nothing or very little when aborted immediately
    assert.ok(tokens.length < 5, `Expected early termination but got ${tokens.length} tokens`);
  });
});

// ---------------------------------------------------------------------------
// Test 3: selectStreamBackend routing logic
// ---------------------------------------------------------------------------

describe('selectStreamBackend', () => {
  it('returns OllamaStreamBackend when shouldRouteCheap returns true', () => {
    // Short, simple messages route to cheap (Ollama)
    const backend = selectStreamBackend('Hi');
    assert.equal(backend.name, 'ollama');
    assert.ok(backend instanceof OllamaStreamBackend);
  });

  it('returns OpenClawStreamBackend when shouldRouteCheap returns false', () => {
    // Long/complex messages route to strong (OpenClaw)
    const longMessage = 'Please implement a complete authentication system with JWT refresh token rotation using the jose library and add comprehensive test coverage';
    const backend = selectStreamBackend(longMessage);
    assert.equal(backend.name, 'openclaw');
    assert.ok(backend instanceof OpenClawStreamBackend);
  });

  it("returns OllamaStreamBackend with explicit hint 'ollama' regardless of message", () => {
    const longMessage = 'Please implement a complete authentication system with refresh tokens and comprehensive tests';
    const backend = selectStreamBackend(longMessage, 'ollama');
    assert.equal(backend.name, 'ollama');
    assert.ok(backend instanceof OllamaStreamBackend);
  });

  it("returns OpenClawStreamBackend with explicit hint 'openclaw' regardless of message", () => {
    // Even a short/cheap message → override to openclaw
    const backend = selectStreamBackend('Hi', 'openclaw');
    assert.equal(backend.name, 'openclaw');
    assert.ok(backend instanceof OpenClawStreamBackend);
  });

  it("returns correct backend with explicit hint 'auto' (falls through to shouldRouteCheap)", () => {
    const cheap = selectStreamBackend('Hi', 'auto');
    assert.equal(cheap.name, 'ollama');

    const expensive = selectStreamBackend(
      'Please implement and test a full authentication system with refresh token rotation',
      'auto',
    );
    assert.equal(expensive.name, 'openclaw');
  });
});
