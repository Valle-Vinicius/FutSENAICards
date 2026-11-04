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
    homeTactic: 'balanced', awayTactic: 'balanced',     awayDifficulty: 'hard', mode: 'pvp', seed, minutes: 40,
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

  it('does not apply AI difficulty modifiers to a PvP team', () => {
    const config = runClient(9191).config;
    const easy = simulateMatch({ ...config, awayDifficulty: 'easy' });
    const hard = simulateMatch({ ...config, awayDifficulty: 'hard' });
    expect(hard.frames).toEqual(easy.frames);
    expect(hard.playerStats).toEqual(easy.playerStats);
  });

  it('accepts database snapshots with null goalkeeper-only attributes on outfield players', () => {
    const cardsWithNullGoalkeeperAttrs = payload.home.cards.map(player => ({
      ...player,
      reflexes: player.position === 'GK' ? player.reflexes : null,
      positioning: player.position === 'GK' ? player.positioning : null,
      handling: player.position === 'GK' ? player.handling : null,
    }));
    const players = createPlayersFromCards(cardsWithNullGoalkeeperAttrs, 'home', '2-2', 'futsal');
    const config = runClient(8181).config;
    expect(() => simulateMatch({ ...config, homePlayers: players })).not.toThrow();
  });

  it('rejects lineups without exactly five players and one goalkeeper', () => {
    const result = runClient(5150);
    expect(() => simulateMatch({
      ...result.config,
      homePlayers: result.config.homePlayers.slice(1),
    })).toThrow(/exatamente cinco jogadores/);
    expect(() => simulateMatch({
      ...result.config,
      awayPlayers: result.config.awayPlayers.map(player => ({ ...player, isGK: false })),
    })).toThrow(/goleiro válido/);
  });

  it('rejects missing and out-of-range player attributes', () => {
    const config = runClient(6060).config;
    const missingPace = config.homePlayers.map(player => ({ ...player, attrs: { ...player.attrs } }));
    Object.defineProperty(missingPace[1].attrs, 'pace', { value: undefined });
    const excessiveShooting = config.awayPlayers.map((player, index) => index === 1
      ? { ...player, attrs: { ...player.attrs, shooting: 101 } }
      : player);

    expect(() => simulateMatch({ ...config, homePlayers: missingPace })).toThrow(/atributos inválidos/);
    expect(() => simulateMatch({ ...config, awayPlayers: excessiveShooting })).toThrow(/atributos inválidos/);
  });

  it('generates reward-compatible player IDs from UUID card IDs', () => {
    const uuidCards = payload.home.cards.map((player, index) => ({
      ...player,
      uid: `00000000-0000-4000-8000-00000000000${index}`,
    }));
    const players = createPlayersFromCards(uuidCards, 'home', '2-2', 'futsal');

    expect(players.every(player => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_home$/i.test(player.id))).toBe(true);
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
