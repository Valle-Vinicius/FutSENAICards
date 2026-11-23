import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Match from '../../src/pages/Match';
import { useGame } from '../../src/store/useGame';
import { simulateMatch } from '../../src/engine/match';
import type { MatchResult } from '../../src/engine/match';
import type { PlayerCard } from '../../src/types';

const mockSupabaseFrom = jest.fn();
const mockSupabaseGetSession = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  get supabase() {
    return { from: mockSupabaseFrom, auth: { getSession: mockSupabaseGetSession } };
  },
}));
jest.mock('nanoid', () => ({ nanoid: () => 'test-match-id' }));
jest.mock('../../src/engine/match', () => ({
  ...jest.requireActual('../../src/engine/match'),
  simulateMatch: jest.fn(),
}));

const cards: PlayerCard[] = ['GK', 'Fixo', 'Ala', 'Ala', 'Pivo'].map((position, index) => ({
  uid: `card-${index}`,
  playerId: `player-${index}`,
  name: index === 0 ? 'Thiago Tavares' : `Jogador ${index}`,
  position: position as PlayerCard['position'],
  sport: 'futsal',
  nationality: 'Brasil',
  age: 20,
  club: 'Clube',
  rarity: 'common',
  edition: 'base',
  special: 'none',
  obtainedAt: Date.now(),
  favorite: false,
  isNew: false,
  overall: 80,
  pace: 80,
  shooting: 80,
  passing: 80,
  dribbling: 80,
  defending: 80,
  physical: 80,
}));

