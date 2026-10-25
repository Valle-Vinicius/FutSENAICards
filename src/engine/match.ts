// src/engine/match.ts
// Pure, deterministic match simulation engine (no React/DOM).

export type Sport = 'futsal';
export type Tactic = 'balanced' | 'possession' | 'highpress' | 'counter' | 'compact';

export interface MatchPlayer {
  id: string;
  name: string;
  position: string;
  isGK: boolean;
  attrs: { pace: number; shooting: number; passing: number; dribbling: number; defending: number; physical: number; reflexes?: number; positioning?: number; handling?: number };
  team: 'home' | 'away';
  number: number;
  // runtime
  x: number; y: number;
  targetX: number; targetY: number;
  energy: number;
}

export interface MatchConfig {
  sport: Sport;
  homeName: string;
  awayName: string;
  homePlayers: MatchPlayer[];
  awayPlayers: MatchPlayer[];
  homeFormation: string;
  awayFormation: string;
  homeTactic: Tactic;
  awayTactic: Tactic;
  awayDifficulty: 'easy' | 'normal' | 'hard';
  seed: number;
  minutes: number; // total (45? 90?)
}

export interface MatchEvent {
  minute: number;
  type: 'kickoff' | 'pass' | 'shot' | 'goal' | 'save' | 'miss' | 'tackle' | 'foul' | 'yellow' | 'halftime' | 'fulltime';
  team: 'home' | 'away' | 'neutral';
  playerId?: string;
  assistId?: string;
  description: string;
}

export interface PlayerStats {
  playerId: string;
  passes: number;
  passCompleted: number;
  shots: number;
  shotsOnTarget: number;
  goals: number;
  assists: number;
  tackles: number;
  saves: number;
  fouls: number;
  yellow: number;
  distance: number;
}

export interface TeamStats {
  possession: number; // ticks
  passes: number;
  passCompleted: number;
  shots: number;
  shotsOnTarget: number;
  goals: number;
  tackles: number;
  fouls: number;
  saves: number;
}

export interface Frame {
  minute: number;
  half: 1 | 2;
  homeScore: number;
  awayScore: number;
  ball: { x: number; y: number; holder: string | null };
  players: { id: string; x: number; y: number; team: 'home' | 'away' }[];
  lastEvent?: MatchEvent;
}

export interface MatchResult {
  config: MatchConfig;
  homeScore: number;
  awayScore: number;
  events: MatchEvent[];
  frames: Frame[];
  playerStats: Record<string, PlayerStats>;
  teamStats: { home: TeamStats; away: TeamStats };
  durationMinutes: number;
}

// ---------- seeded rng ----------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TACTIC_MOD: Record<Tactic, { shoot: number; passRisk: number; press: number; defendLine: number }> = {
  balanced: { shoot: 1.0, passRisk: 1.0, press: 1.0, defendLine: 0.5 },
  possession: { shoot: 0.85, passRisk: 0.7, press: 0.8, defendLine: 0.6 },
  highpress: { shoot: 1.0, passRisk: 1.1, press: 1.4, defendLine: 0.75 },
  counter: { shoot: 1.2, passRisk: 1.2, press: 0.7, defendLine: 0.35 },
  compact: { shoot: 0.9, passRisk: 0.85, press: 0.6, defendLine: 0.25 },
};

const DIFF_MOD = { easy: 0.85, normal: 1.0, hard: 1.15 };

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function dist(x1: number, y1: number, x2: number, y2: number) { return Math.hypot(x1 - x2, y1 - y2); }

