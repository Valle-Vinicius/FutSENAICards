const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockLimit = jest.fn();
const mockOr = jest.fn();
const mockIs = jest.fn();
const mockGt = jest.fn();
const mockNot = jest.fn();
const mockFrom = jest.fn();
const mockResponses: Array<{ data: unknown[]; error: null }> = [];
const mockThen = jest.fn();
const mockQuery = {
  select: mockSelect,
  eq: mockEq,
  order: mockOrder,
  limit: mockLimit,
  or: mockOr,
  is: mockIs,
  gt: mockGt,
  not: mockNot,
  then: mockThen,
};

jest.mock('../../../src/lib/supabase', () => ({
  get supabase() {
    return { from: mockFrom };
  },
}));

jest.mock('../../../src/data/players', () => ({
  allTemplates: jest.fn(() => []),
  getPlayerImage: jest.fn(() => null),
  applyTemplateToCard: jest.fn((card) => card),
}));

import { getCards } from '../../../src/lib/services/cards';

const cardRow = (id: string, createdAt: string | null) => ({
  id,
  player_id: 'player-1',
  name: 'Test Player',
  position: 'ST',
  sport: 'futsal',
  nationality: 'Brasil',
  age: 20,
  club: 'Clube',
  rarity: 'common',
  edition: 'base',
  special: false,
  overall: 70,
  pace: 70,
  shooting: 70,
  passing: 70,
  dribbling: 70,
  defending: 70,
  physical: 70,
  reflexes: 0,
  positioning: 0,
  handling: 0,
  extra_stats: [],
  xp: 0,
  evo_points: 0,
  upgrades: {},
  evolution_log: [],
  season_stats: {},
  image: null,
  favorite: false,
  is_new: false,
  obtained_at: '2026-11-01T00:00:00.000Z',
  schema_version: 4,
  created_at: createdAt,
});

beforeEach(() => {
  for (const mock of [mockSelect, mockEq, mockOrder, mockOr, mockIs, mockGt, mockNot]) {
    mock.mockReset().mockReturnValue(mockQuery);
  }
  mockFrom.mockReset().mockReturnValue(mockQuery);
  mockLimit.mockReset().mockReturnValue(mockQuery);
  mockResponses.length = 0;
  mockThen
    .mockReset()
    .mockImplementation((resolve, reject) =>
      Promise.resolve(mockResponses.shift()).then(resolve, reject),
    );
});

describe('cards service pagination', () => {
  it('uses a stable created_at/id cursor and selects only card fields it consumes', async () => {
    const createdAt = '2026-11-18T12:00:00.123456Z';
    const firstPage = Array.from({ length: 1000 }, (_, index) =>
      cardRow(`card-${index}`, createdAt),
    );
    mockResponses.push(
      { data: firstPage, error: null },
      { data: [cardRow('card-next', createdAt)], error: null },
    );

    const cards = await getCards('user-1');

    expect(cards).toHaveLength(1001);
    expect(mockFrom).toHaveBeenCalledWith('cards');
    expect(mockSelect).toHaveBeenCalledWith(
      'id,player_id,name,position,sport,nationality,age,club,rarity,edition,special,overall,pace,shooting,passing,dribbling,defending,physical,reflexes,positioning,handling,extra_stats,xp,evo_points,upgrades,evolution_log,season_stats,image,favorite,is_new,obtained_at,schema_version,created_at',
    );
    expect(mockOr).toHaveBeenCalledWith(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.gt.card-999)`,
    );
    expect(mockLimit).toHaveBeenNthCalledWith(1, 1000);
    expect(mockLimit).toHaveBeenNthCalledWith(2, 1000);
  });

  it('continues from null timestamps before switching to non-null cards', async () => {
    mockResponses.push(
      {
        data: Array.from({ length: 1000 }, (_, index) => cardRow(`null-${index}`, null)),
        error: null,
      },
      { data: [cardRow('null-last', null)], error: null },
      {
        data: [cardRow('dated', '2026-11-18T12:00:00.000Z')],
        error: null,
      },
    );

    const cards = await getCards('user-1');

    expect(cards).toHaveLength(1002);
    expect(mockIs).toHaveBeenCalledWith('created_at', null);
    expect(mockGt).toHaveBeenCalledWith('id', 'null-999');
    expect(mockNot).toHaveBeenCalledWith('created_at', 'is', null);
  });
});