describe('match playback', () => {
  beforeEach(() => {
    mockSupabaseFrom.mockReset();
    mockSupabaseGetSession.mockReset().mockResolvedValue({ data: { session: null } });
    useGame.setState({
      cards,
      squads: {
        futsal: {
          sport: 'futsal',
          formation: '1-2-1',
          starters: cards.map(card => ({ position: card.position, uid: card.uid })),
          bench: [],
        },
      },
      savedSquads: [],
      matchHistory: [],
    });
    window.requestAnimationFrame = jest.fn(() => 1);
    window.cancelAnimationFrame = jest.fn();
    jest.mocked(simulateMatch).mockImplementation(config => ({
      config,
      homeScore: 2,
      awayScore: 1,
      events: [
        { minute: 0, type: 'kickoff', team: 'neutral', description: 'Início da partida' },
        { minute: 0, type: 'save', team: 'away', description: 'Defesa do goleiro' },
        { minute: 0, type: 'foul', team: 'home', description: 'Falta no meio' },
        { minute: 12, type: 'goal', team: 'home', description: 'Gol futuro' },
      ],
      frames: [
        {
          minute: 0,
          half: 1,
          homeScore: 0,
          awayScore: 0,
          ball: { x: 50, y: 50, holder: config.homePlayers[0].id },
          lastEvent: { minute: 0, type: 'kickoff', team: 'neutral', description: 'Início da partida' },
          players: [...config.homePlayers, ...config.awayPlayers].map(player => ({
            id: player.id,
            x: player.x,
            y: player.y,
            team: player.team,
          })),
        },
        {
          minute: 90,
          half: 2,
          homeScore: 2,
          awayScore: 1,
          ball: { x: 50, y: 50, holder: null },
          players: [],
        },
      ],
      playerStats: {},
      teamStats: {
        home: { possession: 0, passes: 0, passCompleted: 0, shots: 0, shotsOnTarget: 0, goals: 2, tackles: 0, fouls: 0, saves: 0 },
        away: { possession: 0, passes: 0, passCompleted: 0, shots: 0, shotsOnTarget: 0, goals: 1, tackles: 0, fouls: 0, saves: 0 },
      },
      durationMinutes: 90,
    } as MatchResult));
  });

  it('fetches only cards in the opponent starting lineup', async () => {
    const starterIds = ['op-card-1', 'op-card-2', 'op-card-3', 'op-card-4', 'op-card-5'];
    const opponentCards = starterIds.map((id, index) => ({
      id,
      name: `Opponent ${index}`,
      position: ['GK', 'Fixo', 'Ala', 'Ala', 'Pivo'][index],
      overall: 80,
      pace: 80,
      shooting: 80,
      passing: 80,
      dribbling: 80,
      defending: 80,
      physical: 80,
      reflexes: 80,
      positioning: 80,
      handling: 80,
      pack_group: 'standard',
    }));
    const mockProfileSingle = jest.fn().mockResolvedValue({ data: { name: 'Opponent' }, error: null });
    const mockProfileEq = jest.fn(() => ({ single: mockProfileSingle }));
    const mockProfileSelect = jest.fn(() => ({ eq: mockProfileEq }));
    const mockSquadsEq = jest.fn().mockResolvedValue({
      data: [{ is_primary: true, formation: '1-2-1', starters: starterIds }],
      error: null,
    });
    const mockSquadsSelect = jest.fn(() => ({ eq: mockSquadsEq }));
    const mockCardsEq = jest.fn().mockResolvedValue({ data: opponentCards, error: null });
    const mockCardsIn = jest.fn(() => ({ eq: mockCardsEq }));
    const mockCardsSelect = jest.fn(() => ({ in: mockCardsIn }));
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return { select: mockProfileSelect };
      if (table === 'squads') return { select: mockSquadsSelect };
      if (table === 'cards') return { select: mockCardsSelect };
      throw new Error(`Unexpected table: ${table}`);
    });

    render(
      <MemoryRouter initialEntries={['/match?opponent=opponent-1']}>
        <Routes>
          <Route path="/match" element={<Match />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(mockCardsEq).toHaveBeenCalledWith('user_id', 'opponent-1'));
    expect(mockCardsSelect).toHaveBeenCalledWith(
      'id,name,position,overall,pace,shooting,passing,dribbling,defending,physical,reflexes,positioning,handling,pack_group',
    );
    expect(mockCardsIn).toHaveBeenCalledWith('id', starterIds);
  });

  it('shows the match preparation screen and updates difficulty and tactics', () => {
    render(
      <MemoryRouter initialEntries={['/match']}>
        <Routes>
          <Route path="/match" element={<Match />} />
        </Routes>
      </MemoryRouter>,
    );

    const court = screen.getByRole('group', { name: 'Quadra de futsal com os titulares' });
    expect(court.querySelectorAll('.match-prep-player-marker')).toHaveLength(5);
    expect(screen.getByText('Quadra tática')).toBeTruthy();
    expect(screen.getByText('Pressão e linha defensiva não mudam no motor atual.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Difícil' }));
    expect(screen.getByLabelText('Confronto').textContent).toContain('IA (hard)');
    expect(screen.getByLabelText('Confronto').textContent).toContain('99OVERALL');

    fireEvent.click(screen.getByRole('radio', { name: 'Contra-ataque' }));

    expect(screen.getByText('Tenta o chute com mais frequência.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /INICIAR PARTIDA/ }).className).toContain('match-prep-start');
  });

  it('swaps a starter with a reserve and simulates with the updated lineup', () => {
    const reserveCard: PlayerCard = {
      ...cards[3],
      uid: 'reserve-card',
      name: 'Reserva Ala',
      overall: 90,
    };
    const state = useGame.getState();
    useGame.setState({
      cards: [...cards, reserveCard],
      squads: {
        ...state.squads,
        futsal: { ...state.squads.futsal, bench: [reserveCard.uid] },
      },
    });

    render(
      <MemoryRouter initialEntries={['/match']}>
        <Routes>
          <Route path="/match" element={<Match />} />
        </Routes>
      </MemoryRouter>,
    );

    const roster = screen.getByRole('region', { name: 'Seu elenco' });
    fireEvent.click(within(roster).getByRole('button', { name: 'Titular Ala: Jogador 2, OVR 80' }));
    fireEvent.click(within(roster).getByRole('button', { name: 'Reserva: Reserva Ala, OVR 90' }));

    expect(within(roster).getByRole('button', { name: 'Titular Ala: Reserva Ala, OVR 90' })).toBeTruthy();
    expect(within(roster).getByRole('button', { name: 'Reserva: Jogador 2, OVR 80' })).toBeTruthy();
    expect(screen.getByLabelText('Confronto').textContent).toContain('82');

    fireEvent.click(screen.getByRole('button', { name: /INICIAR PARTIDA/ }));
    const calls = jest.mocked(simulateMatch).mock.calls;
    const simulatedHomePlayers = calls[calls.length - 1]?.[0].homePlayers ?? [];
    expect(simulatedHomePlayers.some(player => player.id === 'reserve-card_home')).toBe(true);
  });

  it('shows only events up to the current frame and records solo rewards when playback starts', () => {
    render(
      <MemoryRouter initialEntries={['/match']}>
        <Routes>
          <Route path="/match" element={<Match />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /INICIAR PARTIDA/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }));

    expect(screen.getAllByText('Futsenai FC')).toHaveLength(2);
    expect(screen.getAllByText('IA (normal)')).toHaveLength(2);
    expect(screen.getAllByText(/Início da partida/)).toHaveLength(2);
    expect(screen.getByText('Tavares')).toBeTruthy();
    expect(screen.queryByText(/Gol futuro/)).toBeNull();
    const court = screen.getByRole('group', { name: 'Quadra de futsal com a posição dos jogadores' });
    expect(court.getAttribute('viewBox')).toBe('0 0 100 50');
    expect(court.querySelectorAll('path').length).toBeGreaterThanOrEqual(3);
    const goalkeeper = court.querySelector('g[aria-label*="Thiago Tavares"]');
    expect(goalkeeper).toBeTruthy();
    expect(goalkeeper?.querySelectorAll('circle')[1].getAttribute('fill')).toBe('#FDE047');
    const liveStats = within(screen.getByLabelText('Estatísticas ao vivo'));
    expect(liveStats.getAllByText('0 - 1')).toHaveLength(2);
    expect(liveStats.getByText('1 - 0')).toBeTruthy();
    expect(useGame.getState().matchHistory).toHaveLength(1);
    expect(useGame.getState().matchHistory[0]).toMatchObject({
      homeScore: 2,
      awayScore: 1,
      opponent: 'IA (normal)',
    });
    expect(useGame.getState().cards.map(card => card.xp)).toEqual([80, 80, 80, 80, 80]);
  });
});