function basePositions(formation: string, side: 'home' | 'away'): { x: number; y: number }[] {
  // returns array aligned with players order (GK first then outfield)
  const mirror = side === 'away';
  const m = (p: { x: number; y: number }) => mirror ? { x: 100 - p.x, y: 100 - p.y } : p;
  const f: Record<string, { x: number; y: number }[]> = {
    '1-2-1': [{ x: 5, y: 50 }, { x: 25, y: 50 }, { x: 45, y: 25 }, { x: 45, y: 75 }, { x: 70, y: 50 }],
    '2-2': [{ x: 5, y: 50 }, { x: 25, y: 35 }, { x: 25, y: 65 }, { x: 55, y: 30 }, { x: 55, y: 70 }],
    '3-1': [{ x: 5, y: 50 }, { x: 20, y: 30 }, { x: 20, y: 50 }, { x: 20, y: 70 }, { x: 60, y: 50 }],
    '4-0': [{ x: 5, y: 50 }, { x: 25, y: 25 }, { x: 25, y: 45 }, { x: 25, y: 55 }, { x: 25, y: 75 }],
  };
  return (f[formation] || f['1-2-1']).map(m);
}

export function createPlayersFromCards(cards: { uid: string; name: string; position: string; overall: number; pace: number; shooting: number; passing: number; dribbling: number; defending: number; physical: number; reflexes?: number; positioning?: number; handling?: number }[], team: 'home' | 'away', formation: string, _sport: Sport): MatchPlayer[] {
  const side = team;
  const positions = basePositions(formation, side);
  // sort: GK first
  const gk = cards.find(c => c.position === 'GK') || cards[0];
  const others = cards.filter(c => c !== gk);
  const ordered = [gk, ...others].slice(0, positions.length);
  return ordered.map((c, i) => {
    const p = positions[i] || { x: 50, y: 50 };
    const isGK = c.position === 'GK';
    return {
      id: c.uid + '_' + team,
      name: c.name,
      position: c.position,
      isGK,
      attrs: { pace: c.pace, shooting: c.shooting, passing: c.passing, dribbling: c.dribbling, defending: c.defending, physical: c.physical, reflexes: c.reflexes, positioning: c.positioning, handling: c.handling },
      team,
      number: i + 1,
      x: p.x, y: p.y,
      targetX: p.x, targetY: p.y,
      energy: 100,
    };
  });
}

