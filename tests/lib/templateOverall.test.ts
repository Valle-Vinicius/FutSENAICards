import { isAutoCalculatedTemplate, overallFromAttributes, type PlayerTemplate } from '../../src/data/players';

jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }));
jest.mock('../../src/lib/supabase', () => ({ supabase: null }));

const baseTemplate: PlayerTemplate = {
  name: 'Teste',
  position: 'Ala',
  nationality: 'Brasil',
  age: 20,
  club: 'Clube',
  attributes: { pace: 80, shooting: 70, passing: 75, dribbling: 75, defending: 60, physical: 65 },
  image: '',
  baseRarity: 'uncommon',
};

describe('template automatic overall mode', () => {
  it('uses the saved automatic-mode flag when available', () => {
    expect(isAutoCalculatedTemplate({ ...baseTemplate, baseOverall: 80, autoCalculateOverall: true })).toBe(true);
    expect(isAutoCalculatedTemplate({ ...baseTemplate, baseOverall: 80, autoCalculateOverall: false })).toBe(false);
  });

  it('recognizes legacy templates whose saved base OVR matches their attributes', () => {
    const calculatedBase = overallFromAttributes(baseTemplate.position, baseTemplate.attributes);
    expect(isAutoCalculatedTemplate({ ...baseTemplate, baseOverall: calculatedBase })).toBe(true);
    expect(isAutoCalculatedTemplate({ ...baseTemplate, baseOverall: calculatedBase + 1 })).toBe(false);
  });
});
