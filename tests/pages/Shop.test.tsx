import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    render(<><Shop /><Shop /></>);
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
});
