import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useGame } from '../../src/store/useGame';
import Profile from '../../src/pages/Profile';
import { getProfile } from '../../src/lib/profile';

jest.mock('../../src/store/useGame', () => ({ useGame: jest.fn() }));
jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'viewer' } } },
        error: null,
      }),
    },
    functions: { invoke: jest.fn() },
  },
}));
jest.mock('../../src/lib/profile', () => ({
  getProfile: jest.fn().mockResolvedValue({
    id: 'viewer',
    name: 'Meu Jogador',
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    preferences: null,
  }),
  updateProfile: jest.fn(),
}));
jest.mock('../../src/components/Card', () => ({
  __esModule: true,
  default: ({ card, onClick }: { card: { name: string; overall: number; position: string }; onClick?: () => void }) => (
    <button type="button" aria-label={`${card.name}, overall ${card.overall}, ${card.position}`} onClick={onClick}>
      {card.name}
    </button>
  ),
}));
jest.mock('../../src/components/CardViewer3D', () => ({
  __esModule: true,
  default: ({ card, onClose }: { card: { name: string }; onClose: () => void }) => (
    <div role="dialog" aria-label="Visualizador 3D">
      <span>{card.name}</span>
      <button type="button" aria-label="Fechar visualização" onClick={onClose}>Fechar</button>
    </div>
  ),
}));
jest.mock('../../src/lib/services/auth', () => ({
  updateEmail: jest.fn(),
  updatePassword: jest.fn(),
  signOut: jest.fn(),
  updateMetadata: jest.fn(),
}));

const mockedUseGame = jest.mocked(useGame);

function renderProfile() {
  const featuredCard = {
    uid: 'featured-card',
    playerId: 'player-1',
    name: 'Minha Carta',
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
    isNew: false,
    obtainedAt: 1767225600000,
  };
  const state = {
    coins: 2310,
    xp: 1750,
    level: 4,
    cards: [featuredCard],
    missions: [{ id: 'mission-1', completed: true }],
    achievements: [{ id: 'achievement-1', title: 'Vitória inaugural', unlocked: true }],
    matchHistory: [
      { homeScore: 2, awayScore: 0 },
      { homeScore: 1, awayScore: 3 },
      { homeScore: 0, awayScore: 0 },
    ],
    packsOpened: 7,
    squads: {
      futsal: {
        sport: 'futsal',
        formation: '1-2-1',
        starters: [
          { position: 'GK', uid: null },
          { position: 'Fixo', uid: null },
          { position: 'Ala', uid: 'featured-card' },
          { position: 'Ala', uid: null },
          { position: 'Pivo', uid: null },
        ],
        bench: [],
      },
    },
  };
  mockedUseGame.mockImplementation(selector => selector(state as never));

  return render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  );
}

describe('My player profile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows player stats, the real squad and collection with the 3D card viewer', async () => {
    renderProfile();

    expect(await screen.findByRole('heading', { name: 'Meu Jogador' })).toBeInTheDocument();
    expect(screen.getByText('Taxa de vitória').parentElement).toHaveTextContent('33%');
    expect(screen.getByText('2.310')).toBeInTheDocument();
    expect(screen.getAllByText('Formação 1-2-1')).toHaveLength(2);
    expect(screen.getByText('Vitória inaugural')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Minha Carta, overall 98, Ala' })[0]);
    expect(screen.getByRole('dialog', { name: 'Visualizador 3D' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar visualização' }));
    expect(screen.queryByRole('dialog', { name: 'Visualizador 3D' })).not.toBeInTheDocument();
  });

  it('keeps profile editing and account security available', async () => {
    renderProfile();

    await screen.findByRole('heading', { name: 'Meu Jogador' });
    expect(getProfile).toHaveBeenCalledWith('viewer');
    fireEvent.click(screen.getByRole('button', { name: 'Editar perfil' }));

    expect(screen.getByPlaceholderText('URL do avatar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alterar email' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alterar senha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir conta' })).toBeInTheDocument();
  });
});
