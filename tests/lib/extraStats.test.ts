import { validateExtraStats } from '../../src/lib/extraStats';

describe('Off-Sale extra stat validation', () => {
  it('accepts integer values from 0 through 999', () => {
    expect(validateExtraStats([
      { label: 'Zero', value: 0 },
      { label: 'Max', value: 999 },
    ])).toBeNull();
  });

  it('rejects values above 999 and non-integers', () => {
    expect(validateExtraStats([{ label: 'High', value: 1000 }])).toContain('0 e 999');
    expect(validateExtraStats([{ label: 'Decimal', value: 1.5 }])).toContain('0 e 999');
  });

  it('rejects duplicate labels after trimming and case normalization', () => {
    expect(validateExtraStats([
      { label: '  Sorte', value: 1 },
      { label: 'sorte ', value: 2 },
    ])).toContain('não podem se repetir');
  });

  it('rejects more than ten stats and invalid labels', () => {
    expect(validateExtraStats(Array.from({ length: 11 }, (_, i) => ({ label: `Stat ${i}`, value: 0 }))))
      .toContain('até 10');
    expect(validateExtraStats([{ label: ' ', value: 0 }])).toContain('nome');
    expect(validateExtraStats([{ label: 'a'.repeat(31), value: 0 }])).toContain('nome');
  });
});
