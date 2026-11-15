import type { PlayerCard } from '../../src/types';
import { useGame } from '../../src/store/useGame';
import { toast } from '../../src/store/toast';

jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }));
jest.mock('../../src/lib/supabase', () => ({ supabase: null }));
jest.mock('../../src/store/toast', () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), alert: jest.fn() },
}));

function makeCard(uid: string, rarity: PlayerCard['rarity'] = 'common', overrides: Partial<PlayerCard> = {}): PlayerCard {
  return {
    uid,
    playerId: uid,
    name: 'Jogador duplicado',
    position: 'Ala',
    sport: 'futsal',
    nationality: 'Brasil',
    age: 20,
    club: 'Clube',
    rarity,
    edition: '2025/26',
    special: 'none',
    overall: 60,
    pace: 60,
    shooting: 60,
    passing: 60,
    dribbling: 60,
    defending: 60,
    physical: 60,
    obtainedAt: 0,
    favorite: false,
    isNew: false,
    ...overrides,
  };
}

describe('authoritative card economy client safeguards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useGame.setState({
      cards: [],
      coins: 0,
      transactions: [],
      listings: [],
      savedSquads: [],
      squads: { futsal: { sport: 'futsal', formation: '1-2-1', starters: [], bench: [] } },
    });
  });

  it('never converts icon, favorite, or listed duplicates and pays by rarity offline', async () => {
    const cards = [
      makeCard('common-keep', 'common', { overall: 70 }),
      makeCard('common-remove', 'common', { overall: 60 }),
      makeCard('icon', 'icon', { overall: 99 }),
      makeCard('rare-favorite', 'rare', { name: 'Favorito', favorite: true, overall: 80 }),
      makeCard('rare-copy', 'rare', { name: 'Favorito', overall: 75 }),
      makeCard('uncommon-listed', 'uncommon', { name: 'Mercado', overall: 55 }),
      makeCard('uncommon-copy', 'uncommon', { name: 'Mercado', overall: 75 }),
      makeCard('saved-card', 'common', { name: 'Elenco salvo', overall: 55 }),
      makeCard('saved-copy', 'common', { name: 'Elenco salvo', overall: 75 }),
    ];
    useGame.setState({
      cards,
      listings: [{
        id: 'listing',
        cardUid: 'uncommon-listed',
        seller: 'user',
        sellerName: 'Você',
        price: 10,
        buyNow: 10,
        createdAt: 0,
        expiresAt: Date.now() + 60_000,
        status: 'active',
      }],
      savedSquads: [{
        id: 'saved-squad',
        name: 'Elenco',
        sport: 'futsal',
        formation: '1-2-1',
        starters: ['saved-card'],
        bench: [],
        createdAt: 0,
        isPrimary: false,
      }],
    });

    await expect(useGame.getState().convertDuplicates()).resolves.toEqual({ count: 2, coins: 300 });
    const remaining = useGame.getState().cards.map(card => card.uid);
    expect(remaining).toEqual(expect.arrayContaining(['icon', 'rare-favorite', 'uncommon-listed', 'saved-card']));
    expect(remaining).not.toContain('common-remove');
    expect(remaining).not.toContain('rare-copy');
    expect(useGame.getState().coins).toBe(300);
  });

  const protectedCards: [string, PlayerCard][] = [
    ['icon', makeCard('icon-card', 'icon')],
    ['favorite', makeCard('favorite-card', 'rare', { favorite: true })],
  ];

  it.each(protectedCards)('does not consume an %s card in an SBC', async (_label, protectedCard) => {
    useGame.setState({ cards: [protectedCard, makeCard('one'), makeCard('two')] });

    await expect(useGame.getState().completeSBC('sbc3', [protectedCard.uid, 'one', 'two'])).resolves.toBe(false);
    expect(useGame.getState().cards.map(card => card.uid)).toEqual([protectedCard.uid, 'one', 'two']);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('não podem ser usadas'));
  });

  it('does not consume cards assigned to a saved squad in an SBC', async () => {
    const cards = [makeCard('saved-card'), makeCard('two'), makeCard('three')];
    useGame.setState({
      cards,
      savedSquads: [{
        id: 'saved-squad',
        name: 'Elenco',
        sport: 'futsal',
        formation: '1-2-1',
        starters: ['saved-card'],
        bench: [],
        createdAt: 0,
        isPrimary: false,
      }],
    });

    await expect(useGame.getState().completeSBC('sbc3', cards.map(card => card.uid))).resolves.toBe(false);
    expect(useGame.getState().cards.map(card => card.uid)).toEqual(cards.map(card => card.uid));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('elencos ativos e salvos'));
  });

  it.each([
    ['sbc2', 800, ['GK', 'Fixo', 'Ala', 'Ala', 'Pivo']],
    ['sbc3', 600, ['Ala', 'Fixo', 'Pivo']],
  ] as const)('uses the reduced %s reward in offline mode', async (sbcId, expectedReward, positions) => {
    const cards = positions.map((position, index) =>
      makeCard(`sbc-${index}`, 'common', { name: `Jogador ${index}`, position }),
    );
    useGame.setState({ cards });

    await expect(useGame.getState().completeSBC(sbcId, cards.map(card => card.uid))).resolves.toBe(true);
    expect(useGame.getState().coins).toBe(expectedReward);
  });
});
