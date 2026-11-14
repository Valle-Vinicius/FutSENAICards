import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Squad from '../../src/pages/Squad';
import { useGame } from '../../src/store/useGame';
import { toast } from '../../src/store/toast';
import type { PlayerCard } from '../../src/types';

const mockFlushSquadSave = jest.fn();

jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }));
jest.mock('../../src/lib/supabase', () => ({ supabase: null }));

jest.mock('../../src/components/Card', () => ({
  __esModule: true,
  default: ({ card, onClick }: { card: PlayerCard; onClick?: () => void }) => (
    <button type="button" aria-label={`${card.name}, overall ${card.overall}, ${card.position}`} onClick={onClick}>
      {card.name}
    </button>
  ),
}));

describe('squad builder inventory', () => {
  beforeEach(() => {
    mockFlushSquadSave.mockReset();
    mockFlushSquadSave.mockResolvedValue(true);
    jest.spyOn(toast, 'success').mockImplementation(() => {});
    jest.spyOn(toast, 'error').mockImplementation(() => {});
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
      listings: [],
      flushSquadSave: mockFlushSquadSave,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders only the first batch and lets the user find cards by club', async () => {
    render(<Squad />);

    expect(screen.getAllByTestId('inventory-card')).toHaveLength(36);
    expect(screen.getByText('100 resultados')).toBeTruthy();
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

  it('orders the inventory by highest overall first', () => {
    const cards = useGame.getState().cards;
    useGame.setState({ cards: [cards[20], cards[0], cards[50]] });
    render(<Squad />);

    expect(screen.getAllByTestId('inventory-card').map(card => card.textContent)).toEqual([
      'Jogador 0',
      'Jogador 20',
      'Busca exata',
    ]);
  });

  it('waits for the generated squad to be saved before showing success', async () => {
    let finishSave!: (saved: boolean) => void;
    mockFlushSquadSave.mockImplementation(() => new Promise(resolve => { finishSave = resolve; }));
    render(<Squad />);

    fireEvent.click(screen.getByRole('button', { name: 'Montar melhor time' }));

    await waitFor(() => {
      expect(mockFlushSquadSave).toHaveBeenCalledWith('futsal');
    });
    expect((screen.getByRole('button', { name: 'Salvando elenco...' }) as HTMLButtonElement).disabled).toBe(true);
    expect(toast.success).not.toHaveBeenCalledWith('Time montado e salvo.');

    finishSave(true);
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Time montado e salvo.');
    });
  });

  it('uses the store formation value and only offers distinct formations', () => {
    render(<Squad />);
    const formation = screen.getByLabelText('Formação:') as HTMLSelectElement;

    expect(Array.from(formation.options).map(option => option.value)).toEqual(['1-2-1', '2-2']);
    act(() => useGame.getState().setFormation('futsal', '2-2'));
    expect(formation.value).toBe('2-2');
  });

  it('selects a player on tap and assigns it to a reserve slot', () => {
    const squad = useGame.getState().squads.futsal;
    useGame.setState({ squads: { futsal: { ...squad, bench: [null, null] } } });
    render(<Squad />);
    fireEvent.click(screen.getByRole('button', { name: 'Jogador 0, overall 99, Ala' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reserva 1 vazia' }));

    expect(useGame.getState().squads.futsal.bench[0]).toBe('card-0');
  });

  it('swaps selected starters instead of removing one immediately', () => {
    const squad = useGame.getState().squads.futsal;
    const starters = squad.starters.map(slot => ({ ...slot }));
    starters[2] = { position: 'Ala', uid: 'card-50' };
    starters[3] = { position: 'Ala', uid: 'card-51' };
    useGame.setState({ squads: { futsal: { ...squad, starters } } });
    render(<Squad />);

    fireEvent.click(screen.getByRole('button', { name: 'Busca exata, overall 98.5, Ala' }));
    expect(useGame.getState().squads.futsal.starters[2].uid).toBe('card-50');
    fireEvent.click(screen.getByRole('button', { name: 'Jogador 51, overall 98.49, Ala' }));

    expect(useGame.getState().squads.futsal.starters[2].uid).toBe('card-51');
    expect(useGame.getState().squads.futsal.starters[3].uid).toBe('card-50');
  });

  it('does not show or assign cards with active marketplace listings', async () => {
    useGame.setState({
      listings: [{
        id: 'listing-1',
        cardUid: 'card-50',
        seller: 'user',
        sellerName: 'Jogador',
        price: 100,
        buyNow: 200,
        bids: [],
        createdAt: 0,
        expiresAt: Date.now() + 60_000,
        status: 'active',
      }],
    });

    render(<Squad />);

    expect(screen.getAllByTestId('inventory-card')).toHaveLength(36);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar cartas do elenco' }), { target: { value: 'Clube exclusivo' } });
    await waitFor(() => {
      expect(screen.queryAllByTestId('inventory-card')).toHaveLength(0);
      expect(screen.queryByText('Nenhuma carta disponível com esses filtros.')).not.toBeNull();
    });
    useGame.getState().assignSlot('futsal', 0, 'card-50');
    expect(useGame.getState().squads.futsal.starters[0].uid).toBeNull();
  });

  it('duplicates a saved lineup from its saved players without changing the active lineup', async () => {
    const active = useGame.getState().squads.futsal;
    const saved = {
      id: 'saved-1',
      name: 'Meu time salvo',
      sport: 'futsal' as const,
      formation: '1-2-1',
      starters: ['saved-gk', 'saved-fixo', 'saved-ala-1', 'saved-ala-2', 'saved-pivo'],
      bench: ['saved-bench', null],
      createdAt: 1,
      isPrimary: false,
    };
    useGame.setState({ savedSquads: [saved] });

    const duplicateId = await useGame.getState().duplicateSavedSquad(saved.id);
    const duplicate = useGame.getState().savedSquads.find(item => item.id === duplicateId);

    expect(duplicate).toMatchObject({
      name: 'Meu time salvo (cópia)',
      formation: saved.formation,
      starters: saved.starters,
      bench: saved.bench,
      isPrimary: false,
    });
    expect(useGame.getState().squads.futsal).toEqual(active);
  });
});
