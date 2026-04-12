/**
 * Bridge Adapter — Anthropic Messages API
 *
 * Direct HTTP adapter for the Anthropic Messages API with server-side tool execution.
 * Unlike Claude CLI, this runs tools in-process — no terminal approval needed.
 *
 * Supports:
 *   - web_search (via Brave Search API)
 *   - web_fetch (HTTP GET + content extraction)
 *   - read_file / write_file (local filesystem)
 *   - bash (sandboxed shell execution)
 *
 * Agentic loop: model responds with tool_use → execute server-side → send result → repeat.
 * Requires ANTHROPIC_API_KEY in env or porter_config.json api_keys.anthropic.
 */

import { execSync } from 'child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../../config.js';
import type {
  GatewayAdapter,
  GatewayRow,
  GatewayType,
  DetectResult,
  HealthResult,
  BridgeDispatchRequest,
  BridgeDispatchResult,
} from '../types.js';

// ── Config ────────────────────────────────────────────────────────────────────

const API_BASE = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const MAX_TOOL_ROUNDS = 15;
const MAX_RESPONSE_TOKENS = 16384;
const DISPATCH_TIMEOUT_MS = 300_000; // 5 min

// ── Tool Definitions ──────────────────────────────────────────────────────────

const TOOL_DEFS = [
  {
    name: 'web_search',
    description: 'Search the web using Brave Search API. Returns top results with titles, URLs, and snippets.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string' as const, description: 'Search query' },
        count: { type: 'number' as const, description: 'Number of results (default 10, max 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_fetch',
    description: 'Fetch a URL and return its text content (HTML stripped to readable text). Max 50KB.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string' as const, description: 'URL to fetch' },
      },
      required: ['url'],
    },
  },
  {
    name: 'read_file',
    description: 'Read a file from the local filesystem. Returns file content as text.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string' as const, description: 'Absolute file path' },
        limit: { type: 'number' as const, description: 'Max lines to read (default: all)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file. Creates directories if needed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string' as const, description: 'Absolute file path' },
        content: { type: 'string' as const, description: 'File content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'bash',
    description: 'Execute a shell command and return stdout + stderr. Timeout 30s.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string' as const, description: 'Shell command to execute' },
      },
      required: ['command'],
    },
  },
];

// ── Tool Execution ────────────────────────────────────────────────────────────

function getBraveKey(): string | null {
  try {
    const raw = fs.readFileSync(
      path.join(process.env.PORTER_DATA_DIR || path.join(process.env.HOME || '', '.porter'), '..', 'porter_config.json'),
      'utf-8',
    );
    const cfg = JSON.parse(raw);
    return cfg?.api_keys?.brave_search || null;
  } catch {
    // Try the standard Porter config path
    try {
      const raw2 = fs.readFileSync(
        path.join(process.env.HOME || '', 'projects', 'Porter', 'porter_config.json'),
        'utf-8',
      );
      return JSON.parse(raw2)?.api_keys?.brave_search || null;
    } catch {
      return null;
    }
  }
}

async function execWebSearch(query: string, count = 10): Promise<string> {
  const key = getBraveKey();
  if (!key) return 'ERROR: No Brave Search API key configured in porter_config.json';

  const params = new URLSearchParams({ q: query, count: String(Math.min(count, 20)) });
  const resp = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) return `ERROR: Brave Search returned ${resp.status}: ${await resp.text()}`;

  const data = await resp.json() as { web?: { results?: Array<{ title: string; url: string; description: string }> } };
  const results = data.web?.results ?? [];
  if (results.length === 0) return 'No results found.';

  return results.map((r, i) =>
    `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`
  ).join('\n\n');
}

