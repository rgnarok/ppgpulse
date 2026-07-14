const ACCESS_KEY = 'ppg_access';
const REFRESH_KEY = 'ppg_refresh';

export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set: (access: string, refresh: string) => {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = 'error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// API origin. Empty = same-origin (single-origin Render/dev via Vite proxy).
// On Vercel, set VITE_API_BASE_URL to the API host, e.g. https://ppg-api.onrender.com
const API_ROOT = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
const BASE = `${API_ROOT}/api`;

/** Build an absolute API URL (e.g. for <a href> download links). */
export function apiUrl(path: string): string {
  return `${API_ROOT}${path}`;
}

let refreshInFlight: Promise<boolean> | null = null;

/** Attempt to rotate tokens using the stored refresh token. Deduped. */
async function tryRefresh(): Promise<boolean> {
  const refresh = tokenStore.getRefresh();
  if (!refresh) return false;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh }),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { access: string; refresh: string };
        tokenStore.set(data.access, data.refresh);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  raw?: boolean; // return the Response instead of parsed JSON
  isForm?: boolean;
}

/** Authenticated fetch with a single transparent refresh-and-retry on 401. */
export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    const access = tokenStore.getAccess();
    if (access) headers.Authorization = `Bearer ${access}`;
    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      if (options.isForm) {
        body = options.body as BodyInit;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.body);
      }
    }
    return fetch(`${BASE}${path}`, { method: options.method ?? 'GET', headers, body });
  };

  let res = await doFetch();
  if (res.status === 401 && (await tryRefresh())) {
    res = await doFetch();
  }

  if (!res.ok) {
    let code = 'error';
    let message = res.statusText;
    try {
      const err = await res.json();
      code = err.error ?? code;
      message = err.message ?? message;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, message, code);
  }

  if (options.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Login stores tokens and returns the user summary. */
export async function loginRequest(email: string, password: string) {
  // Free API hosts cold-start slowly; allow up to 60s, then fail with a clear message.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = (err as { name?: string }).name === 'AbortError';
    throw new ApiError(
      0,
      aborted
        ? `The API did not respond (${API_ROOT || 'same-origin'}). If it is on a free host it may be waking up — try again in a minute.`
        : `Could not reach the API at ${API_ROOT || '(same origin)'}. Check VITE_API_BASE_URL.`,
      'network',
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) {
    throw new ApiError(401, 'Invalid email or password', 'bad_credentials');
  }
  // A misconfigured API base returns the SPA's HTML instead of JSON.
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.includes('application/json')) {
    throw new ApiError(
      res.status,
      `Unexpected response from the API (${API_ROOT || 'same-origin'}). Set VITE_API_BASE_URL to your API URL and redeploy.`,
      'bad_api',
    );
  }
  const data = (await res.json()) as {
    access: string;
    refresh: string;
    user: { id: string; name: string; email: string; role: { key: string; label: string } };
  };
  tokenStore.set(data.access, data.refresh);
  return data.user;
}

export async function logoutRequest() {
  const refresh = tokenStore.getRefresh();
  try {
    await fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });
  } catch {
    /* ignore */
  }
  tokenStore.clear();
}
