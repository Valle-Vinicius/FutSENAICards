import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useGame } from '../../src/store/useGame';
import { toast } from '../../src/store/toast';
import { useHomePendingCounts } from '../../src/hooks/useHomePendingCounts';
import { useJournalNews } from '../../src/hooks/useJournalNews';
import type { NewsItem } from '../../src/data/news';
import type { PlayerCard } from '../../src/types';
import Home from '../../src/pages/Home';

jest.mock('../../src/store/useGame', () => ({ useGame: jest.fn() }));
jest.mock('../../src/lib/supabase', () => ({ supabase: null }));
jest.mock('../../src/lib/profile', () => ({ getProfile: jest.fn() }));
jest.mock('../../src/components/Card', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/store/toast', () => ({ toast: { success: jest.fn(), info: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/hooks/useHomePendingCounts', () => ({ useHomePendingCounts: jest.fn() }));
jest.mock('../../src/hooks/useJournalNews', () => ({
  useJournalNews: jest.fn(),
}));

const mockedUseGame = jest.mocked(useGame);
const mockedUseHomePendingCounts = jest.mocked(useHomePendingCounts);
const mockedUseJournalNews = jest.mocked(useJournalNews);

function renderHome(overrides: Record<string, unknown> = {}, news: NewsItem[] = []) {
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
  mockedUseJournalNews.mockReturnValue({
    news,
    loading: false,
    error: null,
    refresh: jest.fn(),
    retry: jest.fn(),
  });
  return { ...render(<MemoryRouter><Home /></MemoryRouter>), state };
}

function makeCard(uid: string, overall: number, rarity: PlayerCard['rarity']): PlayerCard {
  return {
    uid,
    playerId: uid,
    name: `Jogador ${uid}`,
    position: 'Ala',
    sport: 'futsal',
    nationality: 'Brasil',
    age: 18,
    club: 'SENAI',
    rarity,
    edition: '2025',
    special: 'none',
    overall,
    pace: 80,
    shooting: 80,
    passing: 80,
    dribbling: 80,
    defending: 80,
    physical: 80,
    obtainedAt: 1,
    favorite: false,
    isNew: false,
  };
}

describe('Home page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseHomePendingCounts.mockReturnValue({
      counts: { challenges: 2, friendRequests: 1, soldListings: 0 },
      loading: false,
      error: null,
      retry: jest.fn(),
    });
  });

  it('shows the editorial hero and preserves the main gameplay actions', () => {
    renderHome();

    expect(screen.getByRole('heading', { name: 'O seu jogo. O seu clube.' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Mateus, jogador em destaque' })).toBeInTheDocument();
    expect(screen.getByText(/Sua coleção ainda está vazia/)).toBeInTheDocument();
    expect(screen.getByText('Bora, Jogador Teste. O campo está esperando por você.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /entrar em campo/i })).toHaveAttribute('href', '/match');
    expect(screen.getAllByRole('link', { name: /abrir pacote bronze/i }).every(link => link.getAttribute('href') === '/open/bronze')).toBe(true);
    expect(screen.getByRole('link', { name: 'Ver eventos' })).toHaveAttribute('href', '/shop');
    expect(screen.getByRole('heading', { name: 'Pendências' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /desafios recebidos/i })).toHaveTextContent('2');
    expect(screen.getByRole('link', { name: /desafios recebidos/i }).querySelector('strong')).toHaveClass('home-pending-item__count--active');
    expect(screen.getByRole('link', { name: /pedidos de amizade/i })).toHaveTextContent('1');
    expect(screen.getByRole('heading', { name: 'Cartas em destaque' })).toBeInTheDocument();
    const sectionHeadings = [...document.querySelectorAll('h2')].map(heading => heading.textContent);
    expect(sectionHeadings.indexOf('Cartas em destaque')).toBeLessThan(sectionHeadings.indexOf('Pendências'));
    expect(screen.getByText('O apito ainda não tocou.')).toBeInTheDocument();
  });

  it('shows a single clear status when every pending count is zero', () => {
    mockedUseHomePendingCounts.mockReturnValue({
      counts: { challenges: 0, friendRequests: 0, soldListings: 0 },
      loading: false,
      error: null,
      retry: jest.fn(),
    });
    renderHome();

    expect(screen.getByText('Nada pendente. Campo livre.')).toBeInTheDocument();
    expect(document.querySelector('.home-pending__list')).not.toBeInTheDocument();
  });

  it('reserves extra width for large coin balances', () => {
    renderHome({ coins: 943237019 });

    expect(document.querySelector('.home-account__numbers')).toHaveClass('home-account__numbers--long-balance');
  });

  it('keeps the Mateus hero image and sorts collection cards by overall and rarity', () => {
    renderHome({
      cards: [
        makeCard('common-100', 100, 'common'),
        makeCard('rare-100', 100, 'rare'),
        makeCard('icon-99', 99, 'icon'),
      ],
      newCardUids: ['new-card'],
    });

    expect(screen.getByRole('img', { name: 'Mateus, jogador em destaque' })).toBeInTheDocument();
    expect([...document.querySelectorAll('.home-collection__cards a')].map(link => link.getAttribute('href'))).toEqual([
      '/card/rare-100',
      '/card/common-100',
      '/card/icon-99',
    ]);
    expect(screen.getByText('Bora, Jogador Teste. Tem 1 carta nova esperando.')).toBeInTheDocument();
  });

  it('does not create broken card links when a legacy card has no uid', () => {
    renderHome({ cards: [makeCard('', 100, 'rare')] });

    expect(document.querySelectorAll('a[href^="/card/"]')).toHaveLength(0);
    expect(screen.getByRole('img', { name: 'Mateus, jogador em destaque' })).toBeInTheDocument();
    expect(document.querySelectorAll('.home-collection__card--static')).toHaveLength(1);
  });

  it('keeps the full summaries and images for secondary journal stories', () => {
    renderHome({}, [
      {
        id: 'lead',
        title: 'Manchete principal',
        category: 'Esportes',
        player: '',
        date: 'Hoje',
        summary: 'Resumo completo da notícia principal.',
        image: 'https://example.test/lead.jpg',
        url: 'https://example.test/lead',
      },
      {
        id: 'secondary',
        title: 'Manchete secundária',
        category: 'Escola',
        player: '',
        date: 'Ontem',
        summary: 'Resumo completo da notícia secundária.',
        image: 'https://example.test/secondary.jpg',
        url: 'https://example.test/secondary',
      },
    ]);

    expect(screen.getByText('NOVIDADE')).toBeInTheDocument();
    expect(screen.getByText('Resumo completo da notícia principal.')).toBeInTheDocument();
    expect(screen.getByText('Resumo completo da notícia secundária.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /manchete secundária/i })).toHaveAttribute('href', 'https://example.test/secondary');
    expect(screen.getByRole('link', { name: /manchete secundária/i }).querySelector('img')).toHaveAttribute('src', 'https://example.test/secondary.jpg');
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
