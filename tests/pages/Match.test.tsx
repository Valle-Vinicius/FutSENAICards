import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Match from '../../src/pages/Match';
import { useGame } from '../../src/store/useGame';
import { simulateMatch } from '../../src/engine/match';
import type { MatchResult } from '../../src/engine/match';
import type { PlayerCard } from '../../src/types';

jest.mock('../../src/lib/supabase', () => ({ supabase: null }));
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

  it('shows an AI tactic preview that updates with the selected tactic', () => {
    render(
      <MemoryRouter initialEntries={['/match']}>
        <Routes>
          <Route path="/match" element={<Match />} />
        </Routes>
      </MemoryRouter>,
    );

    const preview = screen.getByRole('img', { name: /Prévia equilibrada/ });
    expect(preview.getAttribute('viewBox')).toBe('0 0 100 50');
    expect(preview.querySelectorAll('[data-team="home"]')).toHaveLength(5);
    expect(preview.querySelectorAll('[data-team="away"]')).toHaveLength(5);
    expect(screen.getByText('Pressão e linha defensiva não mudam no motor atual.')).toBeTruthy();

    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'counter' } });

    expect(screen.getByRole('img', { name: /Prévia de contra-ataque/ })).toBeTruthy();
    expect(screen.getByText('Tenta o chute com mais frequência.')).toBeTruthy();
  });

  it('shows only events up to the current frame and records solo rewards when playback starts', () => {
    render(
      <MemoryRouter initialEntries={['/match']}>
        <Routes>
          <Route path="/match" element={<Match />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar partida' }));
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
