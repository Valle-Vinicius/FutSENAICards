import { nanoid } from 'nanoid';
import { useState, useRef, useEffect } from 'react';
import { useGame } from '../store/useGame';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from '../store/toast';
import { simulateMatch, createPlayersFromCards, makeAwayTeam } from '../engine/match';
import type { MatchResult, MatchPlayer, Tactic } from '../engine/match';
import { squadOverall } from '../store/useGame';

const TACTICS: Tactic[] = ['balanced', 'possession', 'highpress', 'counter', 'compact'];
const TACTIC_LABEL: Record<Tactic, string> = { balanced: 'Equilibrado', possession: 'Posse de bola', highpress: 'Pressão alta', counter: 'Contra-ataque', compact: 'Defesa compacta' };

export default function Match() {
  const cards = useGame(s => s.cards);
  const squads = useGame(s => s.squads);
  const savedSquads = useGame(s => s.savedSquads);
  const sport = 'futsal' as const;
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');
  const [homeTactic, setHomeTactic] = useState<Tactic>('balanced');
  const [step, setStep] = useState<'setup' | 'prematch' | 'play' | 'result'>('setup');
  const [selectedSquadId, setSelectedSquadId] = useState<string | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const addMatchHistory = useGame(s => s.addMatchHistory);
  const addPlayerXp = useGame(s => s.addPlayerXp);
  const recordMatchStats = useGame(s => s.recordMatchStats);
  useEffect(() => {
    if (step === 'result' && result) {
      addMatchHistory({ id: nanoid(), date: Date.now(), sport, homeScore: result.homeScore, awayScore: result.awayScore, opponent: result.config.awayName });
      result.config.homePlayers.forEach(p => {
        const uid = p.id.replace(/_home$/, '');
        addPlayerXp(uid, 50 + (result.homeScore > result.awayScore ? 30 : 0));
        const ps = result.playerStats[p.id];
        recordMatchStats(uid, ps?.goals ?? 0, ps?.assists ?? 0);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const squad = squads[sport];
  const mySaved = savedSquads.filter(s => s.sport === sport);

  // build home players from current or saved squad
  const buildHomePlayers = (): { players: MatchPlayer[]; formation: string } | null => {
    let formation = squad.formation;
    let starterUids = squad.starters.map(s => s.uid);
    if (selectedSquadId) {
      const ss = savedSquads.find(s => s.id === selectedSquadId);
      if (ss) { formation = ss.formation; starterUids = ss.starters; }
    }
    const starterCards = starterUids.map(uid => uid ? cards.find(c => c.uid === uid) : null).filter(Boolean) as any[];
    if (starterCards.length < 5) return null;
    const players = createPlayersFromCards(starterCards, 'home', formation, sport);
    return { players, formation };
  };

  const [searchParams] = useSearchParams();
  const opponentId = searchParams.get('opponent');
  const [opponentName, setOpponentName] = useState<string>('IA');
  const [opponentPlayers, setOpponentPlayers] = useState<MatchPlayer[] | null>(null);
  const [opponentFormation, setOpponentFormation] = useState<string>('1-2-1');
  const [loadingOpp, setLoadingOpp] = useState(false);

  useEffect(() => {
    if (!opponentId || !supabase) return;
    setLoadingOpp(true);
    (async () => {
      const { data: prof } = await supabase.from('profiles').select('name').eq('id', opponentId).single();
      setOpponentName(prof?.name || 'Amigo');
      const { data: sq } = await supabase.from('squads').select('*').eq('user_id', opponentId).eq('is_primary', true).maybeSingle();
      const formation = sq?.formation || '1-2-1';
      setOpponentFormation(formation);
      const starterUids: (string | null)[] = sq?.starters || [];
      const { data: cs } = await supabase.from('cards').select('*').eq('user_id', opponentId);
      const cardMap = new Map((cs || []).map((c: any) => [c.id, c]));
      const starterCards = starterUids.map(uid => uid ? cardMap.get(uid) : null).filter(Boolean) as any[];
      if (starterCards.length >= 5) {
        const mapped = starterCards.map((c: any) => ({
          uid: c.id, name: c.name, position: c.position, overall: c.overall,
          pace: c.pace, shooting: c.shooting, passing: c.passing, dribbling: c.dribbling, defending: c.defending, physical: c.physical,
          reflexes: c.reflexes, positioning: c.positioning, handling: c.handling,
        }));
        const players = createPlayersFromCards(mapped, 'away', formation, 'futsal');
        setOpponentPlayers(players);
      }
      setLoadingOpp(false);
    })();
  }, [opponentId]);

  const startMatch = () => {
    if (!homeInfo) { toast.error('Escalação incompleta.'); return; }
    const seed = Date.now();
    let awayPlayers: MatchPlayer[];
    let awayFormation: string;
    let awayName: string;
    let awayTactic: Tactic = 'balanced';
    if (opponentId && opponentPlayers) {
      awayPlayers = opponentPlayers;
      awayFormation = opponentFormation;
      awayName = opponentName;
    } else {
      awayPlayers = makeAwayTeam(sport, difficulty, seed + 1);
      awayFormation = sport === 'futsal' ? '1-2-1' : '4-3-3';
      awayName = `IA (${difficulty})`;
    }
    const homeFormation = homeInfo.formation;
    const res = simulateMatch({
      sport,
      homeName: 'Futsenai FC',
      awayName,
      homePlayers: homeInfo.players,
      awayPlayers,
      homeFormation,
      awayFormation,
      homeTactic,
      awayTactic,
      awayDifficulty: difficulty,
      seed,
      minutes: sport === 'futsal' ? 40 : 90,
    });
    setResult(res);
    setFrameIndex(0);
    setStep('prematch');
  };

  const startPlay = () => {
    setStep('play');
    setPlaying(true);
  };

  // playback
  useEffect(() => {
    if (step !== 'play' || !result) return;
    if (!playing) { cancelAnimationFrame(rafRef.current); return; }
    lastTimeRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      // advance frames based on speed: 1 game minute per (X seconds real)
      const framesPerSec = speed * 2; // 2 frames/sec at 1x
      // We'll advance by time accumulator
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
  }, [step, playing, speed, result]);

  const currentFrame = result ? result.frames[Math.min(Math.floor(frameIndex), result.frames.length - 1)] : null;

  const toSvgY = (v: number) => (v / 100) * 64;

  const homeInfo = buildHomePlayers();

  if (loadingOpp) return <div className="p-8 text-[#858A98]">Carregando adversário...</div>;

  if (step === 'setup') {
    return (
      <div className="p-4 md:p-8 space-y-6">
        <h1 className="text-2xl md:text-3xl font-semibold text-[#252733]">Partida simulada{opponentId ? ` vs ${opponentName}` : ''}</h1>
        <div className="card-surface p-4 space-y-4 max-w-2xl">
          <div>
            <label className="text-sm text-[#858A98]">Escalação</label>
            <select value={selectedSquadId ?? ''} onChange={e => setSelectedSquadId(e.target.value || null)} className="w-full mt-1 bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm">
              <option value="">Escalação atual</option>
              {mySaved.map(s => <option key={s.id} value={s.id}>{s.name} ({s.formation})</option>)}
            </select>
            {!homeInfo && <div className="text-xs text-red-600 mt-1">Escalação incompleta.</div>}
            {homeInfo && <div className="text-xs text-[#858A98] mt-1">Overall médio: {squadOverall(squads[sport], cards)}</div>}
          </div>
          {!opponentId && (
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
          <button onClick={startMatch} disabled={!homeInfo || (opponentId ? !opponentPlayers : false)} className="w-full px-4 py-3 rounded-xl bg-[#E30613] text-white font-bold disabled:opacity-40">
            Iniciar partida
          </button>
        </div>
      </div>
    );
  }

  if (step === 'prematch' && result) {
    return (
      <div className="p-4 md:p-8 space-y-4">
        <h1 className="text-2xl font-semibold text-[#252733]">Pré-jogo</h1>
        <div className="card-surface p-4">
          <div className="flex justify-between items-center mb-4">
            <div className="text-center">
              <div className="font-bold text-[#252733]">{result.config.homeName}</div>
              <div className="text-xs text-[#858A98]">{result.config.homeFormation}</div>
            </div>
            <div className="text-[#858A98]">vs</div>
            <div className="text-center">
              <div className="font-bold text-[#252733]">{result.config.awayName}</div>
              <div className="text-xs text-[#858A98]">{result.config.awayFormation}</div>
            </div>
          </div>
          <button onClick={startPlay} className="w-full px-4 py-3 rounded-xl bg-[#E30613] text-white font-bold">
            Começar
          </button>
        </div>
      </div>
    );
  }

  if (step === 'play' && result && currentFrame) {
    const homePlayers = result.config.homePlayers;
    const awayPlayers = result.config.awayPlayers;
    const playerById = (id: string) => [...homePlayers, ...awayPlayers].find(p => p.id === id);
    return (
      <div className="p-4 md:p-8 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-2xl font-bold text-[#252733]">{result.homeScore} - {result.awayScore}</div>
          <div className="text-sm text-[#858A98]">{Math.floor(currentFrame.minute)}' · {currentFrame.half === 1 ? '1º tempo' : '2º tempo'}</div>
          <div className="flex gap-2">
            <button onClick={() => setPlaying(p => !p)} className="px-3 py-1.5 rounded-xl bg-white border border-[#E9EAF0] text-sm font-medium">{playing ? 'Pausar' : 'Retomar'}</button>
            {[1,2,4].map(s => (
              <button key={s} onClick={() => setSpeed(s)} className={`px-3 py-1.5 rounded-xl text-sm font-medium ${speed===s ? 'bg-[#E30613] text-white' : 'bg-white border border-[#E9EAF0] text-[#858A98]'}`}>{s}x</button>
            ))}
          </div>
        </div>

        <div className="card-surface p-2">
          <svg viewBox="0 0 100 64" className="w-full h-auto">
            {/* field */}
            <rect x="0" y="0" width="100" height="64" fill="#4ade80" />
            <rect x="2" y="2" width="96" height="60" fill="none" stroke="#fff" strokeWidth="0.5" />
            <line x1="50" y1="2" x2="50" y2="62" stroke="#fff" strokeWidth="0.5" />
            <circle cx="50" cy="32" r="6" fill="none" stroke="#fff" strokeWidth="0.5" />
            {/* goals */}
            <rect x="0" y="26" width="2" height="12" fill="#fff" />
            <rect x="98" y="26" width="2" height="12" fill="#fff" />
            {/* players */}
            {currentFrame.players.map(p => (
              <g key={p.id}>
                <circle cx={p.x} cy={toSvgY(p.y)} r="2.2" fill={p.team === 'home' ? '#E30613' : '#1f2937'} stroke="#fff" strokeWidth="0.4" />
                <text x={p.x} y={toSvgY(p.y) + 0.8} textAnchor="middle" fontSize="1.6" fill="#fff" fontWeight="bold">
                  {playerById(p.id)?.number}
                </text>
              </g>
            ))}
            {/* ball */}
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
    const homeStats = result.teamStats.home;
    const awayStats = result.teamStats.away;
    return (
      <div className="p-4 md:p-8 space-y-4">
        <h1 className="text-2xl font-semibold text-[#252733]">Resultado final</h1>
        <div className="card-surface p-6 text-center">
          <div className="text-4xl font-bold text-[#252733]">{result.homeScore} - {result.awayScore}</div>
          <div className="text-sm text-[#858A98] mt-1">{result.config.homeName} vs {result.config.awayName}</div>
        </div>
        <div className="card-surface p-4">
          <h3 className="font-semibold text-[#252733] mb-3">Estatísticas</h3>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="text-center font-bold text-[#252733]">{homeStats.possession}</div>
            <div className="text-center text-[#858A98] text-xs">Posse (ticks)</div>
            <div className="text-center font-bold text-[#252733]">{awayStats.possession}</div>
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
        <button onClick={() => { setStep('setup'); setResult(null); }} className="w-full px-4 py-3 rounded-xl bg-[#E30613] text-white font-bold">
          Nova partida
        </button>
      </div>
    );
  }

  return null;
}
