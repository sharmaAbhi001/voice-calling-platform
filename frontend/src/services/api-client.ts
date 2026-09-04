declare const __API_BASE_URL__: string;

export const API_BASE_URL = __API_BASE_URL__;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const TOKEN_KEY = 'voiceops.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

/**
 * The single place the UI talks to the backend. Errors always arrive as ApiError
 * with a human-readable message, so every screen can render the same error state.
 */
export const apiRequest = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  // The base may be relative ("/api", how the production build reaches nginx) or
  // absolute ("http://localhost:4000" in development). new URL rejects a relative
  // string on its own, and ignores the second argument when the first is absolute,
  // so passing the page origin covers both.
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const token = tokenStore.get();
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as { error?: { code: string; message: string; details?: unknown } })
      ?.error;
    if (response.status === 401) tokenStore.clear();
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.details,
    );
  }

  return payload as T;
};
