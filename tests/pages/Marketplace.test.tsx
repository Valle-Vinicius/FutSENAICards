import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { PlayerCard } from '../../src/types';
import { useGame } from '../../src/store/useGame';
import Marketplace from '../../src/pages/Marketplace';

jest.mock('../../src/components/Card', () => ({
  __esModule: true,
  default: ({ card }: { card: PlayerCard }) => <span>{card.name}</span>,
}));
jest.mock('../../src/hooks/useCardViewer', () => ({
  useCardViewer: () => ({ openCard: jest.fn(), viewer: null }),
}));
jest.mock('../../src/lib/supabase', () => ({ supabase: null }));
jest.mock('../../src/data/players', () => ({
  getPlayerImage: jest.fn(() => ''),
}));
jest.mock('../../src/lib/services/marketplace', () => ({
  getListings: jest.fn().mockResolvedValue(null),
  getMarketplaceTransactions: jest.fn(),
  getMarketplaceTransactionSummary: jest.fn(),
  toGameListing: jest.fn(),
}));
jest.mock('../../src/store/useGame', () => ({
  useGame: jest.fn(),
}));

const mockedUseGame = jest.mocked(useGame);

function makeCard(index: number): PlayerCard {
  return {
    uid: `card-${index}`,
    playerId: `player-${index}`,
    name: `Player ${index}`,
    position: 'Ala',
    sport: 'futsal',
    nationality: 'Brasil',
    age: 20,
    club: 'Leões',
    rarity: 'rare',
    edition: '2025/26',
    special: 'none',
    overall: 200 - index,
    pace: 80,
    shooting: 80,
    passing: 80,
    dribbling: 80,
    defending: 80,
    physical: 80,
    obtainedAt: 0,
    favorite: false,
    isNew: false,
  };
}

describe('Marketplace page', () => {
  afterEach(() => jest.clearAllMocks());

  it('paginates the sell-card chooser so a large collection does not render all cards at once', async () => {
    const state = {
      cards: Array.from({ length: 120 }, (_, index) => makeCard(index)),
      listings: [],
      coins: 0,
      buyListing: jest.fn(),
      listCard: jest.fn(),
      cancelListing: jest.fn(),
      updateListingPrice: jest.fn(),
      recordTransfer: jest.fn(),
      recordPrice: jest.fn(),
    };
    mockedUseGame.mockImplementation(selector => selector(state as unknown as ReturnType<typeof useGame.getState>));

    render(<Marketplace />);
    await waitFor(() => expect(screen.queryByText('Carregando mercado...')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Minhas vendas' }));
    fireEvent.click(screen.getByRole('button', { name: /Colocar carta à venda/ }));

    const dialog = within(screen.getByRole('dialog', { name: 'Nova transferência' }));
    const cardButtons = () => dialog.getAllByRole('button').filter(button => button.hasAttribute('aria-pressed'));
    expect(cardButtons()).toHaveLength(48);
    expect(dialog.getByText('1–48 de 120 cartas')).toBeInTheDocument();
    expect(dialog.queryByText('Player 48')).not.toBeInTheDocument();

    fireEvent.click(dialog.getByRole('button', { name: 'Próximas' }));

    expect(cardButtons()).toHaveLength(48);
    expect(dialog.getByText('49–96 de 120 cartas')).toBeInTheDocument();
    expect(dialog.getAllByText('Player 48')).toHaveLength(2);
  });
});
