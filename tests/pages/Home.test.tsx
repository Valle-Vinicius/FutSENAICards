import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useGame } from '../../src/store/useGame';
import { toast } from '../../src/store/toast';
import Home from '../../src/pages/Home';

jest.mock('../../src/store/useGame', () => ({ useGame: jest.fn() }));
jest.mock('../../src/lib/supabase', () => ({ supabase: null }));
jest.mock('../../src/lib/profile', () => ({ getProfile: jest.fn() }));
jest.mock('../../src/components/Card', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/store/toast', () => ({ toast: { success: jest.fn(), info: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/hooks/useHomePendingCounts', () => ({
  useHomePendingCounts: () => ({
    counts: { challenges: 2, friendRequests: 1, soldListings: 0 },
    loading: false,
    error: null,
    retry: jest.fn(),
  }),
}));
jest.mock('../../src/hooks/useJournalNews', () => ({
  useJournalNews: () => ({ news: [], loading: false, error: null, refresh: jest.fn() }),
}));

const mockedUseGame = jest.mocked(useGame);

function renderHome(overrides: Record<string, unknown> = {}) {
  const state = {
    coins: 1200,
    xp: 100,
    level: 1,
    name: 'Jogador Teste',
    cards: [],
    avatarUrl: null,
    lastDailyClaim: null,
    dailyStreak: 0,
    newCardUids: [],
    missions: [],
    events: [{ id: 'event-1', name: 'Copa FutSenai', endsAt: Date.now() + 86400000, reward: 'Pacote' }],
    claimDaily: jest.fn().mockResolvedValue({ ok: true, amount: 700, streak: 1, bonus: 0 }),
    packConfigs: [{ id: 'bronze', name: 'Pacote Bronze', price: 500, unlocked: true }],
    ...overrides,
  };
  mockedUseGame.mockImplementation(selector => selector(state as never));
  return { ...render(<MemoryRouter><Home /></MemoryRouter>), state };
}

describe('Home page', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the editorial hero and preserves the main gameplay actions', () => {
    renderHome();

    expect(screen.getByRole('heading', { name: 'O seu jogo. O seu clube.' })).toBeInTheDocument();
    expect(screen.getByAltText(/jogador vestindo uniforme vermelho/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /entrar em campo/i })).toHaveAttribute('href', '/match');
    expect(screen.getByRole('link', { name: /abrir pacote bronze/i })).toHaveAttribute('href', '/open/bronze');
    expect(screen.getByRole('link', { name: 'Ver eventos' })).toHaveAttribute('href', '/shop');
    expect(screen.getByRole('heading', { name: 'Pendências' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /desafios recebidos/i })).toHaveTextContent('2');
    expect(screen.getByRole('link', { name: /pedidos de amizade/i })).toHaveTextContent('1');
    expect(screen.getByRole('heading', { name: 'Cartas em destaque' })).toBeInTheDocument();
  });

  it('offers the daily reward only when it has not been claimed today', async () => {
    const { state } = renderHome();
    fireEvent.click(screen.getByRole('button', { name: /resgatar recompensa/i }));
    await waitFor(() => expect(state.claimDaily).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith('Recompensa diária: +700 moedas · 1 dia de sequência');
  });

  it('shows the daily reward as already collected for the current day', () => {
    renderHome({ lastDailyClaim: Date.now() });

    expect(screen.queryByRole('button', { name: /resgatar recompensa/i })).not.toBeInTheDocument();
    expect(screen.getByText('Recompensa resgatada hoje')).toBeInTheDocument();
  });
});
