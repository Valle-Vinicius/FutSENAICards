const mockGetSession = jest.fn();
const mockRefreshSession = jest.fn();
const mockInvoke = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('../../../src/lib/supabase', () => ({
  get supabase() {
    return {
      from: mockFrom,
      rpc: mockRpc,
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
    mockRpc.mockReset();
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
        data: [{
          seq: 4,
          player_id: 'player-2',
          angle: 0.4,
          power: 0.6,
          result: {
            anim: [[1, 2], [3, 4]],
            pocketed: [3],
            foul: false,
            nextPlayer: 2,
            finalState: { balls: [] },
            playbackAt: '2026-11-11T00:00:02.000Z',
            turnAvailableAt: '2026-11-11T00:00:10.000Z',
            version: 4,
          },
        }],
        error: null,
      }),
    });
    mockFrom.mockReturnValue(query);

    await expect(getPoolShotsAfter('match-1', 3)).resolves.toEqual([{
      seq: 4,
      playerId: 'player-2',
      angle: 0.4,
      power: 0.6,
      anim: [[1, 2], [3, 4]],
      pocketed: [3],
      foul: false,
      foulReason: null,
      firstContact: null,
      nextPlayer: 2,
      winner: null,
      finalState: { balls: [] },
      playbackAt: '2026-11-11T00:00:02.000Z',
      turnAvailableAt: '2026-11-11T00:00:10.000Z',
      version: 4,
    }]);
    expect(mockFrom).toHaveBeenCalledWith('pool_shots');
    expect(query.gt).toHaveBeenCalledWith('seq', 3);
    expect(query.order).toHaveBeenCalledWith('seq', { ascending: true });
  });

  it('estimates the server clock offset from the midpoint of the RPC round trip', async () => {
    mockRpc.mockResolvedValue({ data: '1970-01-01T00:00:02.000Z', error: null });
    const now = jest.spyOn(Date, 'now')
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(3_000);

    const { getPoolServerClockOffsetMs } = await import('../../../src/lib/services/pool');

    await expect(getPoolServerClockOffsetMs()).resolves.toBe(0);
    expect(mockRpc).toHaveBeenCalledWith('pool_server_time');
    now.mockRestore();
  });
});
