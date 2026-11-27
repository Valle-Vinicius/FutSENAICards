import { useState, useRef, useEffect, useCallback } from 'react';
import { useGame } from '../store/useGame';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from '../store/toast';
import { simulateMatch, createPlayersFromCards, makeAwayTeam, MATCH_DURATION_MINUTES, AI_BASE_OVR } from '../engine/match';
import type { MatchEvent, MatchResult, MatchPlayer, Tactic } from '../engine/match';
import PvpResultScreen, { type SnapshotCardDetails } from '../components/PvpResultScreen';
import MatchPreparation from '../components/MatchPreparation';
import * as challengesService from '../lib/services/challenges';
import type { MatchPlaybackState } from '../lib/services/challenges';
import { nanoid } from 'nanoid';
import { playTone, unlockSound } from '../lib/sound';
import { FORMATIONS_FUTSAL } from '../lib/game';
import type { Position, Squad } from '../types';

type ChallengeSquads = {
  home: MatchPlayer[];
  away: MatchPlayer[];
  homeCards: any[];
  awayCards: any[];
  homeFormation: string;
  awayFormation: string;
  homeName: string;
  awayName: string;
};

const MIN_STARTERS = 5;
const ADMIN_USER_ID = '35a8dc5f-c5db-4b33-9380-a32739ff6c10';
const OFF_SALE_PVP_MESSAGE = 'Cartas Off-Sale não podem ser usadas no X1. Troque-as no seu elenco e tente novamente.';

const TACTICS: Tactic[] = ['balanced', 'possession', 'highpress', 'counter', 'compact'];
const TACTIC_LABEL: Record<Tactic, string> = { balanced: 'Equilibrado', possession: 'Posse de bola', highpress: 'Pressão alta', counter: 'Contra-ataque', compact: 'Defesa compacta' };
const TEAM_COLORS = { home: 'var(--red)', away: '#173B6B' } as const;

