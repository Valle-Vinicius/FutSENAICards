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

import { comparePoolShotPrediction, enqueuePoolShotOnce, getPoolShotPlaybackStartAt, getPoolShotsAfter, submitShot } from '../../../src/lib/services/pool';
import type { PoolShotEvent } from '../../../src/lib/services/pool';

describe('pool service', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockRefreshSession.mockReset();
    mockInvoke.mockReset();
    mockFrom.mockReset();
    mockRpc.mockReset();
  });

  it('starts the local player shot immediately instead of waiting for playbackAt', () => {
    expect(getPoolShotPlaybackStartAt({
      playerId: 'player-1',
      playbackAt: '2026-11-11T00:00:02.000Z',
    }, 'player-1', 1_000, 250)).toBe(1_250);
  });

  it('keeps the synchronized playbackAt for the opponent shot', () => {
    expect(getPoolShotPlaybackStartAt({
      playerId: 'player-2',
      playbackAt: '2026-11-11T00:00:02.000Z',
    }, 'player-1', 1_000, 250)).toBe(Date.parse('2026-11-11T00:00:02.000Z'));
  });

  it('accepts a matching local prediction within position tolerance', () => {
    const prediction: PoolShotEvent = {
      seq: 1,
      playerId: 'player-1',
      angle: 0,
      power: 0.5,
      anim: [[1, 2]],
      pocketed: [],
      foul: false,
      foulReason: null,
      firstContact: 3,
      nextPlayer: 2,
      winner: null,
      finalState: {
        balls: [{ x: 1, y: 2, pocketed: false }],
        currentPlayer: 2,
        foul: false,
        winner: null,
      },
      playbackAt: null,
      turnAvailableAt: null,
      version: null,
    };
    const authoritative = {
      ...prediction,
      finalState: {
        ...prediction.finalState,
        balls: [{ x: 1 + 5e-7, y: 2, pocketed: false }],
      },
    };

    expect(comparePoolShotPrediction(prediction, authoritative).matches).toBe(true);
    expect(comparePoolShotPrediction(prediction, {
      ...authoritative,
      nextPlayer: 1,
    }).differences).toContain('nextPlayer');
  });

  it('deduplicates HTTP, realtime, and polling events before, during, and after playback', () => {
    const orders = [
      ['HTTP', 'realtime', 'polling'],
      ['HTTP', 'polling', 'realtime'],
      ['realtime', 'HTTP', 'polling'],
      ['realtime', 'polling', 'HTTP'],
      ['polling', 'HTTP', 'realtime'],
      ['polling', 'realtime', 'HTTP'],
    ];
    const makeShot = (source: string): PoolShotEvent => ({
      seq: 5,
      playerId: source,
      angle: 0,
      power: 0.5,
      anim: [[1, 2]],
      pocketed: [],
      foul: false,
      foulReason: null,
      firstContact: 1,
      nextPlayer: 2,
      winner: null,
      finalState: { balls: [] },
      playbackAt: null,
      turnAvailableAt: null,
      version: null,
    });

    for (const phase of ['before', 'during', 'after'] as const) {
      for (const order of orders) {
        const queue = new Map<number, PoolShotEvent>();
        let lastPlayedSeq = 4;
        let activeSeq: number | null = null;
        let playCount = 0;
        const startAndFinish = () => {
          expect(queue.has(5)).toBe(true);
          queue.delete(5);
          activeSeq = 5;
          playCount += 1;
          activeSeq = null;
          lastPlayedSeq = 5;
        };

        if (phase === 'before') {
          order.forEach(source => enqueuePoolShotOnce(queue, makeShot(source), lastPlayedSeq, activeSeq));
          startAndFinish();
        } else if (phase === 'during') {
          enqueuePoolShotOnce(queue, makeShot(order[0]), lastPlayedSeq, activeSeq);
          queue.delete(5);
          activeSeq = 5;
          playCount += 1;
          order.slice(1).forEach(source => enqueuePoolShotOnce(queue, makeShot(source), lastPlayedSeq, activeSeq));
          activeSeq = null;
          lastPlayedSeq = 5;
        } else {
          enqueuePoolShotOnce(queue, makeShot(order[0]), lastPlayedSeq, activeSeq);
          startAndFinish();
          order.slice(1).forEach(source => enqueuePoolShotOnce(queue, makeShot(source), lastPlayedSeq, activeSeq));
        }

        expect(playCount).toBe(1);
        expect(queue.size).toBe(0);
      }
    }
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
