import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Squad from '../../src/pages/Squad';
import { useGame } from '../../src/store/useGame';
import type { PlayerCard } from '../../src/types';

jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }));
jest.mock('../../src/lib/supabase', () => ({ supabase: null }));

jest.mock('../../src/components/Card', () => ({
  __esModule: true,
  default: ({ card }: { card: PlayerCard }) => <span data-testid="inventory-card">{card.name}</span>,
}));

describe('squad builder inventory', () => {
  beforeEach(() => {
    const cards = Array.from({ length: 100 }, (_, index) => ({
      uid: `card-${index}`,
      playerId: `player-${index}`,
      name: index === 50 ? 'Busca exata' : `Jogador ${index}`,
      position: 'Ala',
      sport: 'futsal',
      nationality: 'Brasil',
      age: 20,
      club: index === 50 ? 'Clube exclusivo' : 'Clube',
      rarity: 'common',
      edition: 'base',
      special: 'none',
      overall: 99 - index / 100,
      pace: 80,
      shooting: 80,
      passing: 80,
      dribbling: 80,
      defending: 80,
      physical: 80,
    })) as PlayerCard[];
    useGame.setState({
      cards,
      squads: {
        futsal: {
          sport: 'futsal',
          formation: '1-2-1',
          starters: (['GK', 'Fixo', 'Ala', 'Ala', 'Pivo'] as const).map(position => ({ position, uid: null })),
          bench: [],
        },
      },
      savedSquads: [],
    });
  });

  it('renders only the first batch and lets the user find cards by club', async () => {
    render(<Squad />);

    expect(screen.getAllByTestId('inventory-card')).toHaveLength(36);
    expect(screen.getByText('100 resultados. Selecione uma carta e clique em um slot.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Carregar mais cartas/ }));
    expect(screen.getAllByTestId('inventory-card')).toHaveLength(72);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar cartas do elenco' }), {
      target: { value: 'Clube exclusivo' },
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('inventory-card')).toHaveLength(1);
      expect(screen.getByText('Busca exata')).toBeTruthy();
    });
  });
});
