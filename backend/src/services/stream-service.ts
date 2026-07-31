/**
 * Stream Service — thin wrapper around Bridge Routing Engine.
 * All chat streams route through Claude CLI.
 */

import { routingEngine } from './bridge/routing-engine.js';
import type { BridgeDispatchRequest, RoutingContext } from './bridge/types.js';

export interface StreamBackend {
  name: string;
  stream(prompt: string, signal: AbortSignal, systemPrompt?: string): AsyncIterable<string>;
}

export interface StreamOptions {
  /** See BridgeDispatchRequest.tools — passes through to the adapter. */
  tools?: 'none' | 'default' | string[];
  /** Optional model id — passed to the adapter as req.model (e.g. claude-sonnet-4-6). */
  model?: string;
  /**
   * A git worktree to run the session in. See BridgeDispatchRequest.workspace.
   *
   * ⚠️ Must be listed HERE explicitly. Anything not named in StreamOptions is
   * swept into the routing context by the spread in selectStreamBackend and
   * never reaches the adapter — which is exactly what happened on the first
   * code-changing job: Porter created the worktree, logged it, and the session
   * still ran in /tmp having quietly lost the field.
   */
  workspace?: string;
}

export async function streamFromBridge(
  prompt: string,
  signal: AbortSignal,
  ctx: RoutingContext,
  systemPrompt?: string,
  options?: StreamOptions,
): Promise<AsyncIterable<string>> {
  const req: BridgeDispatchRequest = {
    messages: [{ role: 'user', content: prompt }],
    systemPrompt,
    ...(options?.tools ? { tools: options.tools } : {}),
    ...(options?.model ? { model: options.model } : {}),
    ...(options?.workspace ? { workspace: options.workspace } : {}),
  };
  const { stream } = await routingEngine.selectStreamWithFallback(ctx, req, signal);
  return stream;
}

/**
 * Legacy selector — maintained for backward compatibility with Chat controllers.
 * Backend param is ignored (always Claude CLI).
 */
export async function selectStreamBackend(
  message: string,
  _backend?: string,
  ctxOverride?: Partial<RoutingContext> & StreamOptions,
): Promise<StreamBackend> {
  const tools = ctxOverride?.tools;
  const workspace = ctxOverride?.workspace;
  const model = ctxOverride?.model;
  return {
    name: 'claude_cli',
    async *stream(prompt: string, signal: AbortSignal, systemPrompt?: string): AsyncIterable<string> {
      const { tools: _drop, model: _dropModel, workspace: _dropWorkspace, ...routingCtxRest } = ctxOverride ?? {};
      const ctx: RoutingContext = { message, ...routingCtxRest };
      const iterable = await streamFromBridge(prompt, signal, ctx, systemPrompt, { tools, model, workspace });
      for await (const token of iterable) {
        yield token;
      }
    },
  };
}
