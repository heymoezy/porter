import crypto from 'crypto';

export interface Meta {
  request_id: string;
  timestamp: number;
}

export interface OkResponse<T> {
  data: T;
  meta: Meta;
}

export interface ErrResponse {
  error: { code: string; message: string };
  meta: Meta;
}

export function meta(): Meta {
  return { request_id: crypto.randomUUID(), timestamp: Date.now() };
}

export function ok<T>(data: T): OkResponse<T> {
  return { data, meta: meta() };
}

export function err(code: string, message: string): ErrResponse {
  return { error: { code, message }, meta: meta() };
}
