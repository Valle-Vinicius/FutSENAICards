import { fireEvent, render, screen } from '@testing-library/react';
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
  name: `Jogador ${index}`,
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
        { minute: 12, type: 'goal', team: 'home', description: 'Gol futuro' },
      ],
      frames: [
        {
          minute: 0,
          half: 1,
          homeScore: 0,
          awayScore: 0,
          ball: { x: 50, y: 50, holder: null },
          players: [],
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

    expect(screen.getByText('Futsenai FC')).toBeTruthy();
    expect(screen.getByText('IA (normal)')).toBeTruthy();
    expect(screen.getByText(/Início da partida/)).toBeTruthy();
    expect(screen.queryByText(/Gol futuro/)).toBeNull();
    expect(useGame.getState().matchHistory).toHaveLength(1);
    expect(useGame.getState().matchHistory[0]).toMatchObject({
      homeScore: 2,
      awayScore: 1,
      opponent: 'IA (normal)',
    });
    expect(useGame.getState().cards.map(card => card.xp)).toEqual([80, 80, 80, 80, 80]);
  });
});
