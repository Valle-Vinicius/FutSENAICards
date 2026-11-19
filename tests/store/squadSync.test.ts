import { waitFor } from '@testing-library/react';
import { DEFAULT_ACHIEVEMENTS, DEFAULT_MISSIONS } from '../../src/lib/game';

const mockGetCards = jest.fn();
const mockAddCard = jest.fn();
const mockUpdateCard = jest.fn();
const mockAddMatch = jest.fn();
const mockSaveSquad = jest.fn();
const mockGetSavedSquads = jest.fn();
const mockGetPrimarySquad = jest.fn();
const mockUpsertPrimarySquad = jest.fn();
const mockGetMissions = jest.fn();
const mockUpsertMissions = jest.fn();
const mockGetAchievements = jest.fn();
const mockUpsertAchievements = jest.fn();
const mockGetSettings = jest.fn();
const mockUpdateSettings = jest.fn();
const mockUpdateCollectorRanking = jest.fn();
const mockGetListings = jest.fn();
const mockCreateListing = jest.fn();
const mockCancelListing = jest.fn();
const mockPersistComparePair = jest.fn();
const mockGetSession = jest.fn();
const mockRpc = jest.fn();
const profileQuery = {
  select: jest.fn(),
  eq: jest.fn(),
  single: jest.fn(),
};
const mockSupabase = {
  from: jest.fn(() => profileQuery),
  auth: { getSession: mockGetSession },
  rpc: mockRpc,
};

jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }));
jest.mock('../../src/lib/supabase', () => ({
  get supabase() {
    return mockSupabase;
  },
}));
jest.mock('../../src/lib/services/cards', () => ({
  getCards: mockGetCards,
  addCard: mockAddCard,
  updateCard: mockUpdateCard,
}));
jest.mock('../../src/lib/services/matches', () => ({ addMatch: mockAddMatch }));
jest.mock('../../src/lib/services/squads', () => ({
  saveSquad: mockSaveSquad,
  getSavedSquads: mockGetSavedSquads,
  getSquad: mockGetPrimarySquad,
  upsertPrimarySquad: mockUpsertPrimarySquad,
}));
jest.mock('../../src/lib/services/missions', () => ({
  getMissions: mockGetMissions,
  upsertMissions: mockUpsertMissions,
}));
jest.mock('../../src/lib/services/achievements', () => ({
  getAchievements: mockGetAchievements,
  upsertAchievements: mockUpsertAchievements,
}));
jest.mock('../../src/lib/services/settings', () => ({
  getSettings: mockGetSettings,
  updateSettings: mockUpdateSettings,
}));
jest.mock('../../src/lib/services/leaderboard', () => ({
  updateCollectorRanking: mockUpdateCollectorRanking,
}));
jest.mock('../../src/lib/services/marketplace', () => ({
  getListings: mockGetListings,
  toGameListing: jest.fn(),
  createListing: mockCreateListing,
  cancelListing: mockCancelListing,
}));
jest.mock('../../src/lib/services/compare', () => ({
  persistComparePair: mockPersistComparePair,
}));

import { useGame } from '../../src/store/useGame';

