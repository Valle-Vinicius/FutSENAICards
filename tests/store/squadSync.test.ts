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
const profileQuery = {
  select: jest.fn(),
  eq: jest.fn(),
  single: jest.fn(),
};
const mockSupabase = {
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
  updateCollectorRanking: mockUpdateCollectorRanking,
}));
jest.mock('../../src/lib/services/marketplace', () => ({
  getListings: mockGetListings,
  createListing: mockCreateListing,
  cancelListing: mockCancelListing,
}));

import { useGame } from '../../src/store/useGame';

describe('primary squad sync', () => {
  beforeEach(() => {
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
});
