/**
 * Porter API client — wraps fetch with auth, error handling, and typed responses.
 */

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function api<T = unknown>(
  path: string,
  options?: RequestInit & { json?: unknown }
): Promise<T> {
  const { json, ...fetchOpts } = options ?? {};
  const init: RequestInit = {
    ...fetchOpts,
    credentials: 'include',
  };
  if (json !== undefined) {
    init.method = init.method ?? 'POST';
    init.headers = {
      ...init.headers as Record<string, string>,
      'Content-Type': 'application/json',
    };
    init.body = JSON.stringify(json);
  }
  const res = await fetch(path, init);
  if (res.status === 401) {
    window.location.href = '/v2/login';
    throw new ApiError(401, 'Unauthorized');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function login(username: string, password: string): Promise<boolean> {
  const res = await fetch('/api/v1/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) return false;
  const json = await res.json();
  return json.data?.username != null; // v1 envelope: {data: {username}, meta: {...}}
}

export async function logout(): Promise<void> {
  await fetch('/api/v1/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
  window.location.href = '/v2/login';
}
