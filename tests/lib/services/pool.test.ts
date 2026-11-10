const mockGetSession = jest.fn();
const mockRefreshSession = jest.fn();
const mockInvoke = jest.fn();

jest.mock('../../../src/lib/supabase', () => ({
  get supabase() {
    return {
      auth: {
        getSession: mockGetSession,
        refreshSession: mockRefreshSession,
      },
      functions: { invoke: mockInvoke },
    };
  },
}));

import { submitShot } from '../../../src/lib/services/pool';

describe('pool service', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockRefreshSession.mockReset();
    mockInvoke.mockReset();
  });

  it('renews the session and retries a shot rejected as unauthorized', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'expired-token' } },
      error: null,
    });
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: 'fresh-token' } },
      error: null,
    });
    mockInvoke
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: 'FunctionsHttpError',
          context: {
            status: 401,
            clone: () => ({ json: async () => ({ error: 'invalid session' }) }),
          },
        },
      })
      .mockResolvedValueOnce({ data: { finalState: {} }, error: null });

    await expect(submitShot('match-1', 0.4, 0.7)).resolves.toEqual({ finalState: {} });

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'pool-shot', expect.objectContaining({
      headers: { Authorization: 'Bearer expired-token' },
    }));
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'pool-shot', expect.objectContaining({
      headers: { Authorization: 'Bearer fresh-token' },
    }));
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  });

  it('does not send a shot without an authenticated session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(submitShot('match-1', 0.4, 0.7)).resolves.toEqual({
      error: 'Sua sessão expirou. Entre novamente.',
    });
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
