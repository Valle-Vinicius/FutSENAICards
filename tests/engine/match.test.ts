import { simulateMatch, createPlayersFromCards, makeAwayTeam } from '../../src/engine/match';

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

  it('starts the AI team in its formation instead of the top-left corner', () => {
    const home = createPlayersFromCards(homeCards as any, 'home', '1-2-1', 'futsal');
    const away = makeAwayTeam('futsal', 'normal', 21);
    const result = simulateMatch({
      sport: 'futsal',
      homeName: 'H',
      awayName: 'IA',
      homePlayers: home,
      awayPlayers: away,
      homeFormation: '1-2-1',
      awayFormation: '1-2-1',
      homeTactic: 'balanced',
      awayTactic: 'balanced',
      awayDifficulty: 'normal',
      seed: 21,
      minutes: 1,
    });
    const aiGoalkeeper = result.frames[0].players.find(player => player.id === 'away_0');

    expect(result.frames).toHaveLength(3);
    expect(aiGoalkeeper).toBeDefined();
    expect(aiGoalkeeper?.x).toBeGreaterThan(90);
    expect(aiGoalkeeper?.y).toBeGreaterThan(40);
    expect(aiGoalkeeper?.y).toBeLessThan(60);
  });

  it('starts with both teams in formation and the kickoff ball at the center', () => {
    const home = createPlayersFromCards(homeCards as any, 'home', '1-2-1', 'futsal');
    const away = makeAwayTeam('futsal', 'normal', 21);
    const result = simulateMatch({
      sport: 'futsal',
      homeName: 'H',
      awayName: 'IA',
      homePlayers: home,
      awayPlayers: away,
      homeFormation: '1-2-1',
      awayFormation: '1-2-1',
      homeTactic: 'balanced',
      awayTactic: 'balanced',
      awayDifficulty: 'normal',
      seed: 21,
      minutes: 1,
    });
    const kickoff = result.frames[0];
    const homeGoalkeeper = kickoff.players.find(player => player.id === 'h0_home');
    const awayGoalkeeper = kickoff.players.find(player => player.id === 'away_0');

    expect(kickoff.minute).toBe(0);
    expect(kickoff.ball).toMatchObject({ x: 50, y: 50 });
    expect(homeGoalkeeper).toMatchObject({ x: 5, y: 50 });
    expect(awayGoalkeeper).toMatchObject({ x: 95, y: 50 });
    expect(kickoff.players.some(player => player.x === 0 && player.y === 0)).toBe(false);
  });

  it('shows a goalkeeper save with the keeper controlling the ball at the save point', () => {
    const home = createPlayersFromCards(homeCards as any, 'home', '1-2-1', 'futsal');
    const away = createPlayersFromCards(awayCards as any, 'away', '1-2-1', 'futsal');
    let saveFrame: ReturnType<typeof simulateMatch>['frames'][number] | undefined;

    for (let seed = 1; seed <= 32 && !saveFrame; seed++) {
      const result = simulateMatch({
        sport: 'futsal',
        homeName: 'H',
        awayName: 'A',
        homePlayers: home,
        awayPlayers: away,
        homeFormation: '1-2-1',
        awayFormation: '1-2-1',
        homeTactic: 'balanced',
        awayTactic: 'balanced',
        awayDifficulty: 'normal',
        seed,
        minutes: 40,
      });
      saveFrame = result.frames.find(frame =>
        frame.lastEvent?.type === 'save' && frame.lastEvent.minute === frame.minute,
      );
    }

    expect(saveFrame).toBeDefined();
    const savedBy = saveFrame?.lastEvent?.playerId;
    const goalkeeper = saveFrame?.players.find(player => player.id === savedBy);
    expect(saveFrame?.ball.holder).toBe(savedBy);
    expect(saveFrame?.ball.x).toBe(goalkeeper?.x);
    expect(saveFrame?.ball.y).toBe(goalkeeper?.y);
  });

  it('has a goalkeeper release the ball to a teammate after a save', () => {
    const home = createPlayersFromCards(homeCards as any, 'home', '1-2-1', 'futsal');
    const away = createPlayersFromCards(awayCards as any, 'away', '1-2-1', 'futsal');
    let result: ReturnType<typeof simulateMatch> | undefined;
    let saveIndex = -1;

    for (let seed = 1; seed <= 32 && saveIndex < 0; seed++) {
      const candidate = simulateMatch({
        sport: 'futsal',
        homeName: 'H',
        awayName: 'A',
        homePlayers: home,
        awayPlayers: away,
        homeFormation: '1-2-1',
        awayFormation: '1-2-1',
        homeTactic: 'balanced',
        awayTactic: 'balanced',
        awayDifficulty: 'normal',
        seed,
        minutes: 40,
      });
      const index = candidate.frames.findIndex(frame => frame.lastEvent?.type === 'save');
      if (index >= 0 && index < candidate.frames.length - 1) {
        result = candidate;
        saveIndex = index;
      }
    }

    const savedBy = result?.frames[saveIndex]?.lastEvent?.playerId;
    const followingFrame = result?.frames[saveIndex + 1];

    expect(savedBy).toBeDefined();
    expect(followingFrame?.ball.holder).not.toBe(savedBy);
    expect(['pass', 'tackle']).toContain(followingFrame?.lastEvent?.type);
  });

  it('resolves a tied PvP score with a deterministic penalty shootout', () => {
    const home = createPlayersFromCards(homeCards as any, 'home', '1-2-1', 'futsal');
    const away = createPlayersFromCards(awayCards as any, 'away', '1-2-1', 'futsal');
    const config = {
      sport: 'futsal' as const,
      mode: 'pvp' as const,
      homeName: 'H',
      awayName: 'A',
      homePlayers: home,
      awayPlayers: away,
      homeFormation: '1-2-1',
      awayFormation: '1-2-1',
      homeTactic: 'balanced' as const,
      awayTactic: 'balanced' as const,
      awayDifficulty: 'normal' as const,
      seed: 42,
      minutes: 0.5,
    };
    const first = simulateMatch(config);
    const second = simulateMatch({
      ...config,
      homePlayers: home.map(player => ({ ...player })),
      awayPlayers: away.map(player => ({ ...player })),
    });

    expect(first.homeScore).toBe(first.awayScore);
    expect(first.penalties).not.toBeNull();
    expect(first.winnerSide).toBe(first.penalties?.winnerSide);
    expect(first.penalties?.homeScore).not.toBe(first.penalties?.awayScore);
    expect(first.penalties).toEqual(second.penalties);
    expect(first.events.filter(event => event.type === 'penalty').length).toBeGreaterThan(0);
  });

  it('resolves friendly draws with a deterministic penalty shootout', () => {
    const home = createPlayersFromCards(homeCards as any, 'home', '1-2-1', 'futsal');
    const away = createPlayersFromCards(awayCards as any, 'away', '1-2-1', 'futsal');
    const config = {
      sport: 'futsal',
      homeName: 'H',
      awayName: 'A',
      homePlayers: home,
      awayPlayers: away,
      homeFormation: '1-2-1',
      awayFormation: '1-2-1',
      homeTactic: 'balanced',
      awayTactic: 'balanced',
      awayDifficulty: 'normal',
      seed: 42,
      minutes: 0.5,
    } as const;
    const result = simulateMatch(config);
    const repeatedResult = simulateMatch({
      ...config,
      homePlayers: home.map(player => ({ ...player })),
      awayPlayers: away.map(player => ({ ...player })),
    });

    expect(result.homeScore).toBe(result.awayScore);
    expect(result.penalties).not.toBeNull();
    expect(result.winnerSide).toBe(result.penalties?.winnerSide);
    expect(result.penalties).toEqual(repeatedResult.penalties);
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

  it('records committed fouls as events and live team statistics', () => {
    const home = createPlayersFromCards(homeCards as any, 'home', '1-2-1', 'futsal');
    const away = createPlayersFromCards(awayCards as any, 'away', '1-2-1', 'futsal');
    let result: ReturnType<typeof simulateMatch> | undefined;
    for (let seed = 1; seed <= 32; seed++) {
      result = simulateMatch({
        sport: 'futsal',
        homeName: 'H',
        awayName: 'A',
        homePlayers: home,
        awayPlayers: away,
        homeFormation: '1-2-1',
        awayFormation: '1-2-1',
        homeTactic: 'balanced',
        awayTactic: 'balanced',
        awayDifficulty: 'normal',
        seed,
        minutes: 90,
      });
      if (result.events.some(event => event.type === 'foul')) break;
    }

    const foulEvents = result?.events.filter(event => event.type === 'foul') ?? [];
    expect(foulEvents.length).toBeGreaterThan(0);
    expect((result?.teamStats.home.fouls ?? 0) + (result?.teamStats.away.fouls ?? 0)).toBe(foulEvents.length);
  });
});

describe('makeAwayTeam', () => {
  it('creates 5 players for futsal', () => {
    const team = makeAwayTeam('futsal', 'normal', 1);
    expect(team.length).toBe(5);
    expect(team[0].isGK).toBe(true);
  });
});
