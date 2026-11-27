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

import { getChallengeData } from '../../../src/lib/services/challenges';

const challengeData = {
  challenge: {
    id: 'challenge-1',
    challenger_id: 'challenger-1',
    challenged_id: 'challenged-1',
    status: 'accepted' as const,
    created_at: '2026-11-26T00:00:00.000Z',
  },
  home: { name: 'Ana', formation: '1-2-1', cards: [] },
  away: { name: 'Bia', formation: '1-2-1', cards: [] },
  cardDetailsById: {},
};

describe('challenge data service', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockRefreshSession.mockReset();
    mockInvoke.mockReset();
  });

  it('renews the session and retries when the lineup function rejects its token', async () => {
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
            clone: () => ({ json: async () => ({ error: 'invalid token' }) }),
          },
        },
      })
      .mockResolvedValueOnce({ data: challengeData, error: null });

    await expect(getChallengeData('challenge-1')).resolves.toEqual(challengeData);

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'get-challenge-data', expect.objectContaining({
      headers: { Authorization: 'Bearer expired-token' },
    }));
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'get-challenge-data', expect.objectContaining({
      headers: { Authorization: 'Bearer fresh-token' },
    }));
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  });

  it('does not call the lineup function without an authenticated session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(getChallengeData('challenge-1')).rejects.toThrow('Sua sessão expirou. Entre novamente.');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('preserves the function auth error when session refresh also fails', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'expired-token' } },
      error: null,
    });
    mockRefreshSession.mockResolvedValue({
      data: { session: null },
      error: new Error('Refresh token expired'),
    });
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'FunctionsHttpError',
        context: {
          status: 401,
          clone: () => ({ json: async () => ({ error: 'Invalid JWT', authCode: 'bad_jwt' }) }),
        },
      },
    });

    await expect(getChallengeData('challenge-1'))
      .rejects.toThrow('Invalid JWT (a renovação da sessão também falhou: Refresh token expired)');
  });
});
