import { AI_BASE_OVR, createPlayersFromCards, simulateMatch } from '../src/engine/match.ts';
import type { MatchPlayer, Tactic } from '../src/engine/match.ts';

const GAMES_PER_SCENARIO = 500;
const FORMATION = '1-2-1';
const TACTIC: Tactic = 'balanced';
const AI_DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
type AiDifficulty = typeof AI_DIFFICULTIES[number];

const positions = ['GK', 'Fixo', 'Ala', 'Ala', 'Pivo'];

function createRoster(overall: number, team: 'home' | 'away'): MatchPlayer[] {
  const cards = positions.map((position, index) => ({
    uid: `balance-${team}-${index}`,
    name: `${team}-${index}`,
    position,
    overall,
    pace: overall,
    shooting: overall,
    passing: overall,
    dribbling: overall,
    defending: overall,
    physical: overall,
    ...(position === 'GK'
      ? { reflexes: overall, positioning: overall, handling: overall }
      : {}),
  }));
  return createPlayersFromCards(cards, team, FORMATION, 'futsal');
}

function moveTeam(players: MatchPlayer[], team: 'home' | 'away'): MatchPlayer[] {
  return players.map(player => ({
    ...player,
    id: `ai_${team}_${player.number}`,
    team,
  }));
}

function simulateScenario(userOverall: number, aiDifficulty: AiDifficulty, gameCount: number) {
  let userWins = 0;
  let aiWins = 0;
  let regulationDraws = 0;
  let penaltyShootouts = 0;
  let totalGoals = 0;

  for (let game = 0; game < gameCount; game += 1) {
    const userIsHome = game % 2 === 0;
    const seed = (AI_DIFFICULTIES.indexOf(aiDifficulty) + 1) * 1_000_000 + userOverall * 10_000 + game + 1;
    const userTeam = createRoster(userOverall, userIsHome ? 'home' : 'away');
    const generatedAi = createRoster(AI_BASE_OVR[aiDifficulty], 'away');
    const homePlayers = userIsHome
      ? userTeam
      : moveTeam(generatedAi, 'home');
    const awayPlayers = userIsHome
      ? generatedAi
      : createRoster(userOverall, 'away');
    const userSide = userIsHome ? 'home' : 'away';

    const result = simulateMatch({
      sport: 'futsal',
      mode: 'friendly',
      homeName: userIsHome ? 'Jogador' : 'IA',
      awayName: userIsHome ? 'IA' : 'Jogador',
      homePlayers,
      awayPlayers,
      homeFormation: FORMATION,
      awayFormation: FORMATION,
      homeTactic: TACTIC,
      awayTactic: TACTIC,
      awayDifficulty: aiDifficulty,
      seed,
      minutes: 90,
    });

    if (result.homeScore === result.awayScore) regulationDraws += 1;
    if (result.penalties) penaltyShootouts += 1;
    if (result.winnerSide === userSide) userWins += 1;
    else if (result.winnerSide) aiWins += 1;
    totalGoals += result.homeScore + result.awayScore;
  }

  return {
    'OVR jogador': userOverall,
    'IA': aiDifficulty,
    'vitórias jogador': `${(userWins / gameCount * 100).toFixed(1)}%`,
    'vitórias IA': `${(aiWins / gameCount * 100).toFixed(1)}%`,
    'empates no tempo': `${(regulationDraws / gameCount * 100).toFixed(1)}%`,
    'pênaltis': `${(penaltyShootouts / gameCount * 100).toFixed(1)}%`,
    'gols/jogo': (totalGoals / gameCount).toFixed(2),
  };
}

const requestedGameCount = process.argv[2] === undefined
  ? GAMES_PER_SCENARIO
  : Number(process.argv[2]);
if (!Number.isSafeInteger(requestedGameCount) || requestedGameCount < GAMES_PER_SCENARIO) {
  throw new Error(`Use pelo menos ${GAMES_PER_SCENARIO} partidas por cenário.`);
}

const scenarios = [
  ...[55, 65, 75, 85, 95].map(userOverall => ({ userOverall, aiDifficulty: 'normal' as const })),
  { userOverall: 75, aiDifficulty: 'easy' as const },
  ...[75, 85, 95].map(userOverall => ({ userOverall, aiDifficulty: 'hard' as const })),
];

console.table(scenarios.map(({ userOverall, aiDifficulty }) =>
  simulateScenario(userOverall, aiDifficulty, requestedGameCount),
));
