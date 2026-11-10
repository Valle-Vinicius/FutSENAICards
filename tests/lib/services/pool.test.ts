const mockGetSession = jest.fn();
const mockRefreshSession = jest.fn();
const mockInvoke = jest.fn();
const mockFrom = jest.fn();

jest.mock('../../../src/lib/supabase', () => ({
  get supabase() {
    return {
      from: mockFrom,
      auth: {
        getSession: mockGetSession,
        refreshSession: mockRefreshSession,
      },
      functions: { invoke: mockInvoke },
    };
  },
}));

import { getPoolShotsAfter, submitShot } from '../../../src/lib/services/pool';

describe('pool service', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockRefreshSession.mockReset();
    mockInvoke.mockReset();
    mockFrom.mockReset();
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
      .mockResolvedValueOnce({ data: { finalState: {}, seq: 2 }, error: null });

    await expect(submitShot('match-1', 0.4, 0.7)).resolves.toEqual({ finalState: {}, seq: 2 });

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

  it('loads ordered shot animations after a sequence for realtime recovery', async () => {
    const query: any = {};
    Object.assign(query, {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      gt: jest.fn(() => query),
      order: jest.fn(() => query),
      then: (resolve: (value: unknown) => void) => resolve({
        data: [{ seq: 4, player_id: 'player-2', result: { anim: [[1, 2], [3, 4]] } }],
        error: null,
      }),
    });
    mockFrom.mockReturnValue(query);

    await expect(getPoolShotsAfter('match-1', 3)).resolves.toEqual([{
      seq: 4,
      playerId: 'player-2',
      anim: [[1, 2], [3, 4]],
    }]);
    expect(mockFrom).toHaveBeenCalledWith('pool_shots');
    expect(query.gt).toHaveBeenCalledWith('seq', 3);
    expect(query.order).toHaveBeenCalledWith('seq', { ascending: true });
  });
});
