import { fireEvent, render, screen } from '@testing-library/react';
import type { MatchEvent, MatchPlayer, MatchResult, PlayerStats } from '../../src/engine/match';
import type { ChallengeTeamSnapshot } from '../../src/lib/services/challenges';
import PvpResultScreen from '../../src/components/PvpResultScreen';
import { getPvpAwards, getRatedPvpPlayers, ratePvpPlayer, snapshotCardIdForPlayer } from '../../src/engine/pvp-result';

jest.mock('../../src/data/players', () => ({
  getPlayerImage: (name: string) => name === 'Casa 2' ? '/local-casa2.jpg' : null,
}));

const cardIds = {
  home: [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000005',
  ],
  away: [
    '00000000-0000-4000-8000-000000000006',
    '00000000-0000-4000-8000-000000000007',
    '00000000-0000-4000-8000-000000000008',
    '00000000-0000-4000-8000-000000000009',
    '00000000-0000-4000-8000-000000000010',
  ],
};

const makePlayer = (id: string, side: 'home' | 'away', position: string, name: string): MatchPlayer => ({
  id: `${id}_${side}`,
  name,
  position,
  isGK: position === 'GK',
  attrs: { pace: 70, shooting: 70, passing: 70, dribbling: 70, defending: 70, physical: 70 },
  team: side,
  number: 1,
  x: 10,
  y: 10,
  targetX: 10,
  targetY: 10,
  energy: 100,
});

const makeStats = (playerId: string, overrides: Partial<PlayerStats> = {}): PlayerStats => ({
  playerId,
  passes: 0,
  passCompleted: 0,
  shots: 0,
  shotsOnTarget: 0,
  goals: 0,
  assists: 0,
  tackles: 0,
  saves: 0,
  fouls: 0,
  yellow: 0,
  distance: 0,
  ...overrides,
});

const players = [
  ...cardIds.home.map((id, index) => makePlayer(id, 'home', index === 0 ? 'GK' : 'Ala', `Casa ${index + 1}`)),
  ...cardIds.away.map((id, index) => makePlayer(id, 'away', index === 0 ? 'GK' : 'Ala', `Visitante ${index + 1}`)),
];

const snapshots: { home: ChallengeTeamSnapshot; away: ChallengeTeamSnapshot } = {
  home: {
    name: 'Time Casa',
    formation: '2-2',
    cards: cardIds.home.map((uid, index) => ({
      uid,
      name: `Casa ${index + 1}`,
      position: index === 0 ? 'GK' : 'Ala',
      overall: 80 + index,
      pace: 70,
      shooting: 70,
      passing: 70,
      dribbling: 70,
      defending: 70,
      physical: 70,
    })),
  },
  away: {
    name: 'Time Visitante',
    formation: '3-1',
    cards: cardIds.away.map((uid, index) => ({
      uid,
      name: `Visitante ${index + 1}`,
      position: index === 0 ? 'GK' : 'Ala',
      overall: 70 + index,
      pace: 70,
      shooting: 70,
      passing: 70,
      dribbling: 70,
      defending: 70,
      physical: 70,
    })),
  },
};

const result: MatchResult = {
  config: {
    sport: 'futsal',
    homeName: 'Time Casa',
    awayName: 'Time Visitante',
    homePlayers: players.slice(0, 5),
    awayPlayers: players.slice(5),
    homeFormation: '2-2',
    awayFormation: '3-1',
    homeTactic: 'balanced',
    awayTactic: 'counter',
    awayDifficulty: 'normal',
    mode: 'pvp',
    seed: 777,
    minutes: 90,
  },
  homeScore: 2,
  awayScore: 1,
  events: [
    { minute: 0, type: 'kickoff', team: 'neutral', description: 'Início da partida.' },
    { minute: 12, type: 'goal', team: 'home', playerId: `${cardIds.home[1]}_home`, description: 'GOL de Casa 2!' },
    { minute: 90, type: 'fulltime', team: 'neutral', description: 'Fim de jogo.' },
  ],
  frames: [],
  playerStats: Object.fromEntries(players.map(player => [player.id, makeStats(player.id)])),
  teamStats: {
    home: { possession: 60, passes: 24, passCompleted: 18, shots: 7, shotsOnTarget: 4, goals: 2, tackles: 8, fouls: 1, saves: 2 },
    away: { possession: 40, passes: 16, passCompleted: 10, shots: 5, shotsOnTarget: 3, goals: 1, tackles: 6, fouls: 2, saves: 1 },
  },
  durationMinutes: 90,
};

