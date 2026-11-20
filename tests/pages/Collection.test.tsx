import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { PlayerCard } from '../../src/types';
import { useGame } from '../../src/store/useGame';
import { toast } from '../../src/store/toast';
import Collection from '../../src/pages/Collection';

jest.mock('../../src/components/Card', () => ({
  __esModule: true,
  default: ({ card, onClick }: { card: PlayerCard; onClick?: () => void }) => (
    <button onClick={onClick}>{card.name}</button>
  ),
}));
jest.mock('../../src/lib/supabase', () => ({ supabase: null }));
jest.mock('../../src/data/players', () => ({
  allTemplates: () => [{ name: 'Thiago Tavares' }, { name: 'Jogador não obtido' }],
}));
jest.mock('../../src/store/useGame', () => ({
  useGame: jest.fn(),
}));
jest.mock('../../src/store/toast', () => ({
  toast: { success: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const mockedUseGame = jest.mocked(useGame);

function makeCard(
  uid: string,
  rarity: PlayerCard['rarity'] = 'rare',
  isNew = false,
  name = 'Thiago Tavares',
): PlayerCard {
  return {
    uid,
    playerId: `player-${name}`,
    name,
    position: 'Ala',
    sport: 'futsal',
    nationality: 'Brasil',
    age: 20,
    club: 'Leões',
    rarity,
    edition: '2025/26',
    special: 'none',
    overall: 80,
    pace: 80,
    shooting: 80,
    passing: 80,
    dribbling: 80,
    defending: 80,
    physical: 80,
    obtainedAt: 0,
    favorite: false,
    isNew,
  };
}

function renderCollection(cards: PlayerCard[]) {
  const state = {
    cards,
    squads: { futsal: { sport: 'futsal', formation: '1-2-1', starters: [], bench: [] } },
    savedSquads: [],
    listings: [],
    markSeen: jest.fn(),
    convertDuplicates: jest.fn().mockResolvedValue({ count: 1, coins: 250 }),
  };
  mockedUseGame.mockImplementation(selector => selector(state as unknown as ReturnType<typeof useGame.getState>));
  return {
    state,
    ...render(
      <MemoryRouter>
        <Collection />
        <LocationDisplay />
      </MemoryRouter>,
    ),
  };
}

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="current-location">{location.pathname}{location.search}</div>;
}

describe('Collection page', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('groups copies by player and rarity by default and expands the extra copies', () => {
    renderCollection([makeCard('rare-1'), makeCard('rare-2'), makeCard('common-1', 'common')]);

    expect(screen.getAllByRole('button', { name: 'Thiago Tavares' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Comparar' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Comparar' })[0]);
    expect(screen.getByTestId('current-location')).toHaveTextContent('/compare?a=rare-1');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar 1 cópia de Thiago Tavares' }));
    expect(screen.getAllByRole('button', { name: 'Thiago Tavares' })).toHaveLength(3);
  });

  it('shows inventory totals and album progress from the existing templates', () => {
    renderCollection([makeCard('rare-1'), makeCard('rare-2'), makeCard('common-1', 'common')]);

    const summary = within(screen.getByLabelText('Resumo da coleção'));
    expect(summary.getByText('Total no acervo').parentElement).toHaveTextContent('3');
    expect(summary.getByText('Jogadores únicos').parentElement).toHaveTextContent('1');
    expect(summary.getByText('Duplicadas').parentElement).toHaveTextContent('2');
    expect(screen.getByRole('progressbar', { name: 'Progresso do álbum' })).toHaveAttribute('aria-valuenow', '50');

    fireEvent.click(screen.getByRole('button', { name: 'Ver álbum' }));
    expect(screen.getByRole('heading', { name: 'Álbum de jogadores' })).toBeInTheDocument();
    expect(screen.getByText('Jogador não obtido')).toBeInTheDocument();
  });

  it('shows rarity filters as chips and only offers clearing when a filter is active', () => {
    renderCollection([makeCard('rare-1')]);

    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rara' }));
    expect(screen.getByRole('button', { name: 'Limpar filtros' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument();
  });

  it('keeps the existing pagination controls for larger collections', () => {
    const cards = Array.from({ length: 25 }, (_, index) =>
      makeCard(`card-${index}`, 'rare', false, `Jogador ${index}`),
    );
    renderCollection(cards);

    expect(screen.getByRole('button', { name: 'Jogador 0' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(screen.queryByRole('button', { name: 'Jogador 0' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeEnabled();
  });

  it('marks visible new cards as seen after the page stays visible for three seconds', () => {
    jest.useFakeTimers();
    const { state } = renderCollection([makeCard('new-card', 'rare', true)]);

    act(() => { jest.advanceTimersByTime(2999); });
    expect(state.markSeen).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(1); });
    expect(state.markSeen).toHaveBeenCalledWith(['new-card']);
  });

  it('shows an estimated card and coin count before confirming conversion', async () => {
    const { state } = renderCollection([makeCard('rare-1'), makeCard('rare-2')]);

    fireEvent.click(screen.getByRole('button', { name: 'Converter duplicatas' }));
    expect(screen.getByText(/Prévia: até 1 carta elegível.*250 moedas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Converter$/ }));

    await waitFor(() => expect(state.convertDuplicates).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('250 moedas'));
  });
});
