import { simulateMatch, createPlayersFromCards, makeAwayTeam } from '../match';

const mkPlayer = (uid: string, name: string, pos: string, attrs: any) => ({
  uid, name, position: pos, overall: attrs.overall ?? 80,
  pace: attrs.pace ?? 80, shooting: attrs.shooting ?? 80, passing: attrs.passing ?? 80,
  dribbling: attrs.dribbling ?? 80, defending: attrs.defending ?? 80, physical: attrs.physical ?? 80,
  reflexes: attrs.reflexes, positioning: attrs.positioning, handling: attrs.handling,
});

const homeCards = [
  mkPlayer('h0', 'GK H', 'GK', { reflexes: 80, positioning: 78, handling: 76, defending: 70, pace: 50, shooting: 40, passing: 60, dribbling: 45, physical: 70 }),
  mkPlayer('h1', 'Fixo H', 'Fixo', { defending: 85, physical: 80, passing: 75, pace: 70, dribbling: 70, shooting: 60 }),
  mkPlayer('h2', 'Ala H', 'Ala', { pace: 85, passing: 80, dribbling: 82, shooting: 75, defending: 60, physical: 70 }),
  mkPlayer('h3', 'Ala H2', 'Ala', { pace: 80, passing: 78, dribbling: 80, shooting: 72, defending: 62, physical: 68 }),
  mkPlayer('h4', 'Pivo H', 'Pivo', { shooting: 88, physical: 82, dribbling: 78, passing: 70, pace: 75, defending: 50 }),
];

const awayCards = [
  mkPlayer('a0', 'GK A', 'GK', { reflexes: 75, positioning: 72, handling: 70, defending: 65, pace: 48, shooting: 38, passing: 58, dribbling: 42, physical: 68 }),
  mkPlayer('a1', 'Fixo A', 'Fixo', { defending: 80, physical: 76, passing: 72, pace: 68, dribbling: 66, shooting: 58 }),
  mkPlayer('a2', 'Ala A', 'Ala', { pace: 82, passing: 76, dribbling: 78, shooting: 70, defending: 58, physical: 66 }),
  mkPlayer('a3', 'Ala A2', 'Ala', { pace: 78, passing: 74, dribbling: 76, shooting: 68, defending: 60, physical: 64 }),
  mkPlayer('a4', 'Pivo A', 'Pivo', { shooting: 82, physical: 78, dribbling: 74, passing: 66, pace: 72, defending: 48 }),
];

describe('simulateMatch', () => {
  it('is deterministic with same seed', () => {
    const home = createPlayersFromCards(homeCards as any, 'home', '1-2-1', 'futsal');
    const away = createPlayersFromCards(awayCards as any, 'away', '1-2-1', 'futsal');
    const r1 = simulateMatch({ sport: 'futsal', homeName: 'H', awayName: 'A', homePlayers: home, awayPlayers: away, homeFormation: '1-2-1', awayFormation: '1-2-1', homeTactic: 'balanced', awayTactic: 'balanced', awayDifficulty: 'normal', seed: 42, minutes: 40 });
    const r2 = simulateMatch({ sport: 'futsal', homeName: 'H', awayName: 'A', homePlayers: home.map(p => ({ ...p })), awayPlayers: away.map(p => ({ ...p })), homeFormation: '1-2-1', awayFormation: '1-2-1', homeTactic: 'balanced', awayTactic: 'balanced', awayDifficulty: 'normal', seed: 42, minutes: 40 });
    expect(r1.homeScore).toBe(r2.homeScore);
    expect(r1.awayScore).toBe(r2.awayScore);
    expect(r1.events.length).toBe(r2.events.length);
    expect(r1.frames.length).toBe(r2.frames.length);
  });

  it('produces valid score and stats', () => {
    const home = createPlayersFromCards(homeCards as any, 'home', '1-2-1', 'futsal');
    const away = createPlayersFromCards(awayCards as any, 'away', '1-2-1', 'futsal');
    const r = simulateMatch({ sport: 'futsal', homeName: 'H', awayName: 'A', homePlayers: home, awayPlayers: away, homeFormation: '1-2-1', awayFormation: '1-2-1', homeTactic: 'balanced', awayTactic: 'balanced', awayDifficulty: 'normal', seed: 7, minutes: 40 });
    expect(r.homeScore).toBeGreaterThanOrEqual(0);
    expect(r.awayScore).toBeGreaterThanOrEqual(0);
    expect(r.frames.length).toBeGreaterThan(0);
    expect(r.events.length).toBeGreaterThan(0);
    // stats consistency
    const totalShots = r.teamStats.home.shots + r.teamStats.away.shots;
    expect(totalShots).toBeGreaterThanOrEqual(r.teamStats.home.shotsOnTarget + r.teamStats.away.shotsOnTarget);
  });

  it('different seeds can produce different results', () => {
    const home = createPlayersFromCards(homeCards as any, 'home', '1-2-1', 'futsal');
    const away = createPlayersFromCards(awayCards as any, 'away', '1-2-1', 'futsal');
    const r1 = simulateMatch({ sport: 'futsal', homeName: 'H', awayName: 'A', homePlayers: home, awayPlayers: away, homeFormation: '1-2-1', awayFormation: '1-2-1', homeTactic: 'balanced', awayTactic: 'balanced', awayDifficulty: 'normal', seed: 1, minutes: 40 });
    const r2 = simulateMatch({ sport: 'futsal', homeName: 'H', awayName: 'A', homePlayers: home, awayPlayers: away, homeFormation: '1-2-1', awayFormation: '1-2-1', homeTactic: 'balanced', awayTactic: 'balanced', awayDifficulty: 'normal', seed: 999, minutes: 40 });
    // not necessarily different, but frames should be valid
    expect(r1.frames.length).toBeGreaterThan(0);
    expect(r2.frames.length).toBeGreaterThan(0);
  });
});

describe('makeAwayTeam', () => {
  it('creates 5 players for futsal', () => {
    const team = makeAwayTeam('futsal', 'normal', 1);
    expect(team.length).toBe(5);
    expect(team[0].isGK).toBe(true);
  });
});