describe('primary squad sync', () => {
  beforeEach(() => {
    mockPersistComparePair.mockReset();
    mockGetCards.mockReset().mockResolvedValue(null);
    mockAddCard.mockReset();
    mockUpdateCard.mockReset();
    mockGetSavedSquads.mockReset().mockResolvedValue([]);
    mockGetMissions.mockReset().mockResolvedValue([]);
    mockUpsertMissions.mockReset().mockResolvedValue(undefined);
    mockGetAchievements.mockReset().mockResolvedValue([]);
    mockUpsertAchievements.mockReset().mockResolvedValue(undefined);
    mockGetSettings.mockReset().mockResolvedValue(null);
    mockGetListings.mockReset().mockResolvedValue([]);
    mockGetPrimarySquad.mockReset().mockResolvedValue(null);
    mockGetSession.mockReset().mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });
    mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
    profileQuery.select.mockReset().mockReturnValue(profileQuery);
    profileQuery.eq.mockReset().mockReturnValue(profileQuery);
    profileQuery.single.mockReset().mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('keeps starter UIDs as strings when loading the primary squad', async () => {
    mockGetPrimarySquad.mockResolvedValue({
      sport: 'futsal',
      formation: '1-2-1',
      starters: [
        { position: 'GK', uid: 'card-gk' },
        { position: 'Fixo', uid: 'card-fixo' },
        { position: 'Ala', uid: 'card-ala-1' },
        { position: 'Ala', uid: 'card-ala-2' },
        { position: 'Pivo', uid: 'card-pivo' },
      ],
      bench: [],
    });
    useGame.setState({
      cards: [],
      squads: {
        futsal: {
          sport: 'futsal',
          formation: '1-2-1',
          starters: [
            { position: 'GK', uid: null },
            { position: 'Fixo', uid: null },
            { position: 'Ala', uid: null },
            { position: 'Ala', uid: null },
            { position: 'Pivo', uid: null },
          ],
          bench: [null, null, null, null, null],
        },
      },
    });

    await useGame.getState().syncUserData('user-1');

    expect(useGame.getState().squads.futsal.starters.map(slot => slot.uid)).toEqual([
      'card-gk',
      'card-fixo',
      'card-ala-1',
      'card-ala-2',
      'card-pivo',
    ]);
  });

  it('only adds and persists a comparison pair when it differs from the latest pair', () => {
    useGame.setState({ compareHistory: [] });
    const addCompareHistory = useGame.getState().addCompareHistory;

    addCompareHistory('card-a', 'card-b');
    addCompareHistory('card-b', 'card-a');
    addCompareHistory('card-a', 'card-c');
    addCompareHistory('card-a', 'card-a');

    expect(useGame.getState().compareHistory.map(({ aUid, bUid }) => [aUid, bUid])).toEqual([
      ['card-a', 'card-c'],
      ['card-a', 'card-b'],
    ]);
    expect(mockPersistComparePair.mock.calls).toEqual([
      ['card-a', 'card-b'],
      ['card-a', 'card-c'],
    ]);
  });

  it('does not sync default missions or achievements during initialization', async () => {
    useGame.setState({
      cards: [],
      packsOpened: 0,
      coins: 0,
      missions: DEFAULT_MISSIONS.map(mission => ({ ...mission })),
      achievements: DEFAULT_ACHIEVEMENTS.map(achievement => ({ ...achievement })),
      squads: {
        futsal: {
          sport: 'futsal',
          formation: '1-2-1',
          starters: [],
          bench: [],
        },
      },
    });

    useGame.getState().init();
    await waitFor(() => expect(profileQuery.single).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockUpsertMissions).not.toHaveBeenCalled();
    expect(mockUpsertAchievements).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('debounces one RPC with only changed missions and achievements', async () => {
    jest.useFakeTimers();
    useGame.setState({
      cards: [],
      packsOpened: 0,
      coins: 0,
      missions: DEFAULT_MISSIONS.map(mission => ({ ...mission })),
      achievements: DEFAULT_ACHIEVEMENTS.map(achievement => ({ ...achievement })),
      squads: {
        futsal: {
          sport: 'futsal',
          formation: '1-2-1',
          starters: [
            { position: 'GK', uid: null },
            { position: 'Fixo', uid: null },
            { position: 'Ala', uid: null },
            { position: 'Ala', uid: null },
            { position: 'Pivo', uid: null },
          ],
          bench: [null, null, null, null, null],
        },
      },
    });
    await useGame.getState().syncUserData('user-1');
    mockRpc.mockClear();

    useGame.setState({ packsOpened: 1, coins: 10000 });
    useGame.getState().updateMissionProgress();

    await jest.advanceTimersByTimeAsync(2999);
    expect(mockRpc).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('sync_game_progress', {
      p_missions: expect.arrayContaining([
        expect.objectContaining({ mission_id: 'm1', progress: 1, completed: true }),
        expect.objectContaining({ mission_id: 'm3', progress: 1 }),
        expect.objectContaining({ mission_id: 'm10', progress: 1 }),
      ]),
      p_achievements: [
        expect.objectContaining({ achievement_id: 'a3', unlocked: true }),
      ],
      p_preferences: {},
    });
    expect(mockRpc.mock.calls[0][1].p_missions.map((mission: { mission_id: string }) => mission.mission_id))
      .toEqual(['m1', 'm3', 'm10']);
    expect(mockRpc.mock.calls[0][1].p_achievements.map((achievement: { achievement_id: string }) => achievement.achievement_id))
      .toEqual(['a3']);
    expect(mockUpsertMissions).not.toHaveBeenCalled();
    expect(mockUpsertAchievements).not.toHaveBeenCalled();
  });
});
