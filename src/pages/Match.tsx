import { useState, useRef, useEffect } from 'react';
import { useGame } from '../store/useGame';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from '../store/toast';
import { simulateMatch, createPlayersFromCards, makeAwayTeam } from '../engine/match';
import type { MatchResult, MatchPlayer, Tactic } from '../engine/match';
import * as challengesService from '../lib/services/challenges';
import type { MatchPlaybackState } from '../lib/services/challenges';
import { nanoid } from 'nanoid';

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

const TACTICS: Tactic[] = ['balanced', 'possession', 'highpress', 'counter', 'compact'];
const TACTIC_LABEL: Record<Tactic, string> = { balanced: 'Equilibrado', possession: 'Posse de bola', highpress: 'Pressao alta', counter: 'Contra-ataque', compact: 'Defesa compacta' };

function MatchInner() {
  const cards = useGame(s => s.cards);
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
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const opponentId = searchParams.get('opponent');
  const challengeId = searchParams.get('challenge');
  const [opponentName, setOpponentName] = useState<string>('IA');
  const [opponentPlayers, setOpponentPlayers] = useState<MatchPlayer[] | null>(null);
  const [opponentPlayersOwner, setOpponentPlayersOwner] = useState<string | null>(null);
  const [opponentFormation, setOpponentFormation] = useState<string>('1-2-1');
  const [loadingOpp, setLoadingOpp] = useState(false);
  const [challenge, setChallenge] = useState<any>(null);
  const [challengeSquads, setChallengeSquads] = useState<ChallengeSquads | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(!!challengeId);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [readyLoading, setReadyLoading] = useState(false);
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
  const finishingPlaybackRef = useRef(false);
  const cancelledByMeRef = useRef(false);
  const startMatchRef = useRef<() => void>(() => {});
  const squad = squads[sport];
  const mySaved = savedSquads.filter(s => s.sport === sport);

  const buildHomePlayers = (): { players: MatchPlayer[]; formation: string; cards: any[] } | null => {
    let formation = squad.formation;
    let starterUids = squad.starters.map(s => s.uid);
    if (selectedSquadId) {
      const ss = savedSquads.find(s => s.id === selectedSquadId);
      if (ss) { formation = ss.formation; starterUids = ss.starters; }
    }
    const starterCards = starterUids.map(uid => uid ? cards.find(c => c.uid === uid) : null).filter(Boolean) as any[];
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
      const { data, error } = await supabase.functions.invoke('get-challenge-data', { body: { challengeId } });
      if (error || !data || data.error) {
        let msg = data?.error as string | undefined;
        if (!msg && error) {
          try { msg = (await (error as any).context?.json?.())?.error; } catch { /* ignore */ }
        }
        throw new Error(msg || 'Não foi possível carregar os elencos do desafio.');
      }
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
    } catch (e: any) {
      console.error('get-challenge-data failed', e);
      setChallengeError(e?.message || 'Erro ao carregar os elencos do desafio.');
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
      minutes: 40,
    });
    setResult(res);
    setFrameIndex(0);
    setStep('prematch');
  };
  startMatchRef.current = startMatch;

  const startPlay = () => {
    if (challengeId && resultConfirmed) {
      void challengesService.updateChallengePlayback(challengeId, 'play')
        .then(state => {
          receivePlaybackState(state);
          setFrameIndex(state.currentFrame);
          if (state.status === 'playing') setStep('play');
          if (state.status === 'finished') setStep('result');
        })
        .catch(error => {
          console.error('challenge playback start failed', error);
          toast.error('Não foi possível iniciar o relógio compartilhado.');
        });
      return;
    }
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

  // opponent fetch
  useEffect(() => {
    if (!opponentId || !supabase) return;
    let cancelled = false;
    setOpponentPlayers(null);
    setOpponentPlayersOwner(null);
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
        const { data: cs } = await supabase.from('cards').select('*').eq('user_id', opponentId);
        if (cancelled) return;
        const cardMap = new Map((cs || []).map((c: any) => [c.id, c]));
        const starterCards = starterUids.map(uid => uid ? cardMap.get(uid) : null).filter((c: any) => c && c.position) as any[];
        if (starterCards.length >= 5) {
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
        if (!cancelled) console.error('opponent fetch failed', e);
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

  // fallback polling in case realtime is not enabled for the table
  useEffect(() => {
    if (!challengeId || !supabase) return;
    const st = challenge?.status;
    const playbackFinished = (playbackState?.status === 'finished');
    if ((st !== 'pending' && st !== 'accepted' && st !== 'completed') || (st === 'completed' && playbackFinished)) return;
    const t = setInterval(async () => {
      try {
        const ch = await challengesService.getChallenge(challengeId);
        if (ch) applyChallengeRow(ch);
      } catch (e) {
        console.error('polling failed', e);
      }
    }, 4000);
    return () => clearInterval(t);
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
      const framesPerSec = speed * 2;
      setFrameIndex(prev => {
        const next = prev + dt * framesPerSec;
        if (next >= result.frames.length) {
          setPlaying(false);
          setStep('result');
          return result.frames.length - 1;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [challengeId, step, playing, speed, result]);

  useEffect(() => {
    if (!challengeId || !resultConfirmed || !result || !playbackState) return;
    if (playbackState.status === 'finished') {
      setFrameIndex(result.frames.length - 1);
      setStep('result');
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
  }, [challengeId, resultConfirmed, result, playbackState]);

  useEffect(() => {
    if (step !== 'result' || !result || recordedRef.current) return;
    recordedRef.current = true;
    if (challengeId && currentUserId) {
      void syncUserData(currentUserId).catch(error => {
        console.error('challenge reward refresh failed', error);
      });
    }
    // challenge already recorded (page revisited / other tab): do not duplicate history or XP
    if (challengeId && matchHistory.some(m => m.challengeId === challengeId)) return;
    // in PvP the challenged user plays as AWAY: credit their own cards and see the score from their side
    const mySide: 'home' | 'away' = challengeId && challenge && currentUserId === challenge.challenged_id ? 'away' : 'home';
    const myScore = mySide === 'home' ? result.homeScore : result.awayScore;
    const oppScore = mySide === 'home' ? result.awayScore : result.homeScore;
    const oppName = mySide === 'home' ? result.config.awayName : result.config.homeName;
    const historyEntry = { id: nanoid(), date: Date.now(), sport, homeScore: myScore, awayScore: oppScore, opponent: oppName, challengeId: challengeId ?? undefined };
    if (challengeId) addLocalMatchHistory(historyEntry);
    else addMatchHistory(historyEntry);
    if (!challengeId) {
      result.config.homePlayers.forEach(p => {
        const ps = result.playerStats[p.id];
        addPlayerXp(p.id.replace(/_home$/, ''), 50 + (result.homeScore > result.awayScore ? 30 : 0));
        recordMatchStats(p.id.replace(/_home$/, ''), ps?.goals ?? 0, ps?.assists ?? 0);
      });
    }
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

  const toSvgY = (v: number) => (v / 100) * 64;

  const currentFrame = result ? result.frames[Math.min(Math.floor(frameIndex), result.frames.length - 1)] : null;

  if (challengeLoading || loadingOpp) return <div className="p-8 text-[#858A98]">Carregando...</div>;

  if (challengeId && challenge && challenge.status === 'pending') {
    const isChallenger = currentUserId === challenge.challenger_id;
    if (isChallenger) {
      return (
        <div className="p-4 md:p-8 space-y-4">
          <h1 className="text-2xl font-semibold text-[#252733]">Desafio enviado</h1>
          <div className="card-surface p-4 text-sm text-[#858A98]">Aguardando o adversario aceitar...</div>
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
            className="px-4 py-2 rounded-xl bg-white border border-[#E9EAF0] text-sm font-medium"
          >
            Cancelar desafio
          </button>
        </div>
      );
    }
    return (
      <div className="p-4 md:p-8 space-y-4">
        <h1 className="text-2xl font-semibold text-[#252733]">Desafio PvP</h1>
        <div className="card-surface p-4 space-y-3">
          <div className="text-sm text-[#252733]">Voce foi desafiado!</div>
          <div className="flex gap-2">
            <button onClick={async () => { const ok = await challengesService.acceptChallenge(challengeId); const ch = await challengesService.getChallenge(challengeId); if (!ok && ch?.status !== 'accepted') toast.error('Não foi possível aceitar o desafio.'); if (ch) applyChallengeRow(ch); }} className="px-4 py-2 rounded-xl bg-[#E30613] text-white text-sm font-medium">Aceitar</button>
            <button
              onClick={async () => {
                const ok = await challengesService.rejectChallenge(challengeId);
                if (!ok) {
                  toast.error('Não foi possível recusar o desafio.');
                  return;
                }
                navigate('/');
              }}
              className="px-4 py-2 rounded-xl bg-white border border-[#E9EAF0] text-sm font-medium"
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
    const myReady = isChallenger ? challengerReady : challengedReady;
    const oppReady = isChallenger ? challengedReady : challengerReady;
    const homeAverage = challengeSquads
      ? Math.round(challengeSquads.homeCards.reduce((sum, player) => sum + Number(player.overall ?? 0), 0) / challengeSquads.homeCards.length)
      : null;
    const awayAverage = challengeSquads
      ? Math.round(challengeSquads.awayCards.reduce((sum, player) => sum + Number(player.overall ?? 0), 0) / challengeSquads.awayCards.length)
      : null;
    return (
      <div className="p-4 md:p-8 space-y-6">
        {fade && <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center text-white text-2xl font-bold">Preparando partida...</div>}
        <h1 className="text-2xl md:text-3xl font-semibold text-[#252733]">Pré-jogo (PvP)</h1>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card-surface p-4">
            <div className="text-sm font-medium text-[#858A98] mb-2">Seu time</div>
            <div className="text-sm text-[#252733]">{challengeSquads ? `${isChallenger ? challengeSquads.homeName : challengeSquads.awayName} · ${isChallenger ? challengeSquads.homeFormation : challengeSquads.awayFormation} · OVR ${isChallenger ? homeAverage : awayAverage}` : 'Carregando elenco...'}</div>
            {challengeSquads && (isChallenger ? challengeSquads.homeCards : challengeSquads.awayCards).map(player => (
              <div key={player.uid} className="text-xs text-[#858A98] mt-1">{player.name} · {player.position} · {player.overall}</div>
            ))}
          </div>
          <div className="card-surface p-4">
            <div className="text-sm font-medium text-[#858A98] mb-2">Adversário</div>
            <div className="text-sm text-[#252733]">{challengeSquads ? `${isChallenger ? challengeSquads.awayName : challengeSquads.homeName} · ${isChallenger ? challengeSquads.awayFormation : challengeSquads.homeFormation} · OVR ${isChallenger ? awayAverage : homeAverage}` : 'Carregando elenco...'}</div>
            {challengeSquads && (isChallenger ? challengeSquads.awayCards : challengeSquads.homeCards).map(player => (
              <div key={player.uid} className="text-xs text-[#858A98] mt-1">{player.name} · {player.position} · {player.overall}</div>
            ))}
          </div>
        </div>
        {challengeError && (
          <div className="card-surface p-4 text-sm text-red-600 space-y-2">
            <div>{challengeError}</div>
            <button onClick={() => setChallengeError(null)} className="px-3 py-1.5 rounded-xl bg-white border border-[#E9EAF0] text-[#252733] text-xs font-medium">Tentar novamente</button>
          </div>
        )}
        <div className="text-sm text-[#858A98]">
          Você: {myReady ? 'Pronto ✓' : 'Aguardando...'} · Adversário: {oppReady ? 'Pronto ✓' : 'Aguardando...'}
        </div>
        <div className="grid md:grid-cols-2 gap-3 text-xs text-[#858A98]">
          <div>{challengeSquads?.homeName}: {TACTIC_LABEL[TACTICS.find(tactic => tactic === challenge?.challenger_tactic) ?? 'balanced']}</div>
          <div>{challengeSquads?.awayName}: {TACTIC_LABEL[TACTICS.find(tactic => tactic === challenge?.challenged_tactic) ?? 'balanced']}</div>
        </div>
        <div>
          <label className="text-sm text-[#858A98]">Sua tática</label>
          <select
            value={challengeTactic}
            onChange={event => setChallengeTactic(event.target.value as Tactic)}
            disabled={myReady}
            className="w-full mt-1 bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm disabled:opacity-50"
          >
            {TACTICS.map(tactic => <option key={tactic} value={tactic}>{TACTIC_LABEL[tactic]}</option>)}
          </select>
        </div>
        {startError && (
          <div className="card-surface p-4 text-sm text-red-600 space-y-2">
            <div>{startError}</div>
            <button onClick={() => setStartError(null)} className="px-3 py-1.5 rounded-xl bg-white border border-[#E9EAF0] text-[#252733] text-xs font-medium">Tentar novamente</button>
          </div>
        )}
        <button
          onClick={async () => {
            if (!challengeId || readyLoading) return;
            setReadyLoading(true);
            try {
              const ok = await challengesService.setReady(challengeId, challengeTactic);
              if (!ok) toast.error('Não foi possível confirmar. Tente de novo.');
              const ch = await challengesService.getChallenge(challengeId);
              if (ch) applyChallengeRow(ch);
            } finally {
              setReadyLoading(false);
            }
          }}
          disabled={myReady || !challengeSquads || readyLoading}
          className="w-full px-4 py-3 rounded-xl bg-[#E30613] text-white font-bold disabled:opacity-40"
        >
          {readyLoading ? 'Enviando...' : myReady ? 'Aguardando adversário...' : 'Estou pronto'}
        </button>
        <button
          onClick={async () => {
            const ok = await challengesService.rejectChallenge(challengeId!);
            if (!ok) {
              toast.error('Não é possível cancelar depois que os dois jogadores confirmaram presença.');
              return;
            }
            cancelledByMeRef.current = true;
            navigate('/friends');
          }}
          disabled={challengerReady && challengedReady}
          className="w-full px-4 py-2 rounded-xl bg-white border border-[#E9EAF0] text-sm font-medium text-[#252733]"
        >
          {challengerReady && challengedReady ? 'Partida confirmada' : 'Cancelar desafio'}
        </button>
      </div>
    );
  }

  if (step === 'setup') {
    const activeOpponentPlayers = opponentPlayersOwner === opponentId ? opponentPlayers : null;
    return (
      <div className="p-4 md:p-8 space-y-6">
        <h1 className="text-2xl md:text-3xl font-semibold text-[#252733]">Partida simulada{opponentId ? ` vs ${opponentName}` : challengeId ? ' (PvP)' : ''}</h1>
        <div className="card-surface p-4 space-y-4 max-w-2xl">
          <div>
            <label className="text-sm text-[#858A98]">Escalação</label>
            <select value={selectedSquadId ?? ''} onChange={e => setSelectedSquadId(e.target.value || null)} className="w-full mt-1 bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm">
              <option value="">Escalação atual</option>
              {mySaved.map(s => <option key={s.id} value={s.id}>{s.name} ({s.formation})</option>)}
            </select>
            {!homeInfo && !challengeSquads && <div className="text-xs text-red-600 mt-1">Escalação incompleta.</div>}
            {homeInfo && <div className="text-xs text-[#858A98] mt-1">Overall médio: {Math.round(homeInfo.cards.reduce((a: number, c: any) => a + (c.overall ?? 0), 0) / homeInfo.cards.length)}</div>}
          </div>
          {!opponentId && !challengeId && (
            <div>
              <label className="text-sm text-[#858A98]">Dificuldade</label>
              <select value={difficulty} onChange={e => setDifficulty(e.target.value as any)} className="w-full mt-1 bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm">
                <option value="easy">Fácil</option>
                <option value="normal">Normal</option>
                <option value="hard">Difícil</option>
              </select>
            </div>
          )}
          <div>
            <label className="text-sm text-[#858A98]">Tática</label>
            <select value={homeTactic} onChange={e => setHomeTactic(e.target.value as Tactic)} className="w-full mt-1 bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm">
              {TACTICS.map(t => <option key={t} value={t}>{TACTIC_LABEL[t]}</option>)}
            </select>
          </div>
          <button onClick={startMatch} disabled={!homeInfo || (!!opponentId && !activeOpponentPlayers)} className="w-full px-4 py-3 rounded-xl bg-[#E30613] text-white font-bold disabled:opacity-40">
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
        <h1 className="text-2xl font-semibold text-[#252733]">{challengeId ? 'Sala da partida PvP' : 'Pré-jogo'}</h1>
        {challengeId && (
          <div className="card-surface p-3 text-sm text-green-700">
            Resultado oficial confirmado pelo servidor · Relógio compartilhado · {playbackState?.status === 'playing' ? 'Partida em andamento' : 'Aguardando início'}
          </div>
        )}
        <div className="card-surface p-4">
          <div className="flex justify-between items-center mb-4">
            <div className="text-center">
              <div className="font-bold text-[#252733]">{myTeamName}</div>
              <div className="text-xs text-[#858A98]">{myFormation}</div>
            </div>
            <div className="text-[#858A98]">vs</div>
            <div className="text-center">
              <div className="font-bold text-[#252733]">{opponentTeamName}</div>
              <div className="text-xs text-[#858A98]">{opponentTeamFormation}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
            <div>
              <div className="font-semibold text-[#858A98] mb-1">{myTeamName} · Seu time</div>
              {myPlayers.map(p => <div key={p.id} className="text-[#252733]">{p.number}. {p.name} ({p.position})</div>)}
            </div>
            <div>
              <div className="font-semibold text-[#858A98] mb-1">{opponentTeamName} · Adversário</div>
              {opponentPlayersForMatch.map(p => <div key={p.id} className="text-[#252733]">{p.number}. {p.name} ({p.position})</div>)}
            </div>
          </div>
          <button onClick={startPlay} disabled={!!challengeId && (playbackState?.status === 'playing' || playbackState?.status === 'finished')} className="w-full px-4 py-3 rounded-xl bg-[#E30613] text-white font-bold disabled:opacity-40">
            {playbackState?.status === 'paused' ? 'Retomar partida' : playbackState?.status === 'playing' ? 'Partida em andamento' : 'Começar'}
          </button>
        </div>
      </div>
    );
  }

  if (step === 'play' && result && currentFrame) {
    const homePlayers = result.config.homePlayers;
    const awayPlayers = result.config.awayPlayers;
    const playerById = (id: string) => [...homePlayers, ...awayPlayers].find(p => p.id === id);
    const shownHomeScore = challengeId && myMatchSide === 'away' ? result.awayScore : result.homeScore;
    const shownAwayScore = challengeId && myMatchSide === 'away' ? result.homeScore : result.awayScore;
    const activeSpeed = challengeId ? playbackState?.speed ?? 1 : speed;
    const isPlaying = challengeId ? playbackState?.status === 'playing' : playing;
    return (
      <div className="p-4 md:p-8 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-2xl font-bold text-[#252733]">{shownHomeScore} - {shownAwayScore}</div>
          <div className="text-sm text-[#858A98]">{Math.floor(currentFrame.minute)}' · {currentFrame.half === 1 ? '1º tempo' : '2º tempo'}</div>
          <div className="flex gap-2">
            <button onClick={() => controlPlayback(isPlaying ? 'pause' : 'play')} className="px-3 py-1.5 rounded-xl bg-white border border-[#E9EAF0] text-sm font-medium">{isPlaying ? 'Pausar' : 'Retomar'}</button>
            {[1, 2, 4].map(s => (
              <button key={s} onClick={() => controlPlayback('speed', s as 1 | 2 | 4)} className={`px-3 py-1.5 rounded-xl text-sm font-medium ${activeSpeed === s ? 'bg-[#E30613] text-white' : 'bg-white border border-[#E9EAF0] text-[#858A98]'}`}>{s}x</button>
            ))}
          </div>
        </div>
        {challengeId && <div className="text-xs text-[#858A98]">Relógio compartilhado · Velocidade atual: {activeSpeed}x</div>}

        <div className="card-surface p-2">
          <svg viewBox="0 0 100 64" className="w-full h-auto">
            <rect x="0" y="0" width="100" height="64" fill="#4ade80" />
            <rect x="2" y="2" width="96" height="60" fill="none" stroke="#fff" strokeWidth="0.5" />
            <line x1="50" y1="2" x2="50" y2="62" stroke="#fff" strokeWidth="0.5" />
            <circle cx="50" cy="32" r="6" fill="none" stroke="#fff" strokeWidth="0.5" />
            <rect x="0" y="26" width="2" height="12" fill="#fff" />
            <rect x="98" y="26" width="2" height="12" fill="#fff" />
            {currentFrame.players.map(p => (
              <g key={p.id}>
                <circle cx={p.x} cy={toSvgY(p.y)} r="2.2" fill={p.team === 'home' ? '#E30613' : '#1f2937'} stroke="#fff" strokeWidth="0.4" />
                <text x={p.x} y={toSvgY(p.y) + 0.8} textAnchor="middle" fontSize="1.6" fill="#fff" fontWeight="bold">
                  {playerById(p.id)?.number}
                </text>
              </g>
            ))}
            <circle cx={currentFrame.ball.x} cy={toSvgY(currentFrame.ball.y)} r="1.2" fill="#fff" stroke="#000" strokeWidth="0.3" />
          </svg>
        </div>

        {currentFrame.lastEvent && (
          <div className="card-surface p-3 text-sm text-[#252733]">
            <span className="font-bold text-[#E30613]">{currentFrame.lastEvent.minute}'</span> {currentFrame.lastEvent.description}
          </div>
        )}

        <div className="card-surface p-3 max-h-40 overflow-auto">
          <div className="text-xs font-semibold text-[#858A98] mb-2">Lances recentes</div>
          {result.events.slice(-8).reverse().map((e, i) => (
            <div key={i} className="text-xs text-[#252733] py-0.5">{e.minute}' - {e.description}</div>
          ))}
        </div>
      </div>
    );
  }

  if (step === 'result' && result) {
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
        <h1 className="text-2xl font-semibold text-[#252733]">Resultado final</h1>
        <div className="card-surface p-6 text-center">
          {challengeId && <div className="text-xs font-semibold text-green-700 mb-2">Resultado oficial confirmado pelo servidor</div>}
          <div className="text-4xl font-bold text-[#252733]">{finalHomeScore} - {finalAwayScore}</div>
          <div className="text-sm text-[#858A98] mt-1">{finalHomeName} vs {finalAwayName}</div>
        </div>
        <div className="card-surface p-4">
          <h3 className="font-semibold text-[#252733] mb-3">Estatísticas</h3>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="text-center text-xs text-[#858A98]">{finalHomeName}</div>
            <div />
            <div className="text-center text-xs text-[#858A98]">{finalAwayName}</div>
            <div className="text-center font-bold text-[#252733]">{homePossession}%</div>
            <div className="text-center text-[#858A98] text-xs">Posse de bola</div>
            <div className="text-center font-bold text-[#252733]">{awayPossession}%</div>
            <div className="text-center font-bold text-[#252733]">{homeStats.passes}</div>
            <div className="text-center text-[#858A98] text-xs">Passes</div>
            <div className="text-center font-bold text-[#252733]">{awayStats.passes}</div>
            <div className="text-center font-bold text-[#252733]">{homeStats.passCompleted}</div>
            <div className="text-center text-[#858A98] text-xs">Passes completos</div>
            <div className="text-center font-bold text-[#252733]">{awayStats.passCompleted}</div>
            <div className="text-center font-bold text-[#252733]">{homeStats.shots}</div>
            <div className="text-center text-[#858A98] text-xs">Finalizações</div>
            <div className="text-center font-bold text-[#252733]">{awayStats.shots}</div>
            <div className="text-center font-bold text-[#252733]">{homeStats.shotsOnTarget}</div>
            <div className="text-center text-[#858A98] text-xs">No alvo</div>
            <div className="text-center font-bold text-[#252733]">{awayStats.shotsOnTarget}</div>
            <div className="text-center font-bold text-[#252733]">{homeStats.tackles}</div>
            <div className="text-center text-[#858A98] text-xs">Desarmes</div>
            <div className="text-center font-bold text-[#252733]">{awayStats.tackles}</div>
          </div>
        </div>
        <div className="card-surface p-4 max-h-60 overflow-auto">
          <h3 className="font-semibold text-[#252733] mb-2">Linha do tempo</h3>
          {result.events.map((e, i) => (
            <div key={i} className="text-xs text-[#252733] py-0.5">{e.minute}' - {e.description}</div>
          ))}
        </div>
        {challengeId ? (
          <button onClick={() => navigate('/friends')} className="w-full px-4 py-3 rounded-xl bg-[#E30613] text-white font-bold">
            Voltar
          </button>
        ) : (
          <button onClick={() => { recordedRef.current = false; setStep('setup'); setResult(null); setChallengeSquads(null); }} className="w-full px-4 py-3 rounded-xl bg-[#E30613] text-white font-bold">
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