function MatchInner() {
  const cards = useGame(s => s.cards);
  const audioEnabled = useGame(s => s.settings.audio);
  const squads = useGame(s => s.squads);
  const savedSquads = useGame(s => s.savedSquads);
  const sport = 'futsal' as const;
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');
  const [homeTactic, setHomeTactic] = useState<Tactic>('balanced');
  const [challengeTactic, setChallengeTactic] = useState<Tactic>('balanced');
  const [step, setStep] = useState<'setup' | 'prematch' | 'play' | 'result'>('setup');
  const [selectedSquadId, setSelectedSquadId] = useState<string | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [resultConfirmed, setResultConfirmed] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const addMatchHistory = useGame(s => s.addMatchHistory);
  const addLocalMatchHistory = useGame(s => s.addLocalMatchHistory);
  const syncUserData = useGame(s => s.syncUserData);
  const addPlayerXp = useGame(s => s.addPlayerXp);
  const recordMatchStats = useGame(s => s.recordMatchStats);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [playbackState, setPlaybackState] = useState<MatchPlaybackState | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [hoveredPlayerId, setHoveredPlayerId] = useState<string | null>(null);
  const [goalAnnouncement, setGoalAnnouncement] = useState<MatchEvent | null>(null);
  const [matchNotice, setMatchNotice] = useState<'Intervalo' | 'Fim de jogo' | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const frameIndexRef = useRef(0);
  const goalTimeoutRef = useRef<number | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);
  const finishTimeoutRef = useRef<number | null>(null);
  const lastGoalKeyRef = useRef<string | null>(null);
  const lastNoticeKeyRef = useRef<string | null>(null);
  const finishedPlaybackHandledRef = useRef(false);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const opponentId = searchParams.get('opponent');
  const challengeId = searchParams.get('challenge');
  const [opponentName, setOpponentName] = useState<string>('IA');
  const [opponentOverall, setOpponentOverall] = useState<number | null>(null);
  const [opponentPlayers, setOpponentPlayers] = useState<MatchPlayer[] | null>(null);
  const [opponentPlayersOwner, setOpponentPlayersOwner] = useState<string | null>(null);
  const [opponentError, setOpponentError] = useState<string | null>(null);
  const [opponentFormation, setOpponentFormation] = useState<string>('1-2-1');
  const [loadingOpp, setLoadingOpp] = useState(false);
  const [challenge, setChallenge] = useState<any>(null);
  const [challengeSquads, setChallengeSquads] = useState<ChallengeSquads | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(!!challengeId);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [officialSnapshotCardDetails, setOfficialSnapshotCardDetails] = useState<{
    key: string;
    byId: Record<string, SnapshotCardDetails>;
  } | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [readyLoading, setReadyLoading] = useState(false);
  const [adminEntertainmentLoading, setAdminEntertainmentLoading] = useState(false);
  const [rematchLoading, setRematchLoading] = useState(false);
  const [rewardsSyncStatus, setRewardsSyncStatus] = useState<'syncing' | 'synced' | 'unavailable'>('syncing');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const [challengerReady, setChallengerReady] = useState(false);
  const [challengedReady, setChallengedReady] = useState(false);
  const [fade, setFade] = useState(false);
  const matchHistory = useGame(s => s.matchHistory);

  // refs so async callbacks / timers / realtime handlers never read stale state
  const officialResultAppliedRef = useRef(false);
  const startedRef = useRef(false);
  const loadingSquadsRef = useRef(false);
  const recordedRef = useRef(false);
  const rewardSyncStartedRef = useRef(false);
  const snapshotCardDetailsKeyRef = useRef<string | null>(null);
  const finishingPlaybackRef = useRef(false);
  const cancelledByMeRef = useRef(false);
  const startMatchRef = useRef<() => void>(() => {});
  const squad = squads[sport];
  const mySaved = savedSquads.filter(s => s.sport === sport);
  const selectedSavedSquad = mySaved.find(saved => saved.id === selectedSquadId);
  const lineupFormation = selectedSavedSquad?.formation ?? squad.formation;
  const lineupPositions = FORMATIONS_FUTSAL[lineupFormation] ?? FORMATIONS_FUTSAL['1-2-1'];
  const lineupBase: Squad = selectedSavedSquad
    ? {
      sport: 'futsal',
      formation: lineupFormation,
      starters: lineupPositions.map((position, index) => ({
        position: position as Position,
        uid: selectedSavedSquad.starters[index] ?? null,
      })),
      bench: [...selectedSavedSquad.bench],
    }
    : squad;
  const lineupKey = selectedSquadId ?? '__active__';
  const [lineupDraft, setLineupDraft] = useState<{ key: string; lineup: Squad } | null>(null);
  const matchLineup = lineupDraft?.key === lineupKey ? lineupDraft.lineup : lineupBase;
  const updateMatchLineup = (lineup: Squad) => setLineupDraft({ key: lineupKey, lineup });

  const showMatchNotice = useCallback((notice: 'Intervalo' | 'Fim de jogo', key: string, duration: number) => {
    if (lastNoticeKeyRef.current === key) return;
    lastNoticeKeyRef.current = key;
    setMatchNotice(notice);
    if (noticeTimeoutRef.current !== null) window.clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = window.setTimeout(() => {
      setMatchNotice(null);
      noticeTimeoutRef.current = null;
    }, duration);
  }, []);

  const finishMatchPlayback = useCallback(() => {
    if (finishedPlaybackHandledRef.current) return;
    finishedPlaybackHandledRef.current = true;
    showMatchNotice('Fim de jogo', `${challengeId ?? 'solo'}:fulltime`, 1800);
    if (finishTimeoutRef.current !== null) window.clearTimeout(finishTimeoutRef.current);
    finishTimeoutRef.current = window.setTimeout(() => {
      setStep('result');
      finishTimeoutRef.current = null;
    }, 1800);
  }, [challengeId, showMatchNotice]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = (event: MediaQueryListEvent | MediaQueryList) => setReduceMotion(event.matches);
    setReduceMotion(mediaQuery.matches);
    mediaQuery.addEventListener('change', updateMotionPreference);
    return () => mediaQuery.removeEventListener('change', updateMotionPreference);
  }, []);

  useEffect(() => () => {
    if (goalTimeoutRef.current !== null) window.clearTimeout(goalTimeoutRef.current);
    if (noticeTimeoutRef.current !== null) window.clearTimeout(noticeTimeoutRef.current);
    if (finishTimeoutRef.current !== null) window.clearTimeout(finishTimeoutRef.current);
  }, []);

  const buildHomePlayers = (): { players: MatchPlayer[]; formation: string; cards: typeof cards } | null => {
    const formation = matchLineup.formation;
    const starterUids = matchLineup.starters.map(slot => slot.uid);
    const starterCards = starterUids
      .map(uid => uid ? cards.find(card => card.uid === uid) : null)
      .filter((card): card is (typeof cards)[number] => !!card);
    if (starterCards.length < 5) return null;
    const players = createPlayersFromCards(starterCards, 'home', formation, sport);
    return { players, formation, cards: starterCards };
  };

  const homeInfo = buildHomePlayers();
  const isChallengedPlayer = !!challengeId && !!challenge && currentUserId === challenge.challenged_id;
  const myMatchSide: 'home' | 'away' = isChallengedPlayer ? 'away' : 'home';

  const receivePlaybackState = (state: MatchPlaybackState) => {
    setPlaybackState(current => {
      if (
        current?.status === state.status
        && current.currentFrame === state.currentFrame
        && current.speed === state.speed
        && current.startedAt === state.startedAt
        && current.pausedAt === state.pausedAt
        && current.serverNow === state.serverNow
      ) return current;
      return { ...state, receivedAt: Date.now() };
    });
  };

  // Loads both squads of the challenge from the edge function (service role, so it can
  // read the opponent's cards). Never falls back to AI: on failure it exposes challengeError.
  const loadChallengeSquads = async (): Promise<boolean> => {
    if (!challengeId || !supabase || loadingSquadsRef.current) return false;
    loadingSquadsRef.current = true;
    setChallengeError(null);
    try {
      const data = await challengesService.getChallengeData(challengeId);
      const home = data.home;
      const away = data.away;
      if (!Array.isArray(home?.cards) || home.cards.length < MIN_STARTERS) {
        throw new Error('O elenco do desafiante está incompleto (mínimo de 5 titulares no elenco principal).');
      }
      if (!Array.isArray(away?.cards) || away.cards.length < MIN_STARTERS) {
        throw new Error('O elenco do desafiado está incompleto (mínimo de 5 titulares no elenco principal).');
      }
      const homeFormation = home.formation || '1-2-1';
      const awayFormation = away.formation || '1-2-1';
      setChallengeSquads({
        home: createPlayersFromCards(home.cards, 'home', homeFormation, 'futsal'),
        away: createPlayersFromCards(away.cards, 'away', awayFormation, 'futsal'),
        homeCards: home.cards,
        awayCards: away.cards,
        homeFormation,
        awayFormation,
        homeName: home.name || 'Desafiante',
        awayName: away.name || 'Desafiado',
      });
      return true;
    } catch (error) {
      console.error('get-challenge-data failed', error);
      setChallengeError(error instanceof Error ? error.message : 'Erro ao carregar os elencos do desafio.');
      return false;
    } finally {
      loadingSquadsRef.current = false;
    }
  };

  // Single entry point for every challenges row we receive (initial fetch, realtime, polling).
  const applyChallengeRow = (row: any, landOnCompleted: 'prematch' | 'result' = 'prematch') => {
    if (!row) return;
    setChallenge(row);
    setChallengerReady(!!row.challenger_ready);
    setChallengedReady(!!row.challenged_ready);
    if (row.challenger_ready && currentUserIdRef.current === row.challenger_id) {
      setChallengeTactic(row.challenger_tactic || 'balanced');
    } else if (row.challenged_ready && currentUserIdRef.current === row.challenged_id) {
      setChallengeTactic(row.challenged_tactic || 'balanced');
    }
    if (row.home_snapshot?.cards && row.away_snapshot?.cards) {
      const homeSnapshot = row.home_snapshot;
      const awaySnapshot = row.away_snapshot;
      setChallengeSquads({
        home: createPlayersFromCards(homeSnapshot.cards, 'home', homeSnapshot.formation, 'futsal'),
        away: createPlayersFromCards(awaySnapshot.cards, 'away', awaySnapshot.formation, 'futsal'),
        homeCards: homeSnapshot.cards,
        awayCards: awaySnapshot.cards,
        homeFormation: homeSnapshot.formation,
        awayFormation: awaySnapshot.formation,
        homeName: homeSnapshot.name,
        awayName: awaySnapshot.name,
      });
    } else if (row.home_snapshot?.cards || row.away_snapshot?.cards) {
      setChallengeSquads(current => {
        if (!current) return current;
        const homeSnapshot = row.home_snapshot;
        const awaySnapshot = row.away_snapshot;
        return {
          ...current,
          ...(homeSnapshot?.cards ? {
            home: createPlayersFromCards(homeSnapshot.cards, 'home', homeSnapshot.formation, 'futsal'),
            homeCards: homeSnapshot.cards,
            homeFormation: homeSnapshot.formation,
            homeName: homeSnapshot.name,
          } : {}),
          ...(awaySnapshot?.cards ? {
            away: createPlayersFromCards(awaySnapshot.cards, 'away', awaySnapshot.formation, 'futsal'),
            awayCards: awaySnapshot.cards,
            awayFormation: awaySnapshot.formation,
            awayName: awaySnapshot.name,
          } : {}),
        };
      });
    }
    if (row.playback_state) {
      const state = row.playback_state as MatchPlaybackState;
      receivePlaybackState(state);
      if (state.status === 'paused') setFrameIndex(state.currentFrame);
    }
    if (row.status === 'completed' && row.result && !officialResultAppliedRef.current) {
      const official = row.result as MatchResult;
      officialResultAppliedRef.current = true;
      setResult(official);
      setResultConfirmed(true);
      const playback = row.playback_state as MatchPlaybackState | undefined;
      setFrameIndex(playback?.currentFrame ?? 0);
      setStep(
        playback?.status === 'playing' || playback?.status === 'paused'
          ? 'play'
          : playback?.status === 'finished'
            ? 'result'
            : landOnCompleted,
      );
    }
    if (row.status === 'completed' && officialResultAppliedRef.current && row.playback_state) {
      const state = row.playback_state as MatchPlaybackState;
      if (state.status === 'playing' || state.status === 'paused') setStep('play');
      if (state.status === 'finished') setStep('result');
    }
    if (row.status === 'rejected') {
      if (!cancelledByMeRef.current) toast.error('Desafio recusado ou cancelado.');
      navigate(cancelledByMeRef.current ? '/friends' : '/');
    }
  };

  const startMatch = async () => {
    // ---------- PvP (challenge): ALWAYS uses both real squads, never the AI fallback ----------
    if (challengeId) {
      if (startedRef.current) return;
      if (!challengeSquads) { toast.error('Os elencos do desafio ainda não foram carregados.'); return; }
      if (challenge?.seed == null) { toast.error('Desafio sem seed definida. Recarregue a página.'); return; }
      startedRef.current = true;
      finishedPlaybackHandledRef.current = false;
      frameIndexRef.current = 0;
      lastGoalKeyRef.current = null;
      lastNoticeKeyRef.current = null;
      setGoalAnnouncement(null);
      setMatchNotice(null);
      setStartError(null);
      try {
        let official: MatchResult | null = null;
        for (let attempt = 0; attempt < 30 && !official; attempt++) {
          const response = await challengesService.simulateChallenge(challengeId);
          official = response.result as MatchResult | null;
          if (!official && response.pending) {
            await new Promise(resolve => window.setTimeout(resolve, 1000));
          }
        }
        if (!official?.frames?.length) {
          const latest = await challengesService.getChallenge(challengeId);
          if (latest?.status === 'completed' && latest.result?.frames?.length) {
            official = latest.result as MatchResult;
            applyChallengeRow(latest);
          } else {
            throw new Error('O servidor ainda não confirmou o resultado. Tente novamente.');
          }
        }
        officialResultAppliedRef.current = true;
        setResult(official);
        setResultConfirmed(true);
        setFrameIndex(0);
        setStep('prematch');
        const latest = await challengesService.getChallenge(challengeId);
        if (latest?.status === 'completed') applyChallengeRow(latest);
      } catch (e) {
        console.error('startMatch failed', e);
        let recovered = false;
        try {
          const ch = await challengesService.getChallenge(challengeId);
          if (ch?.status === 'completed' && ch.result?.frames?.length) {
            applyChallengeRow(ch);
            recovered = true;
          }
        } catch (recoveryError) {
          console.error('challenge result recovery failed', recoveryError);
        }
        if (!recovered) {
          startedRef.current = false;
          setStartError(e instanceof Error ? e.message : 'Não foi possível sincronizar a partida. Verifique a conexão e tente de novo.');
        }
      }
      return;
    }

    // ---------- friend (opponent) / AI ----------
    setResultConfirmed(false);
    if (!homeInfo) { toast.error('Escalação incompleta.'); return; }
    if (opponentId && supabase) {
      const { data: teamCards, error } = await supabase
        .from('cards')
        .select('pack_group')
        .in('id', homeInfo.cards.map(card => card.uid));
      if (error) { toast.error('Não foi possível validar seu elenco para o X1: ' + error.message); return; }
      if (teamCards?.some(card => card.pack_group === 'off_sale')) {
        toast.error(OFF_SALE_PVP_MESSAGE);
        return;
      }
    }
    if (opponentId && (!opponentPlayers || opponentPlayersOwner !== opponentId)) {
      toast.error('Não foi possível carregar o elenco do amigo (ele precisa ter 5 titulares salvos).');
      return;
    }
    const seed = Date.now();
    let awayPlayers: MatchPlayer[];
    let awayFormation: string;
    let awayName: string;
    const homePlayers = homeInfo.players;
    const homeFormation = homeInfo.formation;
    const homeName = 'Futsenai FC';
    if (opponentId && opponentPlayers && opponentPlayersOwner === opponentId) {
      awayPlayers = opponentPlayers;
      awayFormation = opponentFormation;
      awayName = opponentName;
    } else {
      awayPlayers = makeAwayTeam('futsal', difficulty, seed + 1);
      awayFormation = '1-2-1';
      awayName = `IA (${difficulty})`;
    }
    const res = simulateMatch({
      sport: 'futsal',
      homeName,
      awayName,
      homePlayers,
      awayPlayers,
      homeFormation,
      awayFormation,
      homeTactic,
      awayTactic: 'balanced',
      awayDifficulty: difficulty,
      seed,
      minutes: MATCH_DURATION_MINUTES,
    });
    recordedRef.current = false;
    finishedPlaybackHandledRef.current = false;
    frameIndexRef.current = 0;
    lastGoalKeyRef.current = null;
    lastNoticeKeyRef.current = null;
    setGoalAnnouncement(null);
    setMatchNotice(null);
    setResult(res);
    setFrameIndex(0);
    setStep('prematch');
  };
  startMatchRef.current = startMatch;

  const recordMatchResult = (matchResult: MatchResult) => {
    if (recordedRef.current) return;
    recordedRef.current = true;
    // challenge already recorded (page revisited / other tab): do not duplicate history or XP
    if (challengeId && matchHistory.some(m => m.challengeId === challengeId)) return;
    // in PvP the challenged user plays as AWAY: credit their own cards and see the score from their side
    const mySide: 'home' | 'away' = challengeId && challenge && currentUserId === challenge.challenged_id ? 'away' : 'home';
    const myScore = mySide === 'home' ? matchResult.homeScore : matchResult.awayScore;
    const oppScore = mySide === 'home' ? matchResult.awayScore : matchResult.homeScore;
    const oppName = mySide === 'home' ? matchResult.config.awayName : matchResult.config.homeName;
    const historyEntry = { id: nanoid(), date: Date.now(), sport, homeScore: myScore, awayScore: oppScore, opponent: oppName, challengeId: challengeId ?? undefined };
    if (challengeId) addLocalMatchHistory(historyEntry);
    else addMatchHistory(historyEntry);
    if (!challengeId) {
      matchResult.config.homePlayers.forEach(p => {
        const ps = matchResult.playerStats[p.id];
        addPlayerXp(p.id.replace(/_home$/, ''), 50 + (matchResult.homeScore > matchResult.awayScore ? 30 : 0));
        recordMatchStats(p.id.replace(/_home$/, ''), ps?.goals ?? 0, ps?.assists ?? 0);
      });
    }
  };

  const startPlay = async () => {
    if (audioEnabled) unlockSound();
    if (challengeId && resultConfirmed) {
      try {
        if (challenge?.admin_entertainment && playbackState?.status === 'waiting' && playbackState.speed !== 4) {
          const acceleratedState = await challengesService.updateChallengePlayback(challengeId, 'speed', 4);
          receivePlaybackState(acceleratedState);
        }
        const state = await challengesService.updateChallengePlayback(challengeId, 'play');
        receivePlaybackState(state);
        setFrameIndex(state.currentFrame);
        if (state.status === 'playing') setStep('play');
        if (state.status === 'finished') setStep('result');
      } catch (error) {
        console.error('challenge playback start failed', error);
        toast.error('Não foi possível iniciar o relógio compartilhado.');
      }
      return;
    }
    if (!challengeId && result) recordMatchResult(result);
    setStep('play');
    setPlaying(true);
  };

  const controlPlayback = (action: 'play' | 'pause' | 'speed', nextSpeed?: 1 | 2 | 4) => {
    if (challengeId && resultConfirmed) {
      void challengesService.updateChallengePlayback(challengeId, action, nextSpeed)
        .then(state => {
          receivePlaybackState(state);
          if (state.status === 'paused' || action === 'speed') setFrameIndex(state.currentFrame);
          if (state.status === 'playing') setStep('play');
          if (state.status === 'finished') setStep('result');
        })
        .catch(error => {
          console.error('challenge playback update failed', error);
          toast.error('Não foi possível sincronizar o controle da partida.');
        });
      return;
    }
    if (action === 'play') { setStep('play'); setPlaying(true); }
    if (action === 'pause') setPlaying(value => !value);
    if (action === 'speed' && nextSpeed) setSpeed(nextSpeed);
  };

  const startPvpRematch = async () => {
    if (!challenge || !currentUserId || !challengeId || rematchLoading) return;
    const opponentId = currentUserId === challenge.challenger_id
      ? challenge.challenged_id
      : currentUserId === challenge.challenged_id
        ? challenge.challenger_id
        : null;
    if (!opponentId) {
      toast.error('Não foi possível identificar o adversário desta partida.');
      return;
    }

    setRematchLoading(true);
    try {
      const newChallenge = await challengesService.createChallenge(currentUserId, opponentId);
      if (!newChallenge) {
        toast.info('Já existe um desafio ativo entre vocês.');
        return;
      }
      navigate(`/match?challenge=${newChallenge.id}`);
    } catch (error) {
      console.error('PvP rematch creation failed', error);
      toast.error('Não foi possível criar a revanche. Confirme se vocês ainda são amigos.');
    } finally {
      setRematchLoading(false);
    }
  };

  // opponent fetch
  useEffect(() => {
    if (!opponentId || !supabase) return;
    let cancelled = false;
    setOpponentPlayers(null);
    setOpponentPlayersOwner(null);
    setOpponentOverall(null);
    setOpponentError(null);
    setLoadingOpp(true);
    (async () => {
      try {
        const { data: prof } = await supabase.from('profiles').select('name').eq('id', opponentId).single();
        if (cancelled) return;
        setOpponentName(prof?.name || 'Amigo');
        const { data: sqs } = await supabase.from('squads').select('*').eq('user_id', opponentId);
        if (cancelled) return;
        const sq = (sqs && sqs.length > 0) ? (sqs.find((s: any) => s.is_primary) || sqs[0]) : null;
        const formation = sq?.formation || '1-2-1';
        setOpponentFormation(formation);
        const starterUids: (string | null)[] = Array.isArray(sq?.starters) ? sq.starters : [];
        const starterCardIds = [...new Set(starterUids.filter((uid): uid is string => !!uid))];
        let cs: any[] = [];
        if (starterCardIds.length > 0) {
          const { data, error: cardsError } = await supabase
            .from('cards')
            .select('id,name,position,overall,pace,shooting,passing,dribbling,defending,physical,reflexes,positioning,handling,pack_group')
            .in('id', starterCardIds)
            .eq('user_id', opponentId);
          if (cardsError) throw cardsError;
          cs = data || [];
        }
        if (cancelled) return;
        const cardMap = new Map(cs.map((c: any) => [c.id, c]));
        const starterCards = starterUids.map(uid => uid ? cardMap.get(uid) : null).filter((c: any) => c && c.position) as any[];
        if (starterCards.some(card => card.pack_group === 'off_sale')) {
          setOpponentError(OFF_SALE_PVP_MESSAGE);
          return;
        }
        if (starterCards.length >= 5) {
          const ratings = starterCards.map((card: any) => Number(card.overall));
          if (ratings.every((rating: number) => Number.isFinite(rating))) {
            setOpponentOverall(Math.round(ratings.reduce((sum: number, rating: number) => sum + rating, 0) / ratings.length));
          }
          const mapped = starterCards.map((c: any) => ({
            uid: c.id, name: c.name, position: c.position, overall: c.overall,
            pace: c.pace, shooting: c.shooting, passing: c.passing, dribbling: c.dribbling, defending: c.defending, physical: c.physical,
            reflexes: c.reflexes, positioning: c.positioning, handling: c.handling,
          }));
          const players = createPlayersFromCards(mapped, 'away', formation, 'futsal');
          setOpponentPlayers(players);
          setOpponentPlayersOwner(opponentId);
        }
      } catch (e) {
        if (!cancelled) {
          console.error('opponent fetch failed', e);
          setOpponentError('Não foi possível carregar o elenco do amigo.');
        }
      } finally {
        if (!cancelled) setLoadingOpp(false);
      }
    })();
    return () => { cancelled = true; };
  }, [opponentId]);

  // challenge fetch (initial): session + challenge row. Squads are loaded by the effect below.
  useEffect(() => {
    if (!challengeId || !supabase) { setChallengeLoading(false); return; }
    let cancelled = false;
    setChallengeLoading(true);
    (async () => {
      try {
        const { data } = await supabase!.auth.getSession();
        if (cancelled) return;
        const userId = data.session?.user?.id ?? null;
        currentUserIdRef.current = userId;
        setCurrentUserId(userId);
        const ch = await challengesService.getChallenge(challengeId);
        if (cancelled) return;
        if (ch) applyChallengeRow(ch, 'prematch');
      } catch (e) {
        console.error('challenge fetch failed', e);
      } finally {
        if (!cancelled) setChallengeLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeId]);

  // load both squads as soon as the challenge is accepted (covers: page load, accept click, realtime, polling)
  useEffect(() => {
    if (!challengeId || challenge?.status !== 'accepted') return;
    if (challengeSquads || challengeError || result) return;
    loadChallengeSquads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeId, challenge?.status, challengeSquads, challengeError, result]);

  const snapshotCardIds = [
    ...(Array.isArray(challenge?.home_snapshot?.cards) ? challenge.home_snapshot.cards : []).map((card: { uid: string }) => card.uid),
    ...(Array.isArray(challenge?.away_snapshot?.cards) ? challenge.away_snapshot.cards : []).map((card: { uid: string }) => card.uid),
  ].sort();
  const snapshotCardDetailsKey = challengeId
    && challenge?.status === 'completed'
    && snapshotCardIds.length > 0
    ? `${challengeId}:${snapshotCardIds.join(',')}`
    : '';

  useEffect(() => {
    if (!challengeId || !snapshotCardDetailsKey || !supabase || snapshotCardDetailsKeyRef.current === snapshotCardDetailsKey) return;
    snapshotCardDetailsKeyRef.current = snapshotCardDetailsKey;
    let cancelled = false;
    void challengesService.getChallengeData(challengeId)
      .then(data => {
        if (!cancelled) {
          setOfficialSnapshotCardDetails({
            key: snapshotCardDetailsKey,
            byId: data.cardDetailsById ?? {},
          });
        }
      })
      .catch(error => {
        if (!cancelled) console.error('challenge snapshot card details failed', error);
      });
    return () => { cancelled = true; };
  }, [challengeId, snapshotCardDetailsKey]);

  // fallback polling in case realtime is not enabled for the table
  useEffect(() => {
    if (!challengeId || !supabase) return;
    const st = challenge?.status;
    const playbackFinished = (playbackState?.status === 'finished');
    if ((st !== 'pending' && st !== 'accepted' && st !== 'completed') || (st === 'completed' && playbackFinished)) return;
    let active = true;
    const pollChallenge = async () => {
      if (!active || document.visibilityState === 'hidden') return;
      try {
        const ch = await challengesService.getChallenge(challengeId);
        if (active && ch) applyChallengeRow(ch);
      } catch (e) {
        console.error('polling failed', e);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') void pollChallenge();
    };
    const t = window.setInterval(() => void pollChallenge(), 4000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeId, challenge?.status, playbackState?.status, result]);

  // auto start once BOTH are ready AND both squads are loaded (never from render, never stale)
  const bothReady = challengerReady && challengedReady;
  useEffect(() => {
    if (!challengeId || challenge?.status !== 'accepted') return;
    if (!bothReady || !challengeSquads || result || step !== 'setup' || startedRef.current || startError) return;
    setFade(true);
    const t = setTimeout(() => { setFade(false); startMatchRef.current(); }, 1500);
    return () => { clearTimeout(t); setFade(false); };
  }, [challengeId, challenge?.status, bothReady, challengeSquads, result, step, startError]);

  useEffect(() => {
    if (challengeId || step !== 'play' || !result) return;
    if (!playing) { cancelAnimationFrame(rafRef.current); return; }
    lastTimeRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      const framesPerSec = speed * 2 * (goalAnnouncement ? 0.65 : 1);
      const next = frameIndexRef.current + dt * framesPerSec;
      if (next >= result.frames.length) {
        frameIndexRef.current = result.frames.length - 1;
        setFrameIndex(result.frames.length - 1);
        setPlaying(false);
        finishMatchPlayback();
        return;
      }
      frameIndexRef.current = next;
      setFrameIndex(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [challengeId, step, playing, speed, result, goalAnnouncement, finishMatchPlayback]);

  useEffect(() => {
    if (!challengeId || !resultConfirmed || !result || !playbackState) return;
    if (playbackState.status === 'finished') {
      if (finishedPlaybackHandledRef.current) return;
      setFrameIndex(result.frames.length - 1);
      frameIndexRef.current = result.frames.length - 1;
      finishMatchPlayback();
      return;
    }
    if (playbackState.status !== 'playing' || !playbackState.startedAt) return;

    setStep('play');
    finishingPlaybackRef.current = false;
    const startedAt = Date.parse(playbackState.startedAt);
    const serverOffset = playbackState.serverNow && playbackState.receivedAt
      ? Date.parse(playbackState.serverNow) - playbackState.receivedAt
      : 0;
    let retryTimer: number | undefined;
    const tick = () => {
      const frame = playbackState.currentFrame
        + Math.max(0, Date.now() + serverOffset - startedAt) / 1000 * 2 * playbackState.speed;
      if (frame >= result.frames.length - 1) {
        setFrameIndex(result.frames.length - 1);
        if (!finishingPlaybackRef.current) {
          finishingPlaybackRef.current = true;
          void challengesService.updateChallengePlayback(challengeId, 'finish')
            .then(setPlaybackState)
            .catch(error => {
              finishingPlaybackRef.current = false;
              console.error('challenge playback finish failed', error);
              retryTimer = window.setTimeout(() => {
                rafRef.current = requestAnimationFrame(tick);
              }, 2000);
            });
        }
        return;
      }
      setFrameIndex(frame);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [challengeId, resultConfirmed, result, playbackState, finishMatchPlayback]);

  useEffect(() => {
    if (!challengeId || challenge?.admin_entertainment || step !== 'result' || !resultConfirmed || !currentUserId || rewardSyncStartedRef.current) return;
    rewardSyncStartedRef.current = true;
    setRewardsSyncStatus('syncing');
    void syncUserData(currentUserId).then(
      () => setRewardsSyncStatus('synced'),
      error => {
        setRewardsSyncStatus('unavailable');
        console.error('challenge reward refresh failed', error);
      },
    );
  }, [challengeId, challenge?.admin_entertainment, currentUserId, resultConfirmed, step, syncUserData]);

  useEffect(() => {
    if (step !== 'result' || !result || recordedRef.current) return;
    recordMatchResult(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, result]);

  // realtime challenge updates
  useEffect(() => {
    if (!challengeId || !supabase) return;
    const channel = supabase.channel(`match-challenge-${challengeId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'challenges', filter: `id=eq.${challengeId}` }, (payload: any) => {
        if (payload.new) applyChallengeRow(payload.new);
      })
      .subscribe();
    return () => { if (supabase) supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeId]);

  const toSvgY = (v: number) => (v / 100) * 50;
  const currentFrame = result ? result.frames[Math.min(Math.floor(frameIndex), result.frames.length - 1)] : null;
  const displayFrame = (() => {
    if (!result || !currentFrame || reduceMotion) return currentFrame;
    const fromIndex = Math.max(0, Math.min(Math.floor(frameIndex), result.frames.length - 1));
    const toFrame = result.frames[Math.min(fromIndex + 1, result.frames.length - 1)];
    const goalAtCurrentFrame = currentFrame.lastEvent?.type === 'goal'
      && currentFrame.lastEvent.minute === currentFrame.minute;
    const progress = goalAtCurrentFrame
      ? 0
      : Math.max(0, Math.min(1, frameIndex - fromIndex));
    const interpolate = (from: number, to: number) => from + (to - from) * progress;
    return {
      ...currentFrame,
      ball: {
        ...currentFrame.ball,
        x: interpolate(currentFrame.ball.x, toFrame.ball.x),
        y: interpolate(currentFrame.ball.y, toFrame.ball.y),
      },
      players: currentFrame.players.map(player => {
        const nextPlayer = toFrame.players.find(candidate => candidate.id === player.id);
        return nextPlayer
          ? {
            ...player,
            x: interpolate(player.x, nextPlayer.x),
            y: interpolate(player.y, nextPlayer.y),
          }
          : player;
      }),
    };
  })();

  useEffect(() => {
    frameIndexRef.current = frameIndex;
  }, [frameIndex]);

  useEffect(() => {
    if (step !== 'play' || currentFrame?.lastEvent?.type !== 'halftime') return;
    showMatchNotice('Intervalo', `${challengeId ?? 'solo'}:${currentFrame.lastEvent.minute}:halftime`, 2200);
  }, [step, challengeId, currentFrame?.lastEvent, showMatchNotice]);

  useEffect(() => {
    const event = currentFrame?.lastEvent;
    if (step !== 'play' || event?.type !== 'goal') return;
    const key = `${event.minute}:${event.team}:${event.playerId ?? ''}`;
    if (lastGoalKeyRef.current === key) return;
    lastGoalKeyRef.current = key;
    setGoalAnnouncement(event);
    if (goalTimeoutRef.current !== null) window.clearTimeout(goalTimeoutRef.current);
    goalTimeoutRef.current = window.setTimeout(() => {
      setGoalAnnouncement(null);
      goalTimeoutRef.current = null;
    }, 2000);
    if (audioEnabled) {
      playTone(720, 0.14, 'triangle', 0.09);
      window.setTimeout(() => playTone(980, 0.2, 'sine', 0.08), 110);
    }
    if (!reduceMotion && typeof navigator.vibrate === 'function') navigator.vibrate([65, 35, 65]);
  }, [step, currentFrame?.lastEvent, audioEnabled, reduceMotion]);

  if (challengeLoading || loadingOpp) return <div className="p-8 text-[var(--muted)]">Carregando...</div>;

  if (challengeId && challenge && challenge.status === 'pending') {
    const isChallenger = currentUserId === challenge.challenger_id;
    if (isChallenger) {
      return (
        <div className="p-4 md:p-8 space-y-4">
          <h1 className="text-2xl font-semibold text-[var(--text)]">Desafio enviado</h1>
          <div className="card-surface p-4 text-sm text-[var(--muted)]">Aguardando o adversário aceitar...</div>
          <button
            onClick={async () => {
              const ok = await challengesService.rejectChallenge(challengeId);
              if (!ok) {
                toast.error('Não foi possível cancelar o desafio.');
                return;
              }
              cancelledByMeRef.current = true;
              navigate('/friends');
            }}
            className="px-4 py-2 rounded-xl bg-white border border-[var(--border)] text-sm font-medium"
          >
            Cancelar desafio
          </button>
        </div>
      );
    }
    return (
      <div className="p-4 md:p-8 space-y-4">
        <h1 className="text-2xl font-semibold text-[var(--text)]">Desafio PvP</h1>
        <div className="card-surface p-4 space-y-3">
          <div className="text-sm text-[var(--text)]">Você foi desafiado!</div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                const ok = await challengesService.acceptChallenge(challengeId);
                const ch = await challengesService.getChallenge(challengeId);
                if (!ok && ch?.status !== 'accepted') toast.error('Não foi possível aceitar o desafio.');
                if (ch) applyChallengeRow(ch);
              }}
              className="px-4 py-2 rounded-xl bg-[var(--red)] text-white text-sm font-medium"
            >Aceitar</button>
            <button
              onClick={async () => {
                const ok = await challengesService.rejectChallenge(challengeId);
                if (!ok) {
                  toast.error('Não foi possível recusar o desafio.');
                  return;
                }
                navigate('/');
              }}
              className="px-4 py-2 rounded-xl bg-white border border-[var(--border)] text-sm font-medium"
            >
              Recusar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (challengeId && challenge && challenge.status === 'accepted' && !result && step === 'setup') {
    const isChallenger = currentUserId === challenge.challenger_id;
    const isAdminParticipant = currentUserId === ADMIN_USER_ID
      && (challenge.challenger_id === ADMIN_USER_ID || challenge.challenged_id === ADMIN_USER_ID);
    const canToggleAdminEntertainment = isAdminParticipant && !challengerReady && !challengedReady;
    const myReady = isChallenger ? challengerReady : challengedReady;
    const oppReady = isChallenger ? challengedReady : challengerReady;
    const homeAverage = challengeSquads
      ? challengeSquads.homeCards.length
        ? Math.round(challengeSquads.homeCards.reduce((sum, player) => sum + Number(player.overall ?? 0), 0) / challengeSquads.homeCards.length)
        : null
      : null;
    const awayAverage = challengeSquads
      ? challengeSquads.awayCards.length
        ? Math.round(challengeSquads.awayCards.reduce((sum, player) => sum + Number(player.overall ?? 0), 0) / challengeSquads.awayCards.length)
        : null
      : null;
    const ownTeamName = challengeSquads
      ? isChallenger ? challengeSquads.homeName : challengeSquads.awayName
      : 'SEU TIME';
    const opposingTeamName = challengeSquads
      ? isChallenger ? challengeSquads.awayName : challengeSquads.homeName
      : 'ADVERSÁRIO';
    const ownFormation = challengeSquads
      ? isChallenger ? challengeSquads.homeFormation : challengeSquads.awayFormation
      : '1-2-1';
    const ownSnapshotCards = challengeSquads
      ? isChallenger ? challengeSquads.homeCards : challengeSquads.awayCards
      : [];
    const opposingSnapshotCards = challengeSquads
      ? isChallenger ? challengeSquads.awayCards : challengeSquads.homeCards
      : [];
    const toPreparationCards = (players: any[]) => {
      const goalkeeper = players.find(player => player.position === 'GK');
      const orderedPlayers = goalkeeper
        ? [goalkeeper, ...players.filter(player => player !== goalkeeper)]
        : players;
      return orderedPlayers.map(player => ({
        uid: player.uid,
        name: player.name,
        position: player.position as Position,
        overall: Number(player.overall),
      }));
    };
    const ownCards = toPreparationCards(ownSnapshotCards);
    const opposingCards = toPreparationCards(opposingSnapshotCards);
    const ownPositions = FORMATIONS_FUTSAL[ownFormation]
      ?? (ownCards.length === MIN_STARTERS ? ownCards.map(card => card.position) : FORMATIONS_FUTSAL['1-2-1']);
    const challengerTactic = TACTIC_LABEL[challenge?.challenger_tactic as Tactic] ?? TACTIC_LABEL.balanced;
    const challengedTactic = TACTIC_LABEL[challenge?.challenged_tactic as Tactic] ?? TACTIC_LABEL.balanced;
    const challengeLineup: Squad = {
      sport: 'futsal',
      formation: ownFormation,
      starters: ownPositions.map((position, index) => ({
        position: position as Position,
        uid: ownCards[index]?.uid ?? null,
      })),
      bench: [],
    };
    return (
      <>
        {fade && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 text-2xl font-bold text-white">Preparando partida...</div>}
        {challenge.admin_entertainment && isAdminParticipant && (
          <div role="status" className="mx-auto mt-4 w-[calc(100%-2rem)] max-w-5xl rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="font-bold">Modo goleada · entretenimento</div>
            <p className="mt-1">A partida terá entre 15 e 60 gols sorteados para você, contra 0 do adversário, e será exibida em 4x. Não haverá alterações de Elo, XP ou estatísticas para nenhum jogador. Esta informação só aparece para você.</p>
          </div>
        )}
        {isAdminParticipant && (
          <section className="mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-5xl flex-col gap-3 rounded-xl border border-[var(--border)] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-[var(--text)]">Modo goleada · entretenimento</h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--muted)]">
                Sorteia entre 15 e 60 gols para você e acelera a simulação para 4x. A partida não altera Elo, XP nem estatísticas de nenhum jogador. Esta configuração é visível apenas para você.
              </p>
              {!canToggleAdminEntertainment && !challengerReady && !challengedReady && challenge.wager_type && (
                <p className="mt-1 text-xs font-medium text-amber-700">O modo de entretenimento não está disponível em partidas com aposta.</p>
              )}
              {(challengerReady || challengedReady) && (
                <p className="mt-1 text-xs text-[var(--muted)]">A configuração fica bloqueada depois que qualquer jogador confirmar presença.</p>
              )}
            </div>
            <label className="inline-flex shrink-0 cursor-pointer items-center gap-3 self-start rounded-lg border border-[var(--border)] px-3 py-2 sm:self-center">
              <span className="text-xs font-semibold text-[var(--text)]">{challenge.admin_entertainment ? 'Ativado' : 'Desativado'}</span>
              <input
                type="checkbox"
                role="switch"
                aria-label="Modo goleada de entretenimento"
                checked={!!challenge.admin_entertainment}
                disabled={!canToggleAdminEntertainment || adminEntertainmentLoading}
                onChange={async event => {
                  if (!challengeId || adminEntertainmentLoading) return;
                  setAdminEntertainmentLoading(true);
                  try {
                    const updated = await challengesService.setAdminEntertainment(challengeId, event.target.checked);
                    if (!updated) {
                      toast.error('Ative ou desative o modo antes que qualquer jogador confirme presença.');
                      return;
                    }
                    const latestChallenge = await challengesService.getChallenge(challengeId);
                    if (latestChallenge) applyChallengeRow(latestChallenge);
                  } catch (error) {
                    console.error('admin entertainment mode update failed', error);
                    toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar o modo de entretenimento.');
                  } finally {
                    setAdminEntertainmentLoading(false);
                  }
                }}
                className="h-5 w-9 cursor-pointer accent-[var(--red)] disabled:cursor-not-allowed"
              />
            </label>
          </section>
        )}
        <MatchPreparation
          title="Pré-jogo PvP"
          lineup={challengeLineup}
          cards={ownCards}
          savedSquads={[]}
          selectedSquadId={null}
          onSelectSquad={() => {}}
          onLineupChange={() => {}}
          difficulty={difficulty}
          onDifficultyChange={setDifficulty}
          tactic={challengeTactic}
          onTacticChange={setChallengeTactic}
          homeOverall={isChallenger ? homeAverage : awayAverage}
          homeTeamName={ownTeamName}
          opponentName={opposingTeamName}
          opponentOverall={isChallenger ? awayAverage : homeAverage}
          showDifficulty={false}
          canStart={!!challengeSquads && !myReady && !readyLoading}
          opponentError={[challengeError, startError].filter(Boolean).join(' · ') || null}
          errorAction={challengeError
            ? { label: 'Tentar novamente', onClick: () => setChallengeError(null) }
            : startError
              ? { label: 'Tentar novamente', onClick: () => setStartError(null) }
              : undefined}
          editable={false}
          showSquadSelector={false}
          tacticDisabled={myReady}
          actionLabel={readyLoading ? 'Enviando...' : myReady ? 'Aguardando adversário...' : 'Estou pronto'}
          statusMessage={challengeSquads
            ? `Você: ${myReady ? 'Pronto ✓' : 'Aguardando...'} · Adversário: ${oppReady ? 'Pronto ✓' : 'Aguardando...'} · ${challengeSquads.homeName}: ${challengerTactic} · ${challengeSquads.awayName}: ${challengedTactic}`
            : 'Carregando elencos do desafio...'}
          emptyReservesMessage="Reservas não incluídas neste desafio."
          opposingPlayers={opposingCards}
          opposingTeamName={opposingTeamName}
          secondaryAction={{
            label: challengerReady && challengedReady ? 'Partida confirmada' : 'Cancelar desafio',
            disabled: challengerReady && challengedReady,
            onClick: async () => {
              const ok = await challengesService.rejectChallenge(challengeId!);
              if (!ok) {
                toast.error('Não é possível cancelar depois que os dois jogadores confirmaram presença.');
                return;
              }
              cancelledByMeRef.current = true;
              navigate('/friends');
            },
          }}
          onStart={async () => {
            if (!challengeId || readyLoading) return;
            setReadyLoading(true);
            try {
              const ok = await challengesService.setReady(challengeId, challengeTactic);
              if (!ok) toast.error('Não foi possível confirmar. Tente de novo.');
              const ch = await challengesService.getChallenge(challengeId);
              if (ch) applyChallengeRow(ch);
              if (ok) await loadChallengeSquads();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Não foi possível confirmar presença no X1.');
            } finally {
              setReadyLoading(false);
            }
          }}
        />
      </>
    );
  }

  if (step === 'setup') {
    const activeOpponentPlayers = opponentPlayersOwner === opponentId ? opponentPlayers : null;
    if (!challengeId) {
      const homeOverall = homeInfo
        ? Math.round(homeInfo.cards.reduce((sum: number, card: any) => sum + (card.overall ?? 0), 0) / homeInfo.cards.length)
        : null;
      return (
        <MatchPreparation
          lineup={matchLineup}
          cards={cards}
          savedSquads={mySaved}
          selectedSquadId={selectedSquadId}
          onSelectSquad={setSelectedSquadId}
          onLineupChange={updateMatchLineup}
          difficulty={difficulty}
          onDifficultyChange={setDifficulty}
          tactic={homeTactic}
          onTacticChange={setHomeTactic}
          homeOverall={homeOverall}
          opponentName={opponentId ? opponentName : `IA (${difficulty})`}
          opponentOverall={opponentId ? opponentOverall : AI_BASE_OVR[difficulty]}
          showDifficulty={!opponentId}
          canStart={!!homeInfo && (!opponentId || !!activeOpponentPlayers)}
          opponentError={opponentError}
          onStart={startMatch}
        />
      );
    }

    return (
      <div className="p-4 md:p-8 space-y-6">
        <h1 className="text-2xl md:text-3xl font-semibold text-[var(--text)]">Partida simulada{opponentId ? ` vs ${opponentName}` : challengeId ? ' (PvP)' : ''}</h1>
        <div className="card-surface max-w-2xl p-4 space-y-4">
          <div>
            <label className="text-sm text-[var(--muted)]">Escalação</label>
            <select value={selectedSquadId ?? ''} onChange={e => setSelectedSquadId(e.target.value || null)} className="w-full mt-1 bg-white border border-[var(--border)] rounded-xl px-3 py-2 text-sm">
              <option value="">Escalação atual</option>
              {mySaved.map(s => <option key={s.id} value={s.id}>{s.name} ({s.formation})</option>)}
            </select>
            {!homeInfo && !challengeSquads && <div className="text-xs text-red-600 mt-1">Escalação incompleta.</div>}
            {homeInfo && <div className="text-xs text-[var(--muted)] mt-1">Overall médio: {Math.round(homeInfo.cards.reduce((a: number, c: any) => a + (c.overall ?? 0), 0) / homeInfo.cards.length)}</div>}
            {opponentError && <div className="text-xs text-red-600 mt-2">{opponentError}</div>}
          </div>
          <div>
            <label className="text-sm text-[var(--muted)]">Tática</label>
            <select value={homeTactic} onChange={e => setHomeTactic(e.target.value as Tactic)} className="w-full mt-1 bg-white border border-[var(--border)] rounded-xl px-3 py-2 text-sm">
              {TACTICS.map(t => <option key={t} value={t}>{TACTIC_LABEL[t]}</option>)}
            </select>
          </div>
          {!opponentId && !challengeId && (
            <>
              <div>
                <label className="text-sm text-[var(--muted)]">Dificuldade</label>
                <select value={difficulty} onChange={e => setDifficulty(e.target.value as any)} className="w-full mt-1 bg-white border border-[var(--border)] rounded-xl px-3 py-2 text-sm">
                  <option value="easy">Fácil</option>
                  <option value="normal">Normal</option>
                  <option value="hard">Difícil</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-[var(--muted)]">Tática</label>
                <select value={homeTactic} onChange={e => setHomeTactic(e.target.value as Tactic)} className="w-full mt-1 bg-white border border-[var(--border)] rounded-xl px-3 py-2 text-sm">
                  {TACTICS.map(t => <option key={t} value={t}>{TACTIC_LABEL[t]}</option>)}
                </select>
              </div>
            </>
          )}
          <button onClick={startMatch} disabled={!homeInfo || (!!opponentId && !activeOpponentPlayers)} className="w-full px-4 py-3 rounded-xl bg-[var(--red)] text-white font-bold disabled:opacity-40">
            Iniciar partida
          </button>
        </div>
      </div>
    );
  }

  if (step === 'prematch' && result) {
    const myPlayers = myMatchSide === 'home' ? result.config.homePlayers : result.config.awayPlayers;
    const opponentPlayersForMatch = myMatchSide === 'home' ? result.config.awayPlayers : result.config.homePlayers;
    const myTeamName = myMatchSide === 'home' ? result.config.homeName : result.config.awayName;
    const opponentTeamName = myMatchSide === 'home' ? result.config.awayName : result.config.homeName;
    const myFormation = myMatchSide === 'home' ? result.config.homeFormation : result.config.awayFormation;
    const opponentTeamFormation = myMatchSide === 'home' ? result.config.awayFormation : result.config.homeFormation;
    return (
      <div className="p-4 md:p-8 space-y-4">
        <h1 className="text-2xl font-semibold text-[var(--text)]">{challengeId ? 'Sala da partida PvP' : 'Pré-jogo'}</h1>
        {challengeId && (
          <div className="card-surface p-3 text-sm text-green-700">
            Resultado oficial confirmado pelo servidor · Relógio compartilhado · {playbackState?.status === 'playing' ? 'Partida em andamento' : 'Aguardando início'}
          </div>
        )}
        <div className="card-surface p-4">
          <div className="flex justify-between items-center mb-4">
            <div className="text-center">
              <div className="font-bold text-[var(--text)]">{myTeamName}</div>
              <div className="text-xs text-[var(--muted)]">{myFormation}</div>
            </div>
            <div className="text-[var(--muted)]">vs</div>
            <div className="text-center">
              <div className="font-bold text-[var(--text)]">{opponentTeamName}</div>
              <div className="text-xs text-[var(--muted)]">{opponentTeamFormation}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
            <div>
              <div className="font-semibold text-[var(--muted)] mb-1">{myTeamName} · Seu time</div>
              {myPlayers.map(p => <div key={p.id} className="text-[var(--text)]">{p.number}. {p.name} ({p.position})</div>)}
            </div>
            <div>
              <div className="font-semibold text-[var(--muted)] mb-1">{opponentTeamName} · Adversário</div>
              {opponentPlayersForMatch.map(p => <div key={p.id} className="text-[var(--text)]">{p.number}. {p.name} ({p.position})</div>)}
            </div>
          </div>
          <button onClick={startPlay} disabled={!!challengeId && (playbackState?.status === 'playing' || playbackState?.status === 'finished')} className="w-full px-4 py-3 rounded-xl bg-[var(--red)] text-white font-bold disabled:opacity-40">
            {playbackState?.status === 'paused' ? 'Retomar partida' : playbackState?.status === 'playing' ? 'Partida em andamento' : 'Começar'}
          </button>
        </div>
      </div>
    );
  }

  if (step === 'play' && result && currentFrame) {
    const homePlayers = result.config.homePlayers;
    const awayPlayers = result.config.awayPlayers;
    const playersById = new Map([...homePlayers, ...awayPlayers].map(player => [player.id, player]));
    const reverseDisplayedSides = challengeId && myMatchSide === 'away';
    const shownHomeScore = reverseDisplayedSides ? currentFrame.awayScore : currentFrame.homeScore;
    const shownAwayScore = reverseDisplayedSides ? currentFrame.homeScore : currentFrame.awayScore;
    const shownHomeName = reverseDisplayedSides ? result.config.awayName : result.config.homeName;
    const shownAwayName = reverseDisplayedSides ? result.config.homeName : result.config.awayName;
    const shownHomeSide = reverseDisplayedSides ? 'away' : 'home';
    const shownAwaySide = reverseDisplayedSides ? 'home' : 'away';
    const eventsAtCurrentMinute = result.events.filter(event => event.minute <= currentFrame.minute);
    const liveStat = (side: 'home' | 'away', types: MatchEvent['type'][]) =>
      eventsAtCurrentMinute.filter(event => event.team === side && types.includes(event.type)).length;
    const displayedStat = (types: MatchEvent['type'][]) => reverseDisplayedSides
      ? `${liveStat('away', types)} - ${liveStat('home', types)}`
      : `${liveStat('home', types)} - ${liveStat('away', types)}`;
    const activeSpeed = challengeId ? playbackState?.speed ?? 1 : speed;
    const isPlaying = challengeId ? playbackState?.status === 'playing' : playing;
    const matchEnding = currentFrame.minute >= result.durationMinutes;
    const frameBeforeCurrent = Math.floor(frameIndex);
    const ballTrail = reduceMotion
      ? []
      : result.frames.slice(Math.max(0, frameBeforeCurrent - 3), frameBeforeCurrent);
    const goalScorer = goalAnnouncement?.playerId ? playersById.get(goalAnnouncement.playerId)?.name : null;
    const scoreProgress = Math.min(100, Math.max(0, currentFrame.minute / MATCH_DURATION_MINUTES * 100));
    return (
      <div className="p-4 md:p-8 space-y-4">
        <div className="sticky top-0 z-30 card-surface space-y-3 p-3 shadow-md md:p-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: TEAM_COLORS[shownHomeSide] }} />
              <span className="truncate text-sm font-bold text-[var(--text)] md:text-base">{shownHomeName}</span>
            </div>
            <div className="rounded-lg bg-slate-950 px-3 py-1 text-xl font-black tracking-wider text-white md:px-5 md:text-2xl" aria-label={`Placar: ${shownHomeScore} a ${shownAwayScore}`}>
              {shownHomeScore} – {shownAwayScore}
            </div>
            <div className="flex min-w-0 items-center justify-end gap-2">
              <span className="truncate text-right text-sm font-bold text-[var(--text)] md:text-base">{shownAwayName}</span>
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: TEAM_COLORS[shownAwaySide] }} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-[120px] items-center gap-2 text-xs font-semibold text-[var(--muted)]">
              <span>{Math.floor(currentFrame.minute)}′ / {MATCH_DURATION_MINUTES}′</span>
              <span>{currentFrame.half === 1 ? '1º tempo' : '2º tempo'}</span>
            </div>
            <div className="h-2 min-w-[100px] flex-1 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Progresso da partida" aria-valuemin={0} aria-valuemax={MATCH_DURATION_MINUTES} aria-valuenow={Math.floor(currentFrame.minute)}>
              <div className="h-full rounded-full bg-[var(--red)] transition-[width] duration-300" style={{ width: `${scoreProgress}%` }} />
            </div>
            {challengeId && <span className="text-xs text-[var(--muted)]">Relógio compartilhado · {activeSpeed}x</span>}
            <div className="ml-auto flex gap-2">
              <button onClick={() => controlPlayback(isPlaying ? 'pause' : 'play')} disabled={matchEnding} className="rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-40">{isPlaying ? 'Pausar' : 'Retomar'}</button>
              {[1, 2, 4].map(s => (
                <button key={s} onClick={() => controlPlayback('speed', s as 1 | 2 | 4)} disabled={matchEnding} className={`rounded-xl px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${activeSpeed === s ? 'bg-[var(--red)] text-white' : 'border border-[var(--border)] bg-white text-[var(--muted)]'}`}>{s}x</button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-4">
            <div className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-2xl bg-slate-950 p-2 shadow-lg shadow-slate-950/20 md:p-3">
              <svg viewBox="0 0 100 50" className="mx-auto block max-h-[50dvh] w-full h-auto" role="group" aria-label="Quadra de futsal com a posição dos jogadores">
                <defs>
                  <clipPath id="futsal-court-clip">
                    <rect x="1" y="1" width="98" height="48" rx="1.5" />
                  </clipPath>
                  <filter id="futsal-ball-shadow" x="-100%" y="-100%" width="300%" height="300%">
                    <feDropShadow dx="0" dy="0.5" stdDeviation="0.55" floodColor="#000" floodOpacity="0.8" />
                  </filter>
                </defs>
                <rect x="0" y="0" width="100" height="50" rx="2" fill="#9A6845" />
                <g clipPath="url(#futsal-court-clip)">
                  {Array.from({ length: 10 }, (_, index) => (
                    <rect key={index} x={index * 10} y="0" width="10" height="50" fill={index % 2 === 0 ? '#B9845B' : '#A8734F'} opacity="0.75" />
                  ))}
                </g>
                <rect x="1.5" y="1.5" width="97" height="47" rx="1.5" fill="none" stroke="#fff" strokeWidth="0.45" />
                <line x1="50" y1="1.5" x2="50" y2="48.5" stroke="#fff" strokeWidth="0.4" />
                <circle cx="50" cy="25" r="7.5" fill="none" stroke="#fff" strokeWidth="0.4" />
                <circle cx="50" cy="25" r="0.6" fill="#fff" />
                <path d="M 1.5 10 A 15 15 0 0 1 16.5 25 A 15 15 0 0 1 1.5 40" fill="none" stroke="#fff" strokeWidth="0.4" />
                <path d="M 98.5 10 A 15 15 0 0 0 83.5 25 A 15 15 0 0 0 98.5 40" fill="none" stroke="#fff" strokeWidth="0.4" />
                <circle cx="16.5" cy="25" r="0.55" fill="#fff" />
                <circle cx="25" cy="25" r="0.55" fill="#fff" />
                <circle cx="83.5" cy="25" r="0.55" fill="#fff" />
                <circle cx="75" cy="25" r="0.55" fill="#fff" />
                <path d="M 1.5 3.5 A 2.5 2.5 0 0 1 4 1.5 M 96 1.5 A 2.5 2.5 0 0 1 98.5 3.5 M 1.5 46.5 A 2.5 2.5 0 0 0 4 48.5 M 96 48.5 A 2.5 2.5 0 0 0 98.5 46.5" fill="none" stroke="#fff" strokeWidth="0.4" />
                <rect x="0.5" y="21.25" width="1.7" height="7.5" fill="none" stroke="#fff" strokeWidth="0.4" />
                <rect x="97.8" y="21.25" width="1.7" height="7.5" fill="none" stroke="#fff" strokeWidth="0.4" />
                {ballTrail.map((frame, index) => (
                  <circle
                    key={`trail-${Math.floor(frameIndex) - ballTrail.length + index}`}
                    cx={frame.ball.x}
                    cy={toSvgY(frame.ball.y)}
                    r={1.6 + index * 0.15}
                    fill="#fff"
                    opacity={0.1 + (index + 1) * 0.1}
                  />
                ))}
                {displayFrame?.players.map(player => {
                  const details = playersById.get(player.id);
                  if (!details) return null;
                  const isKeeper = details.isGK;
                  const isBallCarrier = currentFrame.ball.holder === player.id;
                  const justSaved = isKeeper
                    && currentFrame.lastEvent?.type === 'save'
                    && currentFrame.lastEvent.minute === currentFrame.minute
                    && currentFrame.lastEvent.playerId === player.id;
                  const labelVisible = isBallCarrier || selectedPlayerId === player.id || hoveredPlayerId === player.id;
                  const y = toSvgY(player.y);
                  const labelY = y < 42 ? 6.3 : -4.2;
                  const displayedSide = reverseDisplayedSides
                    ? (player.team === 'home' ? 'away' : 'home')
                    : player.team;
                  const color = isKeeper ? '#FDE047' : TEAM_COLORS[displayedSide];
                  const playerDescription = `${details.name}, ${details.position}, ${player.team === shownHomeSide ? shownHomeName : shownAwayName}`;
                  return (
                    <g
                      key={player.id}
                      transform={`translate(${player.x} ${y})`}
                      className="cursor-pointer"
                      role="button"
                      tabIndex={0}
                      aria-label={playerDescription}
                      aria-pressed={selectedPlayerId === player.id}
                      onMouseEnter={() => setHoveredPlayerId(player.id)}
                      onMouseLeave={() => setHoveredPlayerId(current => current === player.id ? null : current)}
                      onFocus={() => setHoveredPlayerId(player.id)}
                      onBlur={() => setHoveredPlayerId(current => current === player.id ? null : current)}
                      onClick={() => setSelectedPlayerId(current => current === player.id ? null : player.id)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedPlayerId(current => current === player.id ? null : player.id);
                        }
                      }}
                    >
                      {justSaved && <circle r="4.8" fill="none" stroke="#22C55E" strokeWidth="1.1" />}
                      {isBallCarrier && <circle r="4.3" fill="none" stroke="#FDE047" strokeWidth="0.8" />}
                      <circle r="3" fill={color} stroke={isKeeper ? '#0F172A' : '#fff'} strokeWidth="0.5" />
                      <text x="0" y="0.85" textAnchor="middle" fontSize="1.8" fill={isKeeper ? '#0F172A' : '#fff'} fontWeight="900">
                        {details.number}
                      </text>
                      {labelVisible && (
                        <text x="0" y={labelY} textAnchor="middle" fontSize="2.35" fill="#fff" stroke="#0F172A" strokeWidth="0.75" strokeLinejoin="round" paintOrder="stroke" fontWeight="700">
                          {details.name.trim().split(/\s+/).pop()}
                        </text>
                      )}
                    </g>
                  );
                })}
                {(() => {
                  const ball = displayFrame?.ball ?? currentFrame.ball;
                  const holder = ball.holder ? playersById.get(ball.holder) : undefined;
                  const keeperOffset = holder?.isGK ? (holder.team === 'home' ? 3.2 : -3.2) : 0;
                  return (
                    <circle
                      cx={ball.x + keeperOffset}
                      cy={toSvgY(ball.y)}
                      r="1.65"
                      fill="#fff"
                      stroke="#0F172A"
                      strokeWidth="0.4"
                      filter="url(#futsal-ball-shadow)"
                    />
                  );
                })()}
              </svg>
              {(goalAnnouncement || matchNotice) && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4" role="status" aria-live="polite">
                  {goalAnnouncement && matchNotice !== 'Fim de jogo' ? (
                    <div className="rounded-xl px-6 py-3 text-center text-white shadow-2xl" style={{ backgroundColor: TEAM_COLORS[goalAnnouncement.team === 'away' ? 'away' : 'home'] }}>
                      <div className="text-3xl font-black tracking-widest">GOL!</div>
                      <div className="font-semibold">{goalScorer || 'Gol'} · {goalAnnouncement.minute}′</div>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-slate-950/90 px-8 py-4 text-2xl font-black tracking-widest text-white shadow-2xl">
                      {matchNotice}
                    </div>
                  )}
                </div>
              )}
            </div>

            {currentFrame.lastEvent && (
              <div className="card-surface p-3 text-sm text-[var(--text)]">
                <span className="font-bold text-[var(--red)]">{currentFrame.lastEvent.minute}′</span> {currentFrame.lastEvent.description}
              </div>
            )}

            <div className="card-surface max-h-40 overflow-auto p-3">
              <div className="mb-2 text-xs font-semibold text-[var(--muted)]">Lances recentes</div>
              {eventsAtCurrentMinute.slice(-8).reverse().map((event, index) => (
                <div key={`${event.minute}-${event.type}-${index}`} className="py-0.5 text-xs text-[var(--text)]">{event.minute}′ - {event.description}</div>
              ))}
            </div>
          </div>

          <aside className="card-surface space-y-3 p-4" aria-label="Estatísticas ao vivo">
            <h2 className="text-sm font-bold text-[var(--text)]">Estatísticas ao vivo</h2>
            {[
              { label: 'Finalizações', types: ['goal', 'save', 'miss'] as MatchEvent['type'][] },
              { label: 'No alvo', types: ['goal', 'save'] as MatchEvent['type'][] },
              { label: 'Faltas', types: ['foul'] as MatchEvent['type'][] },
            ].map(stat => (
              <div key={stat.label} className="flex items-center justify-between border-t border-[var(--border)] pt-2 text-sm">
                <span className="text-[var(--muted)]">{stat.label}</span>
                <span className="font-bold text-[var(--text)]">{displayedStat(stat.types)}</span>
              </div>
            ))}
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[10px] text-[var(--muted)]">
              <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--red)]" />{shownHomeName}</span>
              <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#173B6B]" />{shownAwayName}</span>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  if (step === 'result' && result) {
    if (challengeId) {
      if (!resultConfirmed) {
        return (
          <div className="flex min-h-[50dvh] items-center justify-center bg-[#080b12] px-4 text-center text-sm text-white/65">
            Aguardando a confirmação oficial do resultado pelo servidor…
          </div>
        );
      }

      return (
        <PvpResultScreen
          result={result}
          mySide={myMatchSide}
          isExhibition={!!challenge?.admin_entertainment}
          showExhibitionDisclosure={!!challenge?.admin_entertainment && currentUserId === ADMIN_USER_ID}
          homeSnapshot={challenge?.home_snapshot ?? null}
          awaySnapshot={challenge?.away_snapshot ?? null}
          cardDetailsById={officialSnapshotCardDetails?.key === snapshotCardDetailsKey ? officialSnapshotCardDetails.byId : {}}
          rewardsSyncStatus={rewardsSyncStatus}
          onRematch={() => { void startPvpRematch(); }}
          rematchLoading={rematchLoading}
          onMenu={() => navigate('/')}
        />
      );
    }

    const homeStats = myMatchSide === 'home' ? result.teamStats.home : result.teamStats.away;
    const awayStats = myMatchSide === 'home' ? result.teamStats.away : result.teamStats.home;
    const possessionTicks = homeStats.possession + awayStats.possession;
    const homePossession = possessionTicks ? Math.round(homeStats.possession / possessionTicks * 100) : 0;
    const awayPossession = possessionTicks ? 100 - homePossession : 0;
    const finalHomeScore = myMatchSide === 'home' ? result.homeScore : result.awayScore;
    const finalAwayScore = myMatchSide === 'home' ? result.awayScore : result.homeScore;
    const finalHomeName = myMatchSide === 'home' ? result.config.homeName : result.config.awayName;
    const finalAwayName = myMatchSide === 'home' ? result.config.awayName : result.config.homeName;
    return (
      <div className="p-4 md:p-8 space-y-4">
        <h1 className="text-2xl font-semibold text-[var(--text)]">Resultado final</h1>
        <div className="card-surface p-6 text-center">
          {challengeId && <div className="text-xs font-semibold text-green-700 mb-2">Resultado oficial confirmado pelo servidor</div>}
          <div className="text-4xl font-bold text-[var(--text)]">{finalHomeScore} - {finalAwayScore}</div>
          <div className="text-sm text-[var(--muted)] mt-1">{finalHomeName} vs {finalAwayName}</div>
          {result.penalties && (
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-white/80 px-3 py-2">
              <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Decisão por pênaltis</div>
              <div className="mt-1 text-xl font-black tabular-nums text-[var(--text)]">
                {result.penalties.homeScore} <span className="text-[var(--muted)]">–</span> {result.penalties.awayScore}
              </div>
              <div className="mt-1 text-sm font-semibold text-[var(--text)]">
                {result.penalties.winnerSide === myMatchSide ? finalHomeName : finalAwayName} venceu nos pênaltis
              </div>
            </div>
          )}
        </div>
        <div className="card-surface p-4">
          <h3 className="font-semibold text-[var(--text)] mb-3">Estatísticas</h3>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="text-center text-xs text-[var(--muted)]">{finalHomeName}</div>
            <div />
            <div className="text-center text-xs text-[var(--muted)]">{finalAwayName}</div>
            <div className="text-center font-bold text-[var(--text)]">{homePossession}%</div>
            <div className="text-center text-[var(--muted)] text-xs">Posse de bola</div>
            <div className="text-center font-bold text-[var(--text)]">{awayPossession}%</div>
            <div className="text-center font-bold text-[var(--text)]">{homeStats.passes}</div>
            <div className="text-center text-[var(--muted)] text-xs">Passes</div>
            <div className="text-center font-bold text-[var(--text)]">{awayStats.passes}</div>
            <div className="text-center font-bold text-[var(--text)]">{homeStats.passCompleted}</div>
            <div className="text-center text-[var(--muted)] text-xs">Passes completos</div>
            <div className="text-center font-bold text-[var(--text)]">{awayStats.passCompleted}</div>
            <div className="text-center font-bold text-[var(--text)]">{homeStats.shots}</div>
            <div className="text-center text-[var(--muted)] text-xs">Finalizações</div>
            <div className="text-center font-bold text-[var(--text)]">{awayStats.shots}</div>
            <div className="text-center font-bold text-[var(--text)]">{homeStats.shotsOnTarget}</div>
            <div className="text-center text-[var(--muted)] text-xs">No alvo</div>
            <div className="text-center font-bold text-[var(--text)]">{awayStats.shotsOnTarget}</div>
            <div className="text-center font-bold text-[var(--text)]">{homeStats.tackles}</div>
            <div className="text-center text-[var(--muted)] text-xs">Desarmes</div>
            <div className="text-center font-bold text-[var(--text)]">{awayStats.tackles}</div>
          </div>
        </div>
        <div className="card-surface p-4 max-h-60 overflow-auto">
          <h3 className="font-semibold text-[var(--text)] mb-2">Linha do tempo</h3>
          {result.events.map((e, i) => (
            <div key={i} className="text-xs text-[var(--text)] py-0.5">{e.minute}' - {e.description}</div>
          ))}
        </div>
        {challengeId ? (
          <button onClick={() => navigate('/friends')} className="w-full px-4 py-3 rounded-xl bg-[var(--red)] text-white font-bold">
            Voltar
          </button>
        ) : (
          <button onClick={() => { recordedRef.current = false; setStep('setup'); setResult(null); setChallengeSquads(null); }} className="w-full px-4 py-3 rounded-xl bg-[var(--red)] text-white font-bold">
            Nova partida
          </button>
        )}
      </div>
    );
  }

  return null;
}

// key => ao trocar de desafio/adversario o componente remonta: nenhum estado, ref ou resposta
// atrasada da partida anterior contamina a nova.
export default function Match() {
  const [sp] = useSearchParams();
  return <MatchInner key={`${sp.get('challenge') ?? ''}|${sp.get('opponent') ?? ''}`} />;
}
