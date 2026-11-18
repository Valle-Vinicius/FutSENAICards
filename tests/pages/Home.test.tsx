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

const mockedUseGame = jest.mocked(useGame);

function renderHome(overrides: Record<string, unknown> = {}) {
  const state = {
    coins: 1200,
    xp: 100,
    level: 1,
    cards: [],
    avatarUrl: null,
    lastDailyClaim: null,
    missions: [],
    events: [{ id: 'event-1', name: 'Copa FutSenai', endsAt: Date.now() + 86400000, reward: 'Pacote' }],
    claimDaily: jest.fn().mockResolvedValue({ ok: true, amount: 700 }),
    packConfigs: [{ id: 'bronze', name: 'Pacote Bronze', price: 500, unlocked: true }],
    ...overrides,
  };
  mockedUseGame.mockImplementation(selector => selector(state as never));
  return { ...render(<MemoryRouter><Home /></MemoryRouter>), state };
}

describe('Home page', () => {
  beforeEach(() => jest.clearAllMocks());

  it('prioritizes game and pack actions without repeating navigation sections', () => {
    renderHome();

    expect(screen.getByRole('heading', { name: 'Jogar agora' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Partida$/ })).toHaveAttribute('href', '/match');
    expect(screen.getByRole('link', { name: /abrir pacote bronze/i })).toHaveAttribute('href', '/open/bronze');
    expect(screen.queryByText('Acesso rápido')).not.toBeInTheDocument();
    expect(screen.queryByText('Ranking de colecionadores')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver eventos' })).toHaveAttribute('href', '/shop');
  });

  it('offers the daily reward only when it has not been claimed today', async () => {
    const { state } = renderHome();
    fireEvent.click(screen.getByRole('button', { name: /resgatar recompensa/i }));
    await waitFor(() => expect(state.claimDaily).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith('Recompensa diária: +700 moedas');
  });

  it('shows the daily reward as already collected for the current day', () => {
    renderHome({ lastDailyClaim: Date.now() });

    expect(screen.queryByRole('button', { name: /resgatar recompensa/i })).not.toBeInTheDocument();
    expect(screen.getByText('Recompensa resgatada hoje')).toBeInTheDocument();
  });
});