result.playerStats[`${cardIds.home[1]}_home`] = makeStats(`${cardIds.home[1]}_home`, {
  goals: 2,
  shots: 2,
  shotsOnTarget: 2,
  passCompleted: 3,
  passes: 3,
});
result.playerStats[`${cardIds.home[0]}_home`] = makeStats(`${cardIds.home[0]}_home`, { saves: 2 });
result.playerStats[`${cardIds.away[0]}_away`] = makeStats(`${cardIds.away[0]}_away`, {
  passes: 5,
  passCompleted: 0,
  shots: 4,
  shotsOnTarget: 0,
  fouls: 2,
  yellow: 1,
});

function renderScreen(overrides: Partial<React.ComponentProps<typeof PvpResultScreen>> = {}) {
  return render(
    <PvpResultScreen
      result={result}
      mySide="home"
      homeSnapshot={snapshots.home}
      awaySnapshot={snapshots.away}
      cardDetailsById={{}}
      rewardsSyncStatus="synced"
      onRematch={jest.fn()}
      rematchLoading={false}
      onMenu={jest.fn()}
      {...overrides}
    />,
  );
}

describe('PvP result evaluation', () => {
  it('resolves a card only by the exact UUID embedded in the player result ID', () => {
    expect(snapshotCardIdForPlayer(`${cardIds.home[0]}_home`, 'home')).toBe(cardIds.home[0]);
    expect(snapshotCardIdForPlayer(`${cardIds.home[0]}_away`, 'home')).toBeNull();
    expect(snapshotCardIdForPlayer('a-name_home', 'home')).toBeNull();

    const evaluated = getRatedPvpPlayers(result, snapshots);
    const exactPlayer = evaluated.find(player => player.player.id === `${cardIds.home[1]}_home`);
    expect(exactPlayer?.snapshotCard?.uid).toBe(cardIds.home[1]);
    expect(exactPlayer?.snapshotCard?.overall).toBe(81);
  });

  it('uses the frozen snapshot and is unaffected by a changed current squad', () => {
    const laterSquad = [{ ...snapshots.home.cards[1], uid: '00000000-0000-4000-8000-000000000099', overall: 99 }];
    const evaluated = getRatedPvpPlayers(result, snapshots);
    const player = evaluated.find(entry => entry.player.id === `${cardIds.home[1]}_home`);
    expect(player?.snapshotCard?.uid).toBe(cardIds.home[1]);
    expect(player?.snapshotCard?.uid).not.toBe(laterSquad[0].uid);
    expect(player?.snapshotCard?.overall).toBe(81);
  });

  it('calculates MVP and lowest-rated player deterministically from available stats', () => {
    const first = getPvpAwards(result, snapshots);
    const second = getPvpAwards(JSON.parse(JSON.stringify(result)), JSON.parse(JSON.stringify(snapshots)));
    expect(first.mvp?.player.id).toBe(`${cardIds.home[1]}_home`);
    expect(first.worst?.player.id).toBe(`${cardIds.away[0]}_away`);
    expect(first.mvp?.rating).toBe(second.mvp?.rating);
    expect(first.worst?.player.id).toBe(second.worst?.player.id);
  });

  it('keeps ratings bounded and deterministic when optional stats are zero', () => {
    const noActions = makeStats('idle');
    expect(ratePvpPlayer(noActions)).toBe(6);
    expect(ratePvpPlayer({ goals: 1 })).toBe(7.4);
    expect(ratePvpPlayer({ ...noActions, goals: 20 })).toBe(10);
    expect(ratePvpPlayer({ ...noActions, passes: 100, shots: 100, fouls: 10, yellow: 2 })).toBe(0);
  });

  it('does not create a rating or award for a player without result statistics', () => {
    const incomplete = { ...result, playerStats: {} };
    const awards = getPvpAwards(incomplete, { home: null, away: null });
    expect(awards.mvp).toBeNull();
    expect(awards.worst).toBeNull();
    expect(awards.awards).toHaveLength(0);
  });
});

