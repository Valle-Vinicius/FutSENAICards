import { simulateMatch, createPlayersFromCards } from '../match';
import type { MatchConfig } from '../match';

const card = (id: string, position: string, base: number) => ({
  uid: id, name: `P${id}`, position, overall: base,
  pace: base, shooting: base, passing: base, dribbling: base, defending: base, physical: base,
  reflexes: position === 'GK' ? base : undefined, positioning: position === 'GK' ? base : undefined, handling: position === 'GK' ? base : undefined,
});
const payload = {
  home: { formation: '2-2', name: 'Ana', cards: [card('h1', 'GK', 80), card('h2', 'Fixo', 78), card('h3', 'Fixo', 76), card('h4', 'Ala', 82), card('h5', 'Pivo', 85)] },
  away: { formation: '3-1', name: 'Bia', cards: [card('a1', 'GK', 70), card('a2', 'Fixo', 72), card('a3', 'Ala', 74), card('a4', 'Ala', 71), card('a5', 'Pivo', 73)] },
};

const runClient = (seed: number) => {
  const config: MatchConfig = {
    sport: 'futsal', homeName: payload.home.name, awayName: payload.away.name,
    homePlayers: createPlayersFromCards(payload.home.cards, 'home', payload.home.formation, 'futsal'),
    awayPlayers: createPlayersFromCards(payload.away.cards, 'away', payload.away.formation, 'futsal'),
    homeFormation: payload.home.formation, awayFormation: payload.away.formation,
    homeTactic: 'balanced', awayTactic: 'balanced', awayDifficulty: 'normal', seed, minutes: 40,
  };
  return simulateMatch(config);
};

describe('PvP challenge simulation', () => {
  it('uses the real squads of both players (no AI placeholders)', () => {
    const r = runClient(4242);
    expect(r.config.homePlayers.map(p => p.id)).toEqual(['h1_home', 'h2_home', 'h3_home', 'h4_home', 'h5_home']);
    expect(r.config.awayPlayers.map(p => p.id)).toEqual(['a1_away', 'a2_away', 'a3_away', 'a4_away', 'a5_away']);
    expect(r.config.awayName).toBe('Bia');
    expect(r.frames.length).toBeGreaterThan(0);
    expect(r.frames[0].players).toHaveLength(10);
  });

  it('both clients get the exact same result for the same seed', () => {
    const a = runClient(777);
    const b = runClient(777);
    expect(b.homeScore).toBe(a.homeScore);
    expect(b.awayScore).toBe(a.awayScore);
    expect(JSON.stringify(b.frames)).toBe(JSON.stringify(a.frames));
    expect(JSON.stringify(b.playerStats)).toBe(JSON.stringify(a.playerStats));
  });

  it('result survives the jsonb save/load round trip with everything the UI needs', () => {
    const a = runClient(31337);
    const loaded = JSON.parse(JSON.stringify({ ...a, seed: 31337, homeFormation: '2-2', awayFormation: '3-1' }));
    expect(loaded.frames.length).toBe(a.frames.length);
    expect(loaded.teamStats.home.passes).toBe(a.teamStats.home.passes);
    expect(loaded.config.homePlayers[0].id).toBe('h1_home');
    expect(Object.keys(loaded.playerStats)).toHaveLength(10);
  });
});
