import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { api, loginRequest, tokenStore } from './api';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client (T7.2)', () => {
  it('attaches the bearer token', async () => {
    tokenStore.set('access-1', 'refresh-1');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    await api('/me');
    const init = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Bearer access-1');
  });

  it('refreshes once on 401 then retries the original request', async () => {
    tokenStore.set('stale-access', 'good-refresh');
    let call = 0;
    const fetchMock = vi.fn(async (url: string) => {
      call += 1;
      if (url.includes('/auth/refresh')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ access: 'new-access', refresh: 'new-refresh' }),
        };
      }
      // First /me call → 401, second (post-refresh) → 200
      if (call === 1) return { ok: false, status: 401, json: async () => ({ error: 'bad_token' }) };
      return { ok: true, status: 200, json: async () => ({ email: 'x@vayuz.com' }) };
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const result = await api<{ email: string }>('/me');
    expect(result.email).toBe('x@vayuz.com');
    expect(tokenStore.getAccess()).toBe('new-access');
    // 3 calls: /me(401) → /auth/refresh → /me(200)
    expect((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
  });

  it('throws ApiError when refresh also fails', async () => {
    tokenStore.set('stale', 'bad-refresh');
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/auth/refresh')) return { ok: false, status: 401, json: async () => ({}) };
      return { ok: false, status: 401, json: async () => ({ error: 'bad_token' }) };
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    await expect(api('/me')).rejects.toMatchObject({ status: 401 });
  });

  it('loginRequest stores tokens', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({
        access: 'a',
        refresh: 'r',
        user: {
          id: 'u_kb',
          name: 'K',
          email: 'k@vayuz.com',
          role: { key: 'super_admin', label: 'x' },
        },
      }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const user = await loginRequest('k@vayuz.com', 'pw');
    expect(user.role.key).toBe('super_admin');
    expect(tokenStore.getAccess()).toBe('a');
  });
});
