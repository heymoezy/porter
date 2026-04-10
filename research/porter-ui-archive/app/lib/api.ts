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

/**
 * Fetch wrapper for Porter v1 API.
 * - Automatically includes credentials (cookie auth)
 * - Unwraps the { data, meta } envelope
 * - Throws ApiError on non-2xx responses
 */
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

  // Some endpoints return 204 No Content
  if (res.status === 204) return undefined as T

  const result = await res.json()

  // Unwrap v1 envelope { data: T, meta: {...} }
  if (result && "data" in result) {
    return result.data as T
  }

  return result as T
}

export async function login(
  email: string,
  password: string,
): Promise<{ username: string; displayName: string }> {
  return api("/api/v1/auth/login", {
    method: "POST",
    json: { email, password },
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
  emailVerified?: number
} | null> {
  try {
    return await api("/api/v1/auth/me")
  } catch {
    return null
  }
}
