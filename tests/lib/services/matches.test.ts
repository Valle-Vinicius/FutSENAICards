const mockInsert = jest.fn();
const mockFrom = jest.fn(() => ({ insert: mockInsert }));

jest.mock('../../../src/lib/supabase', () => ({
  get supabase() {
    return { from: mockFrom };
  },
}));

import { addMatch } from '../../../src/lib/services/matches';

describe('match history service', () => {
  beforeEach(() => {
    mockFrom.mockClear();
    mockInsert.mockReset();
  });

  it('keeps PvP challenge history out of the client-controlled matches table', async () => {
    await expect(addMatch('player-1', {
      sport: 'futsal',
      matchType: 'pvp',
      challengeId: 'challenge-1',
      status: 'completed',
      homeScore: 2,
      awayScore: 1,
      opponent: 'Adversário',
    })).resolves.toBeNull();

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects PvP identifiers even when the caller labels the record as friendly', async () => {
    await expect(addMatch('player-1', {
      sport: 'futsal',
      matchType: 'friendly',
      challengeId: 'challenge-1',
      status: 'completed',
      homeScore: 2,
      awayScore: 1,
      opponent: 'Adversário',
    })).resolves.toBeNull();

    await expect(addMatch('player-1', {
      sport: 'futsal',
      matchType: 'pvp',
      status: 'completed',
      homeScore: 2,
      awayScore: 1,
      opponent: 'Adversário',
    })).resolves.toBeNull();

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('continues saving local and AI match history', async () => {
    mockInsert.mockReturnValue({
      select: () => ({
        single: async () => ({
          data: {
            id: 'match-1',
            user_id: 'player-1',
            sport: 'futsal',
            match_type: 'friendly',
            challenge_id: null,
            status: 'completed',
            home_score: 3,
            away_score: 1,
            opponent: 'IA (normal)',
            created_at: '2026-11-04T10:00:00Z',
          },
          error: null,
        }),
      }),
    });

    await expect(addMatch('player-1', {
      sport: 'futsal',
      matchType: 'friendly',
      status: 'completed',
      homeScore: 3,
      awayScore: 1,
      opponent: 'IA (normal)',
    })).resolves.toEqual(expect.objectContaining({
      id: 'match-1',
      matchType: 'friendly',
      challengeId: null,
    }));

    expect(mockFrom).toHaveBeenCalledWith('matches');
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      match_type: 'friendly',
      challenge_id: null,
    }));
  });
});
