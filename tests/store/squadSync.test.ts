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
const mockRefreshCollectorRanking = jest.fn();
const mockGetListings = jest.fn();
const mockCreateListing = jest.fn();
const mockCancelListing = jest.fn();
const mockPersistComparePair = jest.fn();
const mockRpc = jest.fn();
const mockGetSession = jest.fn();
const profileQuery = {
  select: jest.fn(),
  eq: jest.fn(),
  single: jest.fn(),
};
const mockSupabase = {
  auth: { getSession: mockGetSession },
  rpc: mockRpc,
  from: jest.fn(() => profileQuery),
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
  refreshCollectorRanking: mockRefreshCollectorRanking,
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
import { DEFAULT_PACKS } from '../../src/lib/game';

describe('primary squad sync', () => {
  beforeEach(() => {
    mockPersistComparePair.mockReset();
    mockGetCards.mockResolvedValue(null);
    mockGetSavedSquads.mockResolvedValue([]);
    mockGetMissions.mockResolvedValue([]);
    mockUpsertMissions.mockResolvedValue(undefined);
    mockGetAchievements.mockResolvedValue([]);
    mockGetSettings.mockResolvedValue(null);
    mockGetListings.mockResolvedValue([]);
    profileQuery.select.mockReturnValue(profileQuery);
    profileQuery.eq.mockReturnValue(profileQuery);
    profileQuery.single.mockResolvedValue({ data: null, error: null });
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
          starters: [],
          bench: [],
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
});

describe('open pack action', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockGetSession.mockReset();
    mockRefreshCollectorRanking.mockReset().mockReturnValue(new Promise(() => {}));
    useGame.setState({
      cards: [],
      coins: 5000,
      packsOpened: 0,
      transactions: [],
      newCardUids: [],
      packConfigs: DEFAULT_PACKS.map(pack => ({ ...pack })),
      achievements: useGame.getState().achievements.map(achievement => ({ ...achievement, unlocked: false })),
    });
  });

  it('returns cards as soon as the open_pack RPC completes without awaiting session or ranking requests', async () => {
    let resolveOpenPack: ((value: { data: unknown[]; error: null }) => void) | undefined;
    mockRpc.mockImplementation((name: string) => {
      if (name === 'open_pack') {
        return new Promise(resolve => {
          resolveOpenPack = resolve;
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    mockGetSession.mockReturnValue(new Promise(() => {}));

    const opening = useGame.getState().openPack('bronze');
    expect(mockRpc).toHaveBeenCalledWith('open_pack', { p_pack_id: 'bronze' });
    expect(mockGetSession).not.toHaveBeenCalled();

    resolveOpenPack?.({
      data: [{
        uid: 'card-1',
        player_id: 'player-1',
        name: 'Atleta',
        card_position: 'Ala',
        sport: 'futsal',
        nationality: 'Brasil',
        age: 20,
        club: 'SENAI',
        rarity: 'rare',
        edition: '2026',
        special: 'none',
        overall: 80,
        pace: 80,
        shooting: 80,
        passing: 80,
        dribbling: 80,
        defending: 80,
        physical: 80,
        reflexes: null,
        positioning: null,
        handling: null,
        image: null,
        extra_stats: [],
        choice_id: null,
        remaining_coins: 4500,
        created_at: '2026-11-18T00:00:00.000Z',
      }],
      error: null,
    });

    await expect(opening).resolves.toEqual({
      cards: [expect.objectContaining({ uid: 'card-1', name: 'Atleta' })],
    });
    expect(mockGetSession).toHaveBeenCalled();
    expect(mockRefreshCollectorRanking).toHaveBeenCalled();
  });

  it('opens a bulk quantity through the protected RPC and applies the final balance', async () => {
    mockGetSession.mockReturnValue(new Promise(() => {}));
    const row = {
      uid: 'card-0',
      player_id: 'player-0',
      name: 'Atleta',
      card_position: 'Ala',
      sport: 'futsal',
      nationality: 'Brasil',
      age: 20,
      club: 'SENAI',
      rarity: 'rare',
      edition: '2026',
      special: 'none',
      overall: 80,
      pace: 80,
      shooting: 80,
      passing: 80,
      dribbling: 80,
      defending: 80,
      physical: 80,
      reflexes: null,
      positioning: null,
      handling: null,
      image: null,
      extra_stats: [],
      choice_id: null,
      remaining_coins: 2500,
      created_at: '2026-11-18T00:00:00.000Z',
    };
    mockRpc.mockResolvedValue({
      data: Array.from({ length: 15 }, (_, index) => ({
        ...row,
        uid: `card-${index}`,
        player_id: `player-${index}`,
        remaining_coins: index === 0 ? 4500 : 2500,
      })),
      error: null,
    });

    await expect(useGame.getState().openPack('bronze', 5)).resolves.toEqual({
      cards: expect.arrayContaining([expect.objectContaining({ uid: 'card-0' })]),
    });

    expect(mockRpc).toHaveBeenCalledWith('open_packs_bulk', { p_pack_id: 'bronze', p_count: 5 });
    expect(useGame.getState().coins).toBe(2500);
    expect(useGame.getState().packsOpened).toBe(5);
    expect(useGame.getState().transactions[0]).toEqual(expect.objectContaining({
      amount: 2500,
      reason: 'Abertura 5x PACOTE BRONZE',
    }));
  });
});
