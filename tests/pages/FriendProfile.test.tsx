import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useGame } from '../../src/store/useGame';
import FriendProfile from '../../src/pages/FriendProfile';
import * as challengesService from '../../src/lib/services/challenges';

jest.mock('../../src/lib/supabase', () => {
  const featuredCard = {
    id: 'featured-card',
    player_id: 'featured-player',
    name: 'Jogador Destaque',
    position: 'Ala',
    sport: 'futsal',
    nationality: 'Brasil',
    age: 20,
    club: 'FUTSENAI',
    rarity: 'icon',
    edition: '2025/26',
    special: 'none',
    overall: 98,
    pace: 97,
    shooting: 99,
    passing: 96,
    dribbling: 95,
    defending: 88,
    physical: 94,
    favorite: false,
    is_new: false,
    obtained_at: '2026-01-01T00:00:00.000Z',
  };
  const lineupCard = {
    ...featuredCard,
    id: 'lineup-card',
    player_id: 'lineup-player',
    name: 'Atleta em Quadra',
    position: 'Fixo',
    rarity: 'rare',
    overall: 86,
  };
  const profile = {
    id: 'player-1',
    name: 'Vinícius de Souza Monteiro',
    level: 4,
    xp: 1750,
    last_seen: new Date().toISOString(),
    avatar_url: null,
  };
  const matches = [
    { home_score: 2, away_score: 0 },
    { home_score: 1, away_score: 3 },
    { home_score: 0, away_score: 0 },
  ];
  const squad = {
    formation: '1-2-1',
    starters: ['lineup-card', null, null, null, null],
  };
  const friendship = {
    id: 'friendship-1',
    requester_id: 'viewer',
    addressee_id: 'player-1',
    status: 'accepted',
  };
  const makeQuery = (table: string) => {
    const query: any = {
      select: () => query,
      eq: () => query,
      order: () => query,
      single: () => Promise.resolve({ data: profile, error: null }),
      maybeSingle: () => Promise.resolve({ data: squad, error: null }),
      limit: () => Promise.resolve({ data: table === 'cards' ? [featuredCard] : matches, error: null }),
      in: () => Promise.resolve({ data: [lineupCard], error: null }),
      or: () => Promise.resolve({ data: [friendship], error: null }),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        const data = table === 'achievements' ? [{ id: 'achievement-1', title: 'Vitória inaugural', unlocked: true }] : [];
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  };
  return {
    supabase: {
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: { user: { id: 'viewer' } } },
          error: null,
        }),
      },
      from: jest.fn(makeQuery),
    },
  };
});

jest.mock('../../src/components/Card', () => ({
  __esModule: true,
  default: ({ card, onClick }: { card: { name: string; overall: number; position: string }; onClick?: () => void }) => (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`${card.name}, overall ${card.overall}, ${card.position}`}
      onClick={onClick}
    >
      {card.name}
    </div>
  ),
}));
jest.mock('../../src/store/useGame', () => ({ useGame: jest.fn() }));
jest.mock('../../src/lib/services/friends', () => ({
  sendRequest: jest.fn(),
  acceptRequest: jest.fn(),
  cancelRequest: jest.fn(),
  removeFriend: jest.fn(),
}));
jest.mock('../../src/lib/services/challenges', () => ({
  createChallenge: jest.fn().mockResolvedValue({ id: 'challenge-1' }),
}));
jest.mock('../../src/lib/services/pool', () => ({
  getAvailableWagerCardIds: jest.fn(),
  createPoolMatch: jest.fn(),
}));

const mockedUseGame = jest.mocked(useGame);

function renderFriendProfile() {
  const state = {
    coins: 1000,
    cards: [],
    syncUserData: jest.fn().mockResolvedValue(undefined),
  };
  mockedUseGame.mockImplementation(selector => selector(state as never));
  return render(
    <MemoryRouter initialEntries={['/profile/player-1']}>
      <Routes>
        <Route path="/profile/:userId" element={<FriendProfile />} />
        <Route path="/match" element={<div>Partida aberta</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Friend player profile', () => {
  it('shows real profile stats and opens the existing 3D viewer for lineup cards', async () => {
    renderFriendProfile();

    expect(await screen.findByRole('heading', { name: 'Vinícius de Souza Monteiro' })).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getAllByText('Formação 1-2-1')).toHaveLength(2);
    expect(screen.getByText('Atleta em Quadra')).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
    expect(screen.getByText('Vitória inaugural')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Atleta em Quadra, overall 86, Fixo' }));
    expect(screen.getByRole('dialog', { name: 'Visualizador 3D' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clique para virar e ver o verso' }));
    expect(screen.getByRole('button', { name: 'Carta virada; clique para ver a frente' })).toBeInTheDocument();
  });

  it('preserves the challenge flow from the player profile', async () => {
    renderFriendProfile();

    fireEvent.click(await screen.findByRole('button', { name: 'Desafiar' }));

    await waitFor(() => expect(challengesService.createChallenge).toHaveBeenCalledWith('viewer', 'player-1'));
    expect(await screen.findByText('Partida aberta')).toBeInTheDocument();
  });
});
