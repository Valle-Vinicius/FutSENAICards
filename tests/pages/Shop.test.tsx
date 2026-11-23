import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useGame } from '../../src/store/useGame';
import Shop from '../../src/pages/Shop';

jest.mock('../../src/lib/supabase', () => ({ supabase: null }));
jest.mock('../../src/store/useGame', () => ({ useGame: jest.fn() }));

const mockedUseGame = jest.mocked(useGame);

describe('Shop demo coin lock', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('disables the demo purchase in another tab while the first purchase is processing', async () => {
    let finishClaim!: (result: boolean) => void;
    const claimDemoCoins = jest.fn(() => new Promise<boolean>(resolve => { finishClaim = resolve; }));
    const state = {
      events: [],
      coins: 0,
      claimDemoCoins,
    };
    mockedUseGame.mockImplementation(selector => selector(state as unknown as ReturnType<typeof useGame.getState>));

    render(<MemoryRouter><Shop /><Shop /></MemoryRouter>);
    const [firstButton, secondButton] = screen.getAllByRole('button', { name: /Comprar 10.000 moedas/ });
    fireEvent.click(firstButton);

    const lockKey = 'futsenai-demo-coins-lock:guest';
    await waitFor(() => expect(localStorage.getItem(lockKey)).not.toBeNull());
    fireEvent(
      window,
      new StorageEvent('storage', { key: lockKey, newValue: localStorage.getItem(lockKey) }),
    );

    expect(firstButton).toBeDisabled();
    expect(secondButton).toBeDisabled();
    expect(claimDemoCoins).toHaveBeenCalledTimes(1);

    finishClaim(true);
    await waitFor(() => expect(secondButton).toBeEnabled());
  });

  it('separates active events from expired events using their real end dates', () => {
    const state = {
      events: [
        { id: 'active', name: 'Copa FUT', endsAt: Date.now() + 60_000, reward: 'Pacote Lendário' },
        { id: 'ended', name: 'Semana do Ícone', endsAt: Date.now() - 60_000, reward: 'Carta Ícone garantida' },
      ],
      coins: 0,
      claimDemoCoins: jest.fn(),
    };
    mockedUseGame.mockImplementation(selector => selector(state as unknown as ReturnType<typeof useGame.getState>));

    render(<MemoryRouter><Shop /></MemoryRouter>);

    const activeEvent = screen.getByRole('heading', { name: 'Copa FUT' }).closest('article');
    const endedEvent = screen.getByRole('heading', { name: 'Semana do Ícone' }).closest('article');
    expect(activeEvent).not.toBeNull();
    expect(endedEvent).not.toBeNull();
    expect(within(activeEvent as HTMLElement).getByText('Em andamento')).toBeInTheDocument();
    expect(within(endedEvent as HTMLElement).getByText('Evento encerrado')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Eventos encerrados' })).toBeInTheDocument();
  });
});