export function simulateMatch(config: MatchConfig): MatchResult {
  const rng = mulberry32(config.seed);
  const homeTactic = TACTIC_MOD[config.homeTactic];
  const awayTactic = TACTIC_MOD[config.awayTactic];
  const awayDiff = DIFF_MOD[config.awayDifficulty];

  // clone players
  const homePlayers = config.homePlayers.map(p => ({ ...p, attrs: { ...p.attrs } }));
  const awayPlayers = config.awayPlayers.map(p => ({ ...p, attrs: { ...p.attrs } }));
  // boost away by difficulty
  awayPlayers.forEach(p => {
    Object.keys(p.attrs).forEach(k => {
      const key = k as keyof MatchPlayer['attrs'];
      const v = p.attrs[key];
      if (typeof v === 'number') (p.attrs as any)[key] = Math.round(v * awayDiff);
    });
  });

  const homeMid = homePlayers[Math.floor(homePlayers.length / 2)];
  const awayMid = awayPlayers[Math.floor(awayPlayers.length / 2)];
  const allPlayers = [...homePlayers, ...awayPlayers];
  const byId = (id: string) => allPlayers.find(p => p.id === id)!;

  const stats: Record<string, PlayerStats> = {};
  allPlayers.forEach(p => {
    stats[p.id] = { playerId: p.id, passes: 0, passCompleted: 0, shots: 0, shotsOnTarget: 0, goals: 0, assists: 0, tackles: 0, saves: 0, fouls: 0, yellow: 0, distance: 0 };
  });
  const teamStats = {
    home: { possession: 0, passes: 0, passCompleted: 0, shots: 0, shotsOnTarget: 0, goals: 0, tackles: 0, fouls: 0, saves: 0 },
    away: { possession: 0, passes: 0, passCompleted: 0, shots: 0, shotsOnTarget: 0, goals: 0, tackles: 0, fouls: 0, saves: 0 },
  };

  const events: MatchEvent[] = [];
  const frames: Frame[] = [];

  let homeScore = 0;
  let awayScore = 0;
  let minute = 0;
  let half: 1 | 2 = 1;
  let ball = { x: 50, y: 50, holder: null as string | null };
  // kickoff: home gets ball at center
  const homeGK = homePlayers[0];
  const awayGK = awayPlayers[0];
  // start with a home midfielder holding ball
  ball.holder = homeMid.id;

  events.push({ minute: 0, type: 'kickoff', team: 'home', description: `Início da partida. ${config.homeName} com a bola.` });

  const totalMinutes = config.minutes; // e.g. 90
  const halfTime = totalMinutes / 2;
  const tickMinutes = 0.5;

  // helper: find nearest player to ball
  function nearestPlayer(teamFilter?: 'home' | 'away'): MatchPlayer {
    const candidates = teamFilter ? allPlayers.filter(p => p.team === teamFilter) : allPlayers;
    let best = candidates[0];
    let bestD = Infinity;
    for (const p of candidates) {
      const d = dist(p.x, p.y, ball.x, ball.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  // target positions based on possession
  function updateTargets() {
    const homeHas = ball.holder ? byId(ball.holder).team === 'home' : false;
    const awayHas = ball.holder ? byId(ball.holder).team === 'away' : false;
    homePlayers.forEach(() => {
      // placeholder
    });
    // simpler: use stored initial base by recompute from config home formation? We don't store formation here.
    // We'll just nudge players toward ball if possession, else toward own half.
    const possTeam = homeHas ? 'home' : (awayHas ? 'away' : 'neutral');
    allPlayers.forEach(p => {
      const towardBall = possTeam === p.team ? 0.15 : -0.05;
      // move slightly toward ball x
      p.targetX = clamp(p.x + (ball.x - p.x) * towardBall * (p.energy / 100), 2, 98);
      p.targetY = clamp(p.y + (ball.y - p.y) * towardBall * (p.energy / 100), 2, 98);
    });
  }

  // main loop
  while (minute < totalMinutes) {
    minute = Math.min(totalMinutes, minute + tickMinutes);
    if (minute === halfTime && half === 1) {
      half = 2;
      // reset positions
      homePlayers.forEach((p, i) => {
        const bp = basePositions(config.homeFormation, 'home')[i];
        if (bp) { p.x = bp.x; p.y = bp.y; p.targetX = bp.x; p.targetY = bp.y; }
      });
      awayPlayers.forEach((p, i) => {
        const bp = basePositions(config.awayFormation, 'away')[i];
        if (bp) { p.x = bp.x; p.y = bp.y; p.targetX = bp.x; p.targetY = bp.y; }
      });
      ball = { x: 50, y: 50, holder: homeMid.id };
      events.push({ minute, type: 'halftime', team: 'neutral', description: `Intervalo. Placar: ${homeScore} x ${awayScore}.` });
    }

    // energy decay
    allPlayers.forEach(p => { p.energy = clamp(p.energy - 0.05, 40, 100); });

    // move players toward targets
    allPlayers.forEach(p => {
      p.x += (p.targetX - p.x) * 0.12;
      p.y += (p.targetY - p.y) * 0.12;
      stats[p.id].distance += Math.hypot(p.targetX - p.x, p.targetY - p.y) * 0.01;
    });

    updateTargets();

    // possession tracking
    if (ball.holder) {
      const t = byId(ball.holder).team;
      if (t === 'home') teamStats.home.possession++; else teamStats.away.possession++;
    }

    // ball logic
    if (ball.holder) {
      const holder = byId(ball.holder);
      const team = holder.team;
      const isHome = team === 'home';
      const tactic = isHome ? homeTactic : awayTactic;
      const opponents = isHome ? awayPlayers : homePlayers;
      // pressure: nearest opponent distance
      let minOpp = Infinity;
      for (const o of opponents) {
        const d = dist(o.x, o.y, holder.x, holder.y);
        if (d < minOpp) minOpp = d;
      }
      const pressure = minOpp < 8 ? 1.3 : 1.0;

      // shot chance if in final third
      const inShootRange = isHome ? holder.x > 72 : holder.x < 28;
      const shootProb = (holder.attrs.shooting / 100) * tactic.shoot * (1 / pressure) * 0.18;
      if (inShootRange && rng() < shootProb) {
        // resolve shot
        stats[holder.id].shots++;
        if (isHome) teamStats.home.shots++; else teamStats.away.shots++;
        const gk = isHome ? awayGK : homeGK;
        const shotOnTarget = rng() < (holder.attrs.shooting / 100) * 0.7 + 0.2;
        if (shotOnTarget) {
          stats[holder.id].shotsOnTarget++;
          if (isHome) teamStats.home.shotsOnTarget++; else teamStats.away.shotsOnTarget++;
          // save?
          const saveProb = (gk.attrs.reflexes || gk.attrs.defending) / 100 * 0.85 + 0.1;
          if (rng() < saveProb) {
            stats[gk.id].saves++;
            if (isHome) teamStats.away.saves++; else teamStats.home.saves++;
            events.push({ minute, type: 'save', team: isHome ? 'away' : 'home', playerId: gk.id, description: `Defesa de ${gk.name}!` });
            ball.holder = null;
            ball.x = clamp(gk.x + (isHome ? -5 : 5), 2, 98);
            ball.y = gk.y;
          } else {
            // goal
            if (isHome) homeScore++; else awayScore++;
            stats[holder.id].goals++;
            if (isHome) teamStats.home.goals++; else teamStats.away.goals++;
            // assist: last passer? skip tracking
            events.push({ minute, type: 'goal', team, playerId: holder.id, description: `⚽ GOL de ${holder.name}!` });
            // reset ball to center, away/home kickoff
            ball = { x: 50, y: 50, holder: isHome ? awayMid.id : homeMid.id };
          }
        } else {
          events.push({ minute, type: 'miss', team, playerId: holder.id, description: `Chute de ${holder.name} para fora.` });
          ball.holder = null;
          ball.x = isHome ? 95 : 5;
          ball.y = holder.y;
        }
        continue;
      }

      // pass decision
      const passProb = 0.7 * tactic.passRisk;
      if (rng() < passProb) {
        // choose teammate
        const mates = isHome ? homePlayers : awayPlayers;
        const candidates = mates.filter(m => m.id !== holder.id);
        // prefer forward
        let best = candidates[0];
        let bestScore = -Infinity;
        for (const m of candidates) {
          const forward = isHome ? m.x - holder.x : holder.x - m.x;
          const open = opponents.reduce((acc, o) => acc + (dist(o.x, o.y, m.x, m.y) < 6 ? 1 : 0), 0);
          const score = forward * 0.5 + (m.attrs.passing) * 0.01 - open * 2 + rng() * 5;
          if (score > bestScore) { bestScore = score; best = m; }
        }
        stats[holder.id].passes++;
        if (isHome) teamStats.home.passes++; else teamStats.away.passes++;
        // intercept?
        const defender = opponents.reduce((a, b) => dist(a.x, a.y, (holder.x + best.x) / 2, (holder.y + best.y) / 2) < dist(b.x, b.y, (holder.x + best.x) / 2, (holder.y + best.y) / 2) ? a : b);
        const interceptProb = (defender.attrs.defending / 100) * 0.15 * pressure;
        if (rng() < interceptProb) {
          events.push({ minute, type: 'tackle', team: isHome ? 'away' : 'home', playerId: defender.id, description: `${defender.name} intercepta o passe.` });
          stats[defender.id].tackles++;
          if (isHome) teamStats.away.tackles++; else teamStats.home.tackles++;
          ball.holder = defender.id;
          ball.x = defender.x; ball.y = defender.y;
        } else {
          stats[holder.id].passCompleted++;
          if (isHome) teamStats.home.passCompleted++; else teamStats.away.passCompleted++;
          ball.holder = best.id;
          ball.x = best.x; ball.y = best.y;
          // move ball holder target forward
          best.targetX = clamp(best.x + (isHome ? 8 : -8), 5, 95);
        }
        continue;
      }

      // dribble
      const dribbleProb = (holder.attrs.dribbling / 100) * 0.4 * (1 / pressure);
      if (rng() < dribbleProb) {
        const advance = isHome ? 6 : -6;
        holder.x = clamp(holder.x + advance, 5, 95);
        holder.y = clamp(holder.y + (rng() - 0.5) * 4, 5, 95);
        ball.x = holder.x; ball.y = holder.y;
        events.push({ minute, type: 'pass', team, playerId: holder.id, description: `${holder.name} conduz a bola.` });
      } else {
        // lose ball
        const tackler = nearestPlayer(isHome ? 'away' : 'home');
        if (dist(tackler.x, tackler.y, holder.x, holder.y) < 12) {
          events.push({ minute, type: 'tackle', team: isHome ? 'away' : 'home', playerId: tackler.id, description: `${tackler.name} desarma ${holder.name}.` });
          stats[tackler.id].tackles++;
          if (isHome) teamStats.away.tackles++; else teamStats.home.tackles++;
          ball.holder = tackler.id;
        } else {
          ball.holder = null;
          ball.x = holder.x; ball.y = holder.y;
        }
      }
    } else {
      // loose ball: nearest claims
      const claimer = nearestPlayer();
      if (dist(claimer.x, claimer.y, ball.x, ball.y) < 15) {
        ball.holder = claimer.id;
        ball.x = claimer.x; ball.y = claimer.y;
      } else {
        // ball rolls
        ball.x = clamp(ball.x + (rng() - 0.5) * 2, 2, 98);
        ball.y = clamp(ball.y + (rng() - 0.5) * 2, 2, 98);
      }
    }

    // record frame every tick
    frames.push({
      minute,
      half,
      homeScore,
      awayScore,
      ball: { x: ball.x, y: ball.y, holder: ball.holder },
      players: allPlayers.map(p => ({ id: p.id, x: p.x, y: p.y, team: p.team })),
      lastEvent: events[events.length - 1],
    });
  }

  events.push({ minute: totalMinutes, type: 'fulltime', team: 'neutral', description: `Fim de jogo. ${config.homeName} ${homeScore} x ${awayScore} ${config.awayName}.` });

  return {
    config,
    homeScore,
    awayScore,
    events,
    frames,
    playerStats: stats,
    teamStats,
    durationMinutes: totalMinutes,
  };
}

// helper to get away mid reference (defined later in function scope issue) - fix: define before use
// We'll patch: homeMid/awayMid computed inside simulateMatch before use. Already referenced; move.
// Actually homeMid/awayMid need definition. Let's ensure:
// (handled below by redefining at top)
export function makeAwayTeam(_sport: Sport, difficulty: 'easy'|'normal'|'hard', seed: number): MatchPlayer[] {
  const rng = mulberry32(seed);
  const names = ['Silva','Santos','Oliveira','Souza','Lima','Costa','Rocha','Alves','Ferreira','Gomes','Ribeiro','Martins','Carvalho','Araújo','Melo'];
  const positions = ['GK','Fixo','Ala','Ala','Pivo'];
  const baseOvr = difficulty === 'easy' ? 68 : difficulty === 'hard' ? 82 : 75;
  return positions.map((pos, i) => {
    const isGK = pos === 'GK';
    const ovr = Math.round(baseOvr + (rng() * 8 - 4));
    const a = (v: number) => clamp(Math.round(v + (rng() * 10 - 5)), 30, 99);
    return {
      id: `away_${i}`,
      name: names[i % names.length],
      position: pos,
      isGK,
      attrs: isGK
        ? { pace: a(ovr - 20), shooting: a(ovr - 30), passing: a(ovr - 10), dribbling: a(ovr - 15), defending: a(ovr - 5), physical: a(ovr - 5), reflexes: a(ovr), positioning: a(ovr), handling: a(ovr) }
        : { pace: a(ovr), shooting: a(ovr), passing: a(ovr), dribbling: a(ovr), defending: a(ovr), physical: a(ovr) },
      team: 'away',
      number: i + 1,
      x: 0, y: 0, targetX: 0, targetY: 0, energy: 100,
    };
  });
}
