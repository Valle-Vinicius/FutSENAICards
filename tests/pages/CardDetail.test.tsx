import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PlayerCard } from '../../src/types';
import { useGame } from '../../src/store/useGame';
import CardDetail from '../../src/pages/CardDetail';

jest.mock('../../src/components/Card', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/store/useGame', () => ({ useGame: jest.fn() }));

const mockedUseGame = jest.mocked(useGame);

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
      isNew: false,
    };
    const state = {
      cards: [card],
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
  });
});