describe('PvP result screen', () => {
  it('renders the official score, snapshot identity, statistics, and recorded timeline', () => {
    renderScreen();
    expect(screen.getByText('Resultado oficial do servidor')).toBeTruthy();
    expect(screen.getByText('VITÓRIA')).toBeTruthy();
    expect(screen.getByText('Números da partida')).toBeTruthy();
    expect(screen.getByText('GOL de Casa 2!')).toBeTruthy();
    expect(screen.queryByText(`INSTÂNCIA ${cardIds.home[1]}`)).toBeNull();
    expect(screen.queryByText(cardIds.home[1])).toBeNull();
    expect(screen.queryByText('Destaque em dribles')).toBeNull();
  });

  it('uses art returned for the exact snapshot card ID', () => {
    renderScreen({
      cardDetailsById: {
        [cardIds.home[1]]: {
          id: cardIds.home[1],
          rarity: 'rare',
          special: 'totw',
          edition: '2025/26',
          image: '/exact-instance-art.png',
        },
      },
    });

    const cardImages = screen.getAllByAltText('Arte da carta de Casa 2');
    expect(cardImages.length).toBeGreaterThan(0);
    expect(cardImages.every(image => image.getAttribute('src') === '/exact-instance-art.png')).toBe(true);
    expect(screen.getAllByText('Time da Semana').length).toBeGreaterThan(0);
    const playerCard = screen.getAllByRole('article').find(card => card.getAttribute('aria-label')?.startsWith('Carta de Casa 2'));
    expect(playerCard?.getAttribute('style')).toContain('border: 2px solid rgb(59, 130, 246)');
    fireEvent.error(cardImages[0]);
    expect(screen.getAllByAltText('Arte da carta de Casa 2').some(image => image.getAttribute('src') === '/local-casa2.jpg')).toBe(true);
  });

  it('uses the local player photo in rewards when the exact card has no stored image', () => {
    renderScreen();
    expect(screen.getAllByAltText('Foto de Casa 2').some(image => image.getAttribute('src') === '/local-casa2.jpg')).toBe(true);
    expect(screen.queryByText(cardIds.home[1])).toBeNull();
  });

  it('falls back to the same player photo when the stored instance image fails', () => {
    renderScreen({
      cardDetailsById: {
        [cardIds.home[1]]: { id: cardIds.home[1], image: '/broken-instance-photo.jpg' },
      },
    });

    const rewardImage = screen.getAllByAltText('Foto de Casa 2').find(image => image.getAttribute('src') === '/broken-instance-photo.jpg');
    expect(rewardImage).toBeTruthy();
    fireEvent.error(rewardImage!);
    expect(screen.getAllByAltText('Foto de Casa 2').some(image => image.getAttribute('src') === '/local-casa2.jpg')).toBe(true);
  });

  it('shows defeat from the other player perspective and supports details and rematch actions', () => {
    const onRematch = jest.fn();
    renderScreen({
      result: { ...result, homeScore: 1, awayScore: 2 },
      mySide: 'home',
      onRematch,
    });
    expect(screen.getByText('DERROTA')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Como calculamos as notas?' }));
    expect(screen.getByText(/Nota determinística: base 6,0/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Jogar revanche' }));
    expect(onRematch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: /Detalhes da partida/ }).getAttribute('href')).toBe('#match-details');
  });

  it('shows a winner and the shootout score when regulation time is tied', () => {
    renderScreen({
      result: {
        ...result,
        homeScore: 1,
        awayScore: 1,
        winnerSide: 'home',
        penalties: {
          homeScore: 4,
          awayScore: 3,
          winnerSide: 'home',
          kicks: [],
        },
      },
    });

    expect(screen.getByText('VITÓRIA')).toBeTruthy();
    expect(screen.getByText('Decisão por pênaltis')).toBeTruthy();
    expect(screen.getByText(/4.*3/)).toBeTruthy();
  });

  it('renders missing artwork and incomplete statistics without substituting another card', () => {
    renderScreen({
      homeSnapshot: null,
      awaySnapshot: null,
      cardDetailsById: {},
      result: {
        ...result,
        homeScore: 1,
        awayScore: 1,
        events: [] as MatchEvent[],
        playerStats: {},
        teamStats: undefined as unknown as MatchResult['teamStats'],
      },
    });
    expect(screen.getByText('EMPATE')).toBeTruthy();
    expect(screen.getByText('0 eventos registrados')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/Não há recompensa em moedas/)).toBeTruthy();
  });

  it('has responsive layout and identifies both sides in the comparison', () => {
    const { container } = renderScreen();
    expect(container.querySelector('.sm\\:px-6')).toBeTruthy();
    expect(screen.getAllByText(/DESAFIANTE/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/DESAFIADO/).length).toBeGreaterThan(0);
  });
});
