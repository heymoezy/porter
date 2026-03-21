import crypto from 'crypto';

export interface Meta {
  trace_id: string;
  timestamp: number;
}

export interface OkResponse<T> {
  ok: true;
  data: T;
  meta: Meta;
}

export interface ErrResponse {
  ok: false;
  error: { code: string; message: string; trace_id: string };
  meta: Meta;
}

export function ok<T>(data: T, traceId?: string): OkResponse<T> {
  const tid = traceId ?? crypto.randomUUID();
  return { ok: true, data, meta: { trace_id: tid, timestamp: Date.now() } };
}

export function err(code: string, message: string, traceId?: string): ErrResponse {
  const tid = traceId ?? crypto.randomUUID();
  return { ok: false, error: { code, message, trace_id: tid }, meta: { trace_id: tid, timestamp: Date.now() } };
}
