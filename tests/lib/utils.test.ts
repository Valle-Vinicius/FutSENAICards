import { DEFAULT_PACKS, levelFromXp, rollRarity } from '../../src/lib/game';

describe('levelFromXp', () => {
  it('returns 1 for 0 xp', () => expect(levelFromXp(0)).toBe(1));
  it('increases level every 500 xp', () => {
    expect(levelFromXp(500)).toBe(2);
    expect(levelFromXp(999)).toBe(2);
    expect(levelFromXp(1000)).toBe(3);
  });
});

describe('rollRarity', () => {
  it('returns a valid rarity', () => {
    const probs = { common: 0.5, uncommon: 0.3, rare: 0.15, epic: 0.04, legendary: 0.009, icon: 0.001 };
    const r = rollRarity(probs);
    expect(['common','uncommon','rare','epic','legendary','icon']).toContain(r);
  });
});

describe('Pacote Off-Sale', () => {
  it('is available with its configured price and card count', () => {
    const pack = DEFAULT_PACKS.find(item => item.id === 'off_sale');
    expect(pack).toMatchObject({ name: 'Pacote Off-Sale', price: 500, cards: 3 });
  });
});
