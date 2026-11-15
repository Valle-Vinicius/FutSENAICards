import { DEFAULT_PACKS } from '../../src/lib/game';
import { calculateSecretPackOdds, cheapestSecretPackFor99 } from '../../src/lib/secretCardOdds';

describe('secret card pack odds', () => {
  it('uses the authoritative package prices and card counts', () => {
    expect(Object.fromEntries(DEFAULT_PACKS.map(pack => [pack.id, [pack.price, pack.cards]]))).toMatchObject({
      bronze: [500, 3],
      silver: [1500, 5],
      gold: [3000, 5],
      premium: [7500, 5],
      rareplayers: [5000, 3],
      legends: [12000, 4],
      position_gk: [4000, 3],
    });
  });

  it('calculates the requested package chances and confidence costs', () => {
    const odds = calculateSecretPackOdds(0.001, 'Ala');
    const bronze = odds.find(row => row.pack.id === 'bronze')!;
    const silver = odds.find(row => row.pack.id === 'silver')!;
    const legends = odds.find(row => row.pack.id === 'legends')!;

    expect(bronze.chancePerPack).toBeCloseTo(0.00003, 9);
    expect(bronze.oneIn).toBeCloseTo(33333.67, 0);
    expect(bronze.averageCost).toBeCloseTo(16_666_833, -2);
    expect(bronze.costFor50).toBeCloseTo(11_550_000, -4);
    expect(bronze.costFor90).toBeCloseTo(38_376_226, -2);
    expect(bronze.costFor99).toBeCloseTo(76_750_000, -4);
    expect(silver.chancePerPack).toBeCloseTo(0.00005, 8);
    expect(silver.averageCost).toBeCloseTo(30_000_600, -2);
    expect(legends.chancePerPack).toBeCloseTo(0.00004, 8);
    expect(cheapestSecretPackFor99(odds)?.pack.id).toBe('bronze');
  });

  it('marks goalkeeper, choice, and Off-Sale eligibility correctly', () => {
    const fieldPlayerOdds = calculateSecretPackOdds(0.001, 'Ala');
    const goalkeeperRow = fieldPlayerOdds.find(row => row.pack.id === 'position_gk')!;
    const choiceRow = fieldPlayerOdds.find(row => row.pack.id === 'choice')!;
    const offSaleRow = fieldPlayerOdds.find(row => row.pack.id === 'off_sale')!;

    expect(goalkeeperRow.eligible).toBe(false);
    expect(choiceRow.eligible).toBe(false);
    expect(offSaleRow.eligible).toBe(false);
    expect(calculateSecretPackOdds(0.001, 'GK').find(row => row.pack.id === 'position_gk')?.eligible).toBe(true);
  });
});
