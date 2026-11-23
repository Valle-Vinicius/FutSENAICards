import type { PlayerTemplate } from '../../src/data/players';
import { getPlayerDetailPhoto, setDbTemplates } from '../../src/data/players';

jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }));
jest.mock('../../src/lib/supabase', () => ({ supabase: null }));

describe('player detail photos', () => {
  afterEach(() => setDbTemplates([]));

  it('resolves the detail photo configured on a database template', () => {
    const template: PlayerTemplate = {
      name: 'Jogador Personalizado',
      position: 'Ala',
      nationality: 'Brasil',
      age: 20,
      club: 'Clube',
      attributes: { pace: 70, shooting: 70, passing: 70, dribbling: 70, defending: 70, physical: 70 },
      image: '/card-art.png',
      detailPhoto: '/player-detail.png',
      baseRarity: 'rare',
    };
    setDbTemplates([template]);

    expect(getPlayerDetailPhoto('Jogador Personalizado')).toBe('/player-detail.png');
  });
});
