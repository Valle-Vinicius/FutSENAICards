const mockRpc = jest.fn();

jest.mock('../../../src/lib/supabase', () => ({
  get supabase() {
    return { rpc: mockRpc };
  },
}));

import {
  getCompetitiveHeadToHead,
  getCompetitiveLeaderboard,
  getCompetitiveProfile,
  getCompetitiveRatingHistory,
  searchCompetitiveHeadToHeadOpponents,
} from '../../../src/lib/services/leaderboard';

describe('competitive leaderboard service', () => {
  beforeEach(() => mockRpc.mockReset());

  it('requests a filtered page and maps ranked player rows', async () => {
    mockRpc.mockResolvedValue({
      data: [{
        position: 121,
        user_id: 'player-1',
        name: 'Atleta',
        avatar_url: null,
        rating: 1320,
        peak_rating: 1400,
        matches_played: 20,
        wins: 12,
        losses: 6,
        draws: 2,
        division: 'Prata',
      }],
      error: null,
    });

    await expect(getCompetitiveLeaderboard({
      limit: 20,
      offset: 120,
      division: 'Prata',
      search: 'At',
    })).resolves.toEqual([expect.objectContaining({
      position: 121,
      userId: 'player-1',
      rating: 1320,
      division: 'Prata',
      matchesPlayed: 20,
    })]);
    expect(mockRpc).toHaveBeenCalledWith('competitive_list_players', {
      p_limit: 20,
      p_offset: 120,
      p_division: 'Prata',
      p_search: 'At',
    });
  });

  it('maps unranked profiles without assigning a position or division', async () => {
    mockRpc.mockResolvedValue({
      data: {
        userId: 'player-2',
        name: 'Novato',
        avatarUrl: null,
        position: null,
        rating: 1000,
        peakRating: 1000,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        currentStreak: 0,
        bestWinStreak: 0,
        lastMatchAt: null,
        division: null,
        divisionRating: null,
        nextDivision: null,
        nextDivisionRating: null,
        winRate: 0,
      },
      error: null,
    });

    await expect(getCompetitiveProfile('player-2')).resolves.toEqual(expect.objectContaining({
      position: null,
      rating: 1000,
      matchesPlayed: 0,
      division: null,
    }));
  });

  it('requests event history with offset for honest chart pagination', async () => {
    mockRpc.mockResolvedValue({
      data: [{
        challenge_id: 'challenge-1',
        opponent_id: 'player-2',
        opponent_name: 'Adversário',
        opponent_avatar_url: null,
        result: 'win',
        score_for: 4,
        score_against: 2,
        rating_before: 1000,
        rating_after: 1016,
        rating_change: 16,
        division: 'Bronze',
        created_at: '2026-11-04T10:00:00Z',
      }],
      error: null,
    });

    await expect(getCompetitiveRatingHistory('player-1', 50, 50)).resolves.toEqual([
      expect.objectContaining({ challengeId: 'challenge-1', scoreFor: 4, ratingChange: 16 }),
    ]);
    expect(mockRpc).toHaveBeenCalledWith('competitive_get_rating_history', {
      p_user_id: 'player-1',
      p_limit: 50,
      p_offset: 50,
    });
  });

  it('uses the viewed profile and stable opponent UUID for head-to-head queries', async () => {
    mockRpc.mockResolvedValue({
      data: {
        historyType: 'historical_pvp',
        userId: 'player-1',
        opponentId: 'player-2',
        totalMatches: 2,
        userWins: 1,
        opponentWins: 0,
        draws: 1,
        lastMatchAt: '2026-11-04T10:00:00Z',
        matches: [],
      },
      error: null,
    });

    await expect(getCompetitiveHeadToHead('player-1', 'player-2', 10, 10)).resolves.toEqual(
      expect.objectContaining({ historyType: 'historical_pvp', userId: 'player-1', opponentId: 'player-2', draws: 1 }),
    );
    expect(mockRpc).toHaveBeenCalledWith('competitive_get_head_to_head', {
      p_user_id: 'player-1',
      p_opponent_id: 'player-2',
      p_limit: 10,
      p_offset: 10,
    });
  });

  it('searches historical PvP opponents including profiles without competitive ratings', async () => {
    mockRpc.mockResolvedValue({
      data: [{
        user_id: 'player-3',
        name: 'Histórico',
        avatar_url: null,
        rating: null,
      }],
      error: null,
    });

    await expect(searchCompetitiveHeadToHeadOpponents('player-1', 'His')).resolves.toEqual([{
      userId: 'player-3',
      name: 'Histórico',
      avatarUrl: null,
      rating: null,
    }]);
    expect(mockRpc).toHaveBeenCalledWith('competitive_search_head_to_head_opponents', {
      p_user_id: 'player-1',
      p_search: 'His',
      p_limit: 10,
    });
  });

  it('does not make a head-to-head opponent search for fewer than two characters', async () => {
    await expect(searchCompetitiveHeadToHeadOpponents('player-1', ' A ')).resolves.toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects a head-to-head response without the historical PvP scope marker', async () => {
    mockRpc.mockResolvedValue({
      data: { userId: 'player-1', opponentId: 'player-2', matches: [] },
      error: null,
    });

    await expect(getCompetitiveHeadToHead('player-1', 'player-2')).rejects.toThrow('tipo do histórico');
  });

  it('propagates backend errors instead of showing success-shaped data', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('RPC denied') });
    await expect(getCompetitiveLeaderboard()).rejects.toThrow('RPC denied');
  });
});