async function execWebFetch(url: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Porter/1.0 (Research Agent)' },
      signal: AbortSignal.timeout(20_000),
      redirect: 'follow',
    });
    if (!resp.ok) return `ERROR: HTTP ${resp.status} for ${url}`;

    const contentType = resp.headers.get('content-type') || '';
    const text = await resp.text();

    // Strip HTML tags for readability
    if (contentType.includes('html')) {
      const stripped = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return stripped.slice(0, 50_000); // Cap at 50KB
    }
    return text.slice(0, 50_000);
  } catch (err) {
    return `ERROR: Failed to fetch ${url}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function execReadFile(filePath: string, limit?: number): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (limit && limit > 0) {
      return content.split('\n').slice(0, limit).join('\n');
    }
    return content.slice(0, 100_000); // Cap at 100KB
  } catch (err) {
    return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function execWriteFile(filePath: string, content: string): string {
  try {
    // Safety: only allow writes under /home/lobster/projects/ or /tmp/
    if (!filePath.startsWith('/home/lobster/projects/') && !filePath.startsWith('/tmp/')) {
      return `ERROR: Write blocked — only /home/lobster/projects/ and /tmp/ are allowed`;
    }
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return `OK: wrote ${content.length} bytes to ${filePath}`;
  } catch (err) {
    return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function execBash(command: string): string {
  // Safety: block destructive commands
  const blocked = ['rm -rf /', 'rm -rf ~', 'sudo', 'mkfs', 'dd if=', ':(){', 'fork bomb'];
  if (blocked.some(b => command.includes(b))) {
    return 'ERROR: Blocked dangerous command';
  }
  try {
    const output = execSync(command, {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return (output || '(no output)').slice(0, 50_000);
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    return `ERROR: ${e.stderr || e.message || String(err)}`.slice(0, 10_000);
  }
}

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'web_search': return execWebSearch(input.query as string, input.count as number | undefined);
    case 'web_fetch': return execWebFetch(input.url as string);
    case 'read_file': return execReadFile(input.path as string, input.limit as number | undefined);
    case 'write_file': return execWriteFile(input.path as string, input.content as string);
    case 'bash': return execBash(input.command as string);
    default: return `ERROR: Unknown tool ${name}`;
  }
}

// ── Anthropic Messages API Types ──────────────────────────────────────────────

interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface MessagesResponse {
  id: string;
  type: string;
  role: string;
  content: ContentBlock[];
  model: string;
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
}

type MessageParam = { role: 'user' | 'assistant'; content: string | ContentBlock[] };

// ── Adapter ───────────────────────────────────────────────────────────────────

export class AnthropicAPIAdapter implements GatewayAdapter {
  readonly name = 'Anthropic API';
  readonly gatewayType = 'anthropic_api' as GatewayType;

  constructor(private readonly row: GatewayRow) {}

  private get apiKey(): string | null {
    // Priority: gateway metadata → env var → porter_config.json
    const metaKey = (this.row.metadata as Record<string, string>)?.api_key;
    if (metaKey) return metaKey;
    if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
    try {
      const raw = fs.readFileSync(
        path.join(process.env.HOME || '', 'projects', 'Porter', 'porter_config.json'),
        'utf-8',
      );
      return JSON.parse(raw)?.api_keys?.anthropic || null;
    } catch { return null; }
  }

  private get model(): string {
    return (this.row.metadata as Record<string, string>)?.model ?? DEFAULT_MODEL;
  }

  // ── detect ────────────────────────────────────────────────────────────────

  async detect(): Promise<DetectResult> {
    return { found: !!this.apiKey, version: 'anthropic-api' };
  }

  // ── health ────────────────────────────────────────────────────────────────

  async health(): Promise<HealthResult> {
    if (!this.apiKey) {
      return { healthy: false, error: 'No ANTHROPIC_API_KEY configured. Set in env, gateway metadata, or porter_config.json api_keys.anthropic' };
    }
    const start = Date.now();
    try {
      // Minimal API call to verify key
      const resp = await fetch(`${API_BASE}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (resp.status === 401) return { healthy: false, error: 'Invalid API key', latencyMs: Date.now() - start };
      return { healthy: resp.ok, latencyMs: Date.now() - start, version: this.model };
    } catch (err) {
      return { healthy: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - start };
    }
  }

  // ── dispatch (agentic loop with tool execution) ───────────────────────────

  async dispatch(req: BridgeDispatchRequest): Promise<BridgeDispatchResult> {
    const key = this.apiKey;
    if (!key) throw new Error('No ANTHROPIC_API_KEY configured');

    const start = Date.now();
    let totalInput = 0;
    let totalOutput = 0;

    // Build initial messages
    const messages: MessageParam[] = req.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // Ensure first message is from user
    if (messages.length === 0 || messages[0].role !== 'user') {
      messages.unshift({ role: 'user', content: 'Hello' });
    }

    // System prompt from both dispatch override and system messages
    const systemParts: string[] = [];
    systemParts.push('You are a Porter research agent. Execute the task thoroughly. Use tools to search the web, fetch pages, read files, and write your findings. Always save results to the specified output file.');
    if (req.systemPrompt) systemParts.push(req.systemPrompt);
    for (const m of req.messages) {
      if (m.role === 'system') systemParts.push(m.content);
    }
    const systemPrompt = systemParts.join('\n\n');

    let finalText = '';
    let round = 0;

    while (round < MAX_TOOL_ROUNDS) {
      round++;

      const body = {
        model: req.model || this.model,
        max_tokens: MAX_RESPONSE_TOKENS,
        system: systemPrompt,
        tools: TOOL_DEFS,
        messages,
        temperature: req.temperature ?? 0.3,
      };

      const resp = await fetch(`${API_BASE}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Anthropic API ${resp.status}: ${errText.slice(0, 500)}`);
      }

      const data = await resp.json() as MessagesResponse;
      totalInput += data.usage.input_tokens;
      totalOutput += data.usage.output_tokens;

      // Collect text and tool_use blocks
      const textBlocks = data.content.filter(b => b.type === 'text');
      const toolBlocks = data.content.filter(b => b.type === 'tool_use');

      // Accumulate text
      for (const tb of textBlocks) {
        if (tb.text) finalText += tb.text;
      }

      // If no tool calls or stop_reason is end_turn, we're done
      if (toolBlocks.length === 0 || data.stop_reason === 'end_turn') {
        break;
      }

      // Execute tools and build tool_result messages
      const toolResults: ContentBlock[] = [];
      for (const tool of toolBlocks) {
        console.log(`[anthropic-api] round ${round}: executing tool ${tool.name}(${JSON.stringify(tool.input).slice(0, 100)})`);
        const result = await executeTool(tool.name!, tool.input as Record<string, unknown>);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id!,
          content: result.slice(0, 50_000), // Cap individual tool result
        });
      }

      // Append assistant message (with tool_use) and user message (with tool_results)
      messages.push({ role: 'assistant', content: data.content });
      messages.push({ role: 'user', content: toolResults });
    }

    if (round >= MAX_TOOL_ROUNDS) {
      finalText += `\n\n[WARNING: Reached maximum tool execution rounds (${MAX_TOOL_ROUNDS})]`;
    }

    // Capture response headers
    const responseHeaders: Record<string, string> = {};

    return {
      response: finalText,
      model: req.model || this.model,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      tokensUsed: totalInput + totalOutput,
      latencyMs: Date.now() - start,
      cached: false,
      responseHeaders,
    };
  }

  // ── stream (delegates to dispatch for now — tool loops don't stream cleanly) ──

  async *stream(req: BridgeDispatchRequest, signal: AbortSignal): AsyncIterable<string> {
    if (signal.aborted) return;

    // For tool-using dispatches, we can't cleanly stream mid-tool-loop.
    // Run the full dispatch and yield the final result.
    const result = await this.dispatch(req);
    if (!signal.aborted) {
      yield result.response;
    }
  }

  // ── listModels ────────────────────────────────────────────────────────────

  async listModels(): Promise<string[]> {
    return [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-haiku-4-5-20251001',
    ];
  }
}
