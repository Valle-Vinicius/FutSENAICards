import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { PlayerCard } from '../../src/types';
import { useGame } from '../../src/store/useGame';
import CardDetail from '../../src/pages/CardDetail';
import { getPlayerDetailPhoto } from '../../src/data/players';

jest.mock('../../src/components/Card', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/store/useGame', () => ({ useGame: jest.fn() }));
jest.mock('../../src/data/players', () => ({ getPlayerDetailPhoto: jest.fn() }));

const mockedUseGame = jest.mocked(useGame);
const mockedGetPlayerDetailPhoto = jest.mocked(getPlayerDetailPhoto);

beforeEach(() => {
  mockedGetPlayerDetailPhoto.mockReset().mockReturnValue(undefined);
});

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="current-location">{location.pathname}{location.search}</div>;
}

describe('Card detail', () => {
  it('uses the Mateus Lopes detailed portrait in the player hero', () => {
    mockedGetPlayerDetailPhoto.mockReturnValue(undefined);
    const card: PlayerCard = {
      uid: 'mateus-lopes-card',
      playerId: 'mateus-lopes',
      name: 'Mateus Lopes',
      position: 'Pivo',
      sport: 'futsal',
      nationality: 'Brasil',
      age: 19,
      club: 'Estrela Futsal',
      rarity: 'uncommon',
      edition: '2025/26',
      special: 'none',
      overall: 57,
      pace: 41,
      shooting: 61,
      passing: 63,
      dribbling: 61,
      defending: 50,
      physical: 55,
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

    const { container } = render(
      <MemoryRouter initialEntries={['/card/mateus-lopes-card']}>
        <Routes>
          <Route path="/card/:uid" element={<CardDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    const portrait = container.querySelector('.card-detail-hero__portrait');
    expect(portrait).toBeInTheDocument();
    expect(portrait).toHaveAttribute('alt', 'Mateus Lopes');
  });

  it('uses the admin-managed detail photo before the static fallback', () => {
    mockedGetPlayerDetailPhoto.mockReturnValue('/uploads/player-detail.png');
    const card: PlayerCard = {
      uid: 'custom-player-card',
      playerId: 'custom-player',
      name: 'Jogador Personalizado',
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

    const { container } = render(
      <MemoryRouter initialEntries={['/card/custom-player-card']}>
        <Routes>
          <Route path="/card/:uid" element={<CardDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(container.querySelector('.card-detail-hero__portrait')).toHaveAttribute('src', '/uploads/player-detail.png');
    expect(mockedGetPlayerDetailPhoto).toHaveBeenCalledWith('Jogador Personalizado');
  });

  it('shows Off-Sale stats without changing the saved overall and keeps the collection card secondary', () => {
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

    expect(container.querySelector('.card-detail-collection__card')).toBeInTheDocument();
    expect(container.querySelector('.card-detail-hero__portrait')).not.toBeInTheDocument();
    expect(screen.getByText('Sorte')).toBeInTheDocument();
    expect(screen.getByText('999')).toHaveClass('rgb-text');
    expect(container.querySelector('.rgb-stat')).toBeInTheDocument();
    expect(container.querySelector('.card-detail-overall strong')).toHaveTextContent('80');
    expect(state.markSeen).toHaveBeenCalledWith(['card-1']);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir visualização 3D da carta de Jogador Zoeira' }));
    expect(screen.getByRole('dialog', { name: 'Visualizador 3D' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar visualização' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
