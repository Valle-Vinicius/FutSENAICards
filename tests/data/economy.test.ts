import { DEFAULT_PACKS } from '../../src/lib/game';
import { expectedDuplicateConversionValue } from '../../src/data/economy';

describe('card economy', () => {
  it.each(DEFAULT_PACKS)('$name duplicate-conversion expectation stays below 80% of its price', pack => {
    expect(expectedDuplicateConversionValue(pack)).toBeLessThan(pack.price * 0.8);
  });

  it('does not make repeated bronze packs plus either repeatable SBC profitable', () => {
    const bronze = DEFAULT_PACKS.find(pack => pack.id === 'bronze')!;
    const sbc2Reward = 800;
    const sbc3Reward = 600;

    expect(bronze.price * 5).toBeGreaterThan(sbc2Reward);
    expect(bronze.price * 3).toBeGreaterThan(sbc3Reward);
  });
});
