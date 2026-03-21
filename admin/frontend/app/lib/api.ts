export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

interface ApiOptions extends Omit<RequestInit, "body"> {
  json?: unknown
}

export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { json, headers: customHeaders, ...rest } = options

  const headers: Record<string, string> = {
    ...(customHeaders as Record<string, string>),
  }

  let body: BodyInit | undefined
  if (json !== undefined) {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(json)
  }

  const res = await fetch(path, {
    credentials: "include",
    headers,
    body,
    ...rest,
  })

  if (!res.ok) {
    let code = "UNKNOWN"
    let message = res.statusText

    try {
      const err = await res.json()
      if (err.error) {
        code = err.error.code || code
        message = err.error.message || message
      } else if (err.message) {
        message = err.message
      }
    } catch {
      // response wasn't JSON
    }

    throw new ApiError(res.status, code, message)
  }

  if (res.status === 204) return undefined as T

  const result = await res.json()

  // Unwrap envelope { data: T, meta: {...} }
  if (result && "data" in result) {
    return result.data as T
  }

  return result as T
}

export async function login(
  username: string,
  password: string,
): Promise<{ username: string; displayName: string }> {
  return api("/api/v1/auth/login", {
    method: "POST",
    json: { username, password },
  })
}

export async function logout(): Promise<void> {
  await api("/api/v1/auth/logout", { method: "POST" })
}

export async function getSession(): Promise<{
  username: string
  displayName: string
  role: string
  email?: string
} | null> {
  try {
    return await api("/api/v1/auth/me")
  } catch {
    return null
  }
}
