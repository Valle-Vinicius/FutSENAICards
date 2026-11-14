import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { PlayerCard } from '../../src/types';
import { useGame } from '../../src/store/useGame';
import CardDetail from '../../src/pages/CardDetail';

jest.mock('../../src/components/Card', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/store/useGame', () => ({ useGame: jest.fn() }));

const mockedUseGame = jest.mocked(useGame);

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="current-location">{location.pathname}{location.search}</div>;
}

describe('Card detail extra stats', () => {
  it('shows Off-Sale stats in attributes without changing the saved overall', () => {
    const card: PlayerCard = {
      uid: 'card-1',
      playerId: 'player-1',
      name: 'Jogador Zoeira',
      position: 'Ala',
      sport: 'futsal',
      nationality: 'Brasil',
      age: 20,
      club: 'Clube',
      rarity: 'rare',
      edition: '2025/26',
      special: 'none',
      overall: 80,
      pace: 70,
      shooting: 70,
      passing: 70,
      dribbling: 70,
      defending: 70,
      physical: 70,
      extraStats: [{ label: 'Sorte', value: 999 }],
      obtainedAt: 0,
      favorite: false,
      isNew: true,
    };
    const state = {
      cards: [card],
      markSeen: jest.fn(),
      toggleFavorite: jest.fn(),
      upgradePlayer: jest.fn(),
    };
    mockedUseGame.mockImplementation(selector => selector(state as unknown as ReturnType<typeof useGame.getState>));

    const { container } = render(
      <MemoryRouter initialEntries={['/card/card-1']}>
        <Routes>
          <Route path="/card/:uid" element={<CardDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Sorte')).toBeInTheDocument();
    expect(screen.getByText('999')).toHaveClass('rgb-text');
    expect(container.querySelector('.rgb-stat')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(state.markSeen).toHaveBeenCalledWith(['card-1']);
  });

  it('opens the comparison page with this card selected', () => {
    const card: PlayerCard = {
      uid: 'card-2',
      playerId: 'player-2',
      name: 'Carta para comparar',
      position: 'Ala',
      sport: 'futsal',
      nationality: 'Brasil',
      age: 20,
      club: 'Clube',
      rarity: 'rare',
      edition: '2025/26',
      special: 'none',
      overall: 80,
      pace: 70,
      shooting: 70,
      passing: 70,
      dribbling: 70,
      defending: 70,
      physical: 70,
      obtainedAt: 0,
      favorite: false,
      isNew: false,
    };
    mockedUseGame.mockImplementation(selector => selector({
      cards: [card],
      markSeen: jest.fn(),
      toggleFavorite: jest.fn(),
      upgradePlayer: jest.fn(),
    } as unknown as ReturnType<typeof useGame.getState>));

    render(
      <MemoryRouter initialEntries={['/card/card-2']}>
        <Routes>
          <Route path="/card/:uid" element={<CardDetail />} />
          <Route path="/compare" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Comparar/ }));
    expect(screen.getByTestId('current-location')).toHaveTextContent('/compare?a=card-2');
  });
});
