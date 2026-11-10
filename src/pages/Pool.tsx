import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from '../store/toast';
import { getLatestPoolShotSeq, getPoolMatch, getPoolShotsAfter, submitShot, abandonPoolMatch } from '../lib/services/pool';
import type { PoolShotEvent } from '../lib/services/pool';
import { createInitialState } from '../engine/pool/physics';
import { TABLE_WIDTH, TABLE_HEIGHT, BALL_RADIUS } from '../engine/pool/types';
import type { Ball, TableState } from '../engine/pool/types';

const BALL_COLORS = [
  '#f4d43b',
  '#2877db',
  '#d7353b',
  '#713cb5',
  '#ed8b2d',
  '#26804a',
  '#8a2938',
  '#171717',
  '#f4d43b',
  '#2877db',
  '#d7353b',
  '#713cb5',
  '#ed8b2d',
  '#26804a',
  '#8a2938',
];

const poolBackgrounds = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

function drawPoolTable(canvas: HTMLCanvasElement, balls: Ball[], angle: number, showAim: boolean) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = canvas;
  const scale = Math.min((width - 48) / TABLE_WIDTH, (height - 48) / TABLE_HEIGHT);
  const tableWidth = TABLE_WIDTH * scale;
  const tableHeight = TABLE_HEIGHT * scale;
  const offsetX = (width - tableWidth) / 2;
  const offsetY = (height - tableHeight) / 2;

  let backgroundCanvas = poolBackgrounds.get(canvas);
  if (!backgroundCanvas || backgroundCanvas.width !== width || backgroundCanvas.height !== height) {
    backgroundCanvas = document.createElement('canvas');
    backgroundCanvas.width = width;
    backgroundCanvas.height = height;
    const backgroundCtx = backgroundCanvas.getContext('2d');
    if (!backgroundCtx) return;

    const wood = backgroundCtx.createLinearGradient(0, 0, width, height);
    wood.addColorStop(0, '#24160e');
    wood.addColorStop(0.5, '#53331c');
    wood.addColorStop(1, '#1d120b');
    backgroundCtx.fillStyle = wood;
    backgroundCtx.fillRect(0, 0, width, height);

    backgroundCtx.save();
    backgroundCtx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    backgroundCtx.shadowBlur = 22;
    backgroundCtx.shadowOffsetY = 10;
    backgroundCtx.fillStyle = '#6f4528';
    backgroundCtx.fillRect(offsetX - 18, offsetY - 18, tableWidth + 36, tableHeight + 36);
    backgroundCtx.restore();

    const felt = backgroundCtx.createLinearGradient(offsetX, offsetY, offsetX + tableWidth, offsetY + tableHeight);
    felt.addColorStop(0, '#187143');
    felt.addColorStop(0.5, '#0f5a35');
    felt.addColorStop(1, '#0b482b');
    backgroundCtx.fillStyle = felt;
    backgroundCtx.fillRect(offsetX, offsetY, tableWidth, tableHeight);

    backgroundCtx.strokeStyle = 'rgba(220, 184, 130, 0.75)';
    backgroundCtx.lineWidth = 2;
    backgroundCtx.strokeRect(offsetX, offsetY, tableWidth, tableHeight);

    const pockets = [
      { x: 0, y: 0 }, { x: TABLE_WIDTH / 2, y: 0 }, { x: TABLE_WIDTH, y: 0 },
      { x: 0, y: TABLE_HEIGHT }, { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT }, { x: TABLE_WIDTH, y: TABLE_HEIGHT },
    ];
    for (const pocket of pockets) {
      const x = offsetX + pocket.x * scale;
      const y = offsetY + pocket.y * scale;
      const radius = Math.max(15, scale * 0.04);
      const rim = backgroundCtx.createRadialGradient(x, y, radius * 0.5, x, y, radius);
      rim.addColorStop(0, '#030806');
      rim.addColorStop(0.72, '#080d0a');
      rim.addColorStop(1, '#b48a58');
      backgroundCtx.beginPath();
      backgroundCtx.arc(x, y, radius, 0, Math.PI * 2);
      backgroundCtx.fillStyle = rim;
      backgroundCtx.fill();
    }
    poolBackgrounds.set(canvas, backgroundCanvas);
  }

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(backgroundCanvas, 0, 0);

  for (const ball of balls) {
    if (ball.pocketed) continue;
    const x = offsetX + ball.x * scale;
    const y = offsetY + ball.y * scale;
    const radius = BALL_RADIUS * scale * 1.2;
    const displayNumber = ball.type === 'eight' ? 8 : ball.type === 'stripe' ? ball.id + 1 : ball.id;
    const color = ball.type === 'cue' ? '#f8f8f4' : BALL_COLORS[displayNumber - 1] ?? '#d7353b';

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = radius * 0.45;
    ctx.shadowOffsetY = radius * 0.2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();

    if (ball.type === 'stripe') {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, radius - 0.5, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#fffdf5';
      ctx.fillRect(x - radius, y - radius * 0.42, radius * 2, radius * 0.84);
      ctx.restore();
    }

    if (ball.type !== 'cue') {
      const badgeRadius = radius * 0.44;
      ctx.beginPath();
      ctx.arc(x, y, badgeRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#fffdf5';
      ctx.fill();
      ctx.strokeStyle = 'rgba(20, 20, 20, 0.5)';
      ctx.lineWidth = Math.max(0.8, radius * 0.06);
      ctx.stroke();
      ctx.fillStyle = '#181818';
      ctx.font = `700 ${Math.max(9, radius * 0.82)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(displayNumber), x, y + 0.5);
    } else {
      const highlight = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.4, 0, x, y, radius);
      highlight.addColorStop(0, 'rgba(255,255,255,0.9)');
      highlight.addColorStop(1, 'rgba(190,195,190,0.1)');
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = highlight;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(12, 16, 13, 0.75)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  const cue = balls.find(ball => ball.type === 'cue');
  if (showAim && cue && !cue.pocketed) {
    const cx = offsetX + cue.x * scale;
    const cy = offsetY + cue.y * scale;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * 120, cy + Math.sin(angle) * 120);
    ctx.strokeStyle = 'rgba(255,255,255,0.72)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export default function Pool() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState<any>(null);
  const [state, setState] = useState<TableState | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const sessionUserIdRef = useRef<string | null>(null);
  const stateRef = useRef<TableState | null>(null);
  const loadedRef = useRef(false);
  const [angle, setAngle] = useState(0);
  const [power, setPower] = useState(0.5);
  const [shooting, setShooting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const queuedAnimationsRef = useRef(new Map<number, PoolShotEvent>());
  const processingAnimationsRef = useRef(false);
  const lastPlayedShotSeqRef = useRef(0);
  const inFlightShotSeqRef = useRef<number | null>(null);
  const localShotPendingRef = useRef(false);
  const processQueuedAnimationsRef = useRef<() => void>(() => undefined);
  // evita abandono indevido em remount do React StrictMode; só abandona no beforeunload real
  const abandonRef = useRef(false);

  useEffect(() => {
    sessionUserIdRef.current = sessionUserId;
  }, [sessionUserId]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!matchId || loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      try {
        let uid: string | null = null;
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          uid = data.session?.user?.id ?? null;
          setSessionUserId(uid);
        }
        lastPlayedShotSeqRef.current = await getLatestPoolShotSeq(matchId);
        const m = await getPoolMatch(matchId);
        console.log('[Pool] loaded match:', m);
        if (!m) { toast.alert('Partida não encontrada.'); navigate('/'); return; }
        setMatch(m);
        const rawState = m.tableState ? (typeof m.tableState === 'string' ? JSON.parse(m.tableState) : m.tableState) : createInitialState();
        const initial = rawState && rawState.balls ? rawState : createInitialState();
        setState({
          ...initial,
          currentPlayer: (m.currentPlayer ?? initial.currentPlayer ?? 1) as 1 | 2,
        });
        setLoading(false);
      } catch (error) {
        console.error('pool match load failed', error);
        toast.alert('Não foi possível carregar a partida.');
        setLoading(false);
      }
    })();
  }, [matchId, navigate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !state) return;
    drawPoolTable(canvas, state.balls, angle, !shooting);
  }, [state, angle, shooting]);

  const shootingRef = useRef(false);
  useEffect(() => { shootingRef.current = shooting; }, [shooting]);
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const playAnim = useCallback((anim: number[][]) => new Promise<void>(resolve => {
    if (anim.length === 0) {
      resolve();
      return;
    }

    const t0 = performance.now();
    const tick = () => {
      const progress = Math.max(0, Math.min(anim.length - 1, ((performance.now() - t0) / 1000) * 60));
      const index = Math.floor(progress);
      const fraction = progress - index;
      const frame = anim[index];
      const nextFrame = anim[Math.min(index + 1, anim.length - 1)];
      const baseBalls = stateRef.current?.balls;
      if (baseBalls && canvasRef.current) {
        const balls = baseBalls.map((ball, ballIndex) => {
          const x = frame[ballIndex * 2];
          const y = frame[ballIndex * 2 + 1];
          const nextX = nextFrame[ballIndex * 2];
          const nextY = nextFrame[ballIndex * 2 + 1];
          if (x === -1) return { ...ball, pocketed: true };
          return {
            ...ball,
            x: (x + (nextX === -1 ? x : (nextX - x) * fraction)) / 1000,
            y: (y + (nextY === -1 ? y : (nextY - y) * fraction)) / 1000,
            pocketed: false,
          };
        });
        drawPoolTable(canvasRef.current, balls, 0, false);
      }
      if (index < anim.length - 1) rafRef.current = requestAnimationFrame(tick);
      else resolve();
    };
    rafRef.current = requestAnimationFrame(tick);
  }), []);

  const addQueuedShot = useCallback((shot: PoolShotEvent) => {
    if (shot.playerId === sessionUserIdRef.current && localShotPendingRef.current) return;
    const newestKnownSeq = Math.max(lastPlayedShotSeqRef.current, inFlightShotSeqRef.current ?? 0);
    if (shot.seq <= newestKnownSeq || queuedAnimationsRef.current.has(shot.seq)) return;
    queuedAnimationsRef.current.set(shot.seq, shot);
  }, []);

  const processQueuedAnimations = useCallback(async () => {
    if (processingAnimationsRef.current || localShotPendingRef.current || !matchId) return;
    processingAnimationsRef.current = true;
    try {
      let advanced = false;
      while (true) {
        const nextSeq = Math.max(lastPlayedShotSeqRef.current, inFlightShotSeqRef.current ?? 0) + 1;
        let shot = queuedAnimationsRef.current.get(nextSeq);
        if (!shot && queuedAnimationsRef.current.size > 0) {
          const missingShots = await getPoolShotsAfter(matchId, lastPlayedShotSeqRef.current);
          missingShots.forEach(addQueuedShot);
          shot = queuedAnimationsRef.current.get(nextSeq);
        }
        if (!shot) break;
        queuedAnimationsRef.current.delete(nextSeq);
        shootingRef.current = true;
        setShooting(true);
        if (shot.playerId !== sessionUserIdRef.current && shot.anim?.length) {
          inFlightShotSeqRef.current = shot.seq;
          await playAnim(shot.anim);
        }
        inFlightShotSeqRef.current = null;
        lastPlayedShotSeqRef.current = shot.seq;
        advanced = true;
      }

      if (advanced && queuedAnimationsRef.current.size === 0) {
        const fresh = await getPoolMatch(matchId);
        if (fresh?.tableState && queuedAnimationsRef.current.size === 0) {
          const parsed = typeof fresh.tableState === 'string' ? JSON.parse(fresh.tableState) : fresh.tableState;
          setState({
            ...parsed,
            currentPlayer: (fresh.currentPlayer ?? 1) as 1 | 2,
          });
          setMatch(fresh);
        }
      }
    } catch (error) {
      console.error('opponent shot animation failed', error);
    } finally {
      processingAnimationsRef.current = false;
      const nextSeq = lastPlayedShotSeqRef.current + 1;
      if (queuedAnimationsRef.current.has(nextSeq)) {
        processQueuedAnimationsRef.current();
      } else {
        shootingRef.current = false;
        setShooting(false);
      }
    }
  }, [addQueuedShot, matchId, playAnim]);

  useEffect(() => {
    processQueuedAnimationsRef.current = () => { void processQueuedAnimations(); };
  }, [processQueuedAnimations]);

  const queueShotAnimation = useCallback((shot: PoolShotEvent) => {
    addQueuedShot(shot);
    void processQueuedAnimations();
  }, [addQueuedShot, processQueuedAnimations]);

  const handleShoot = async () => {
    if (shooting || !state || !match || !state.balls) return;
    if (sessionUserId === null) return;
    const myNumber = sessionUserId === match.player1Id ? 1 : sessionUserId === match.player2Id ? 2 : null;
    if (myNumber === null || myNumber !== state.currentPlayer) return;
    localShotPendingRef.current = true;
    shootingRef.current = true;
    setShooting(true);
    try {
      const res = await submitShot(match.id, angle, power);
      if (typeof res?.seq === 'number') {
        lastPlayedShotSeqRef.current = Math.max(lastPlayedShotSeqRef.current, res.seq);
      }
      if (res?.anim) await playAnim(res.anim);
      if (res?.finalState) {
        setState({
          ...res.finalState,
          currentPlayer: (res.finalState.currentPlayer ?? 1) as 1 | 2,
        });
        const fresh = await getPoolMatch(match.id);
        if (fresh) setMatch(fresh);
      } else {
        toast.alert(res?.error ?? 'Não foi possível validar a tacada.');
        const fresh = await getPoolMatch(match.id);
        if (fresh?.tableState) {
          const parsed = typeof fresh.tableState === 'string' ? JSON.parse(fresh.tableState) : fresh.tableState;
          setState({
            ...parsed,
            currentPlayer: (fresh.currentPlayer ?? parsed.currentPlayer ?? 1) as 1 | 2,
          });
        } else setState(createInitialState());
      }
    } catch (e) {
      console.error('shot failed', e);
      toast.alert('Erro na tacada.');
    } finally {
      localShotPendingRef.current = false;
      shootingRef.current = false;
      setShooting(false);
      if (queuedAnimationsRef.current.size > 0) void processQueuedAnimations();
    }
  };

  useEffect(() => {
    if (!matchId || !supabase || loading) return;
    const channel = supabase
      .channel(`pool-match-${matchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pool_matches', filter: `id=eq.${matchId}` }, (payload: any) => {
        const row = payload.new;
        if (shootingRef.current) return; // não sobrescrever durante animação
        if (row?.table_state) {
          const parsed = typeof row.table_state === 'string' ? JSON.parse(row.table_state) : row.table_state;
          setState(prev => ({
            ...parsed,
            currentPlayer: ((row as any).current_player ?? prev?.currentPlayer ?? parsed.currentPlayer ?? 1) as 1 | 2,
          }));
        }
        if (row?.status) {
          setMatch((m: any) => m ? { ...m, status: row.status, currentPlayer: row.current_player, turnDeadline: row.turn_deadline, winnerId: row.winner_id } : m);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pool_shots', filter: `match_id=eq.${matchId}` }, async (payload: any) => {
        const row = payload.new;
        queueShotAnimation({
          seq: row.seq,
          playerId: row.player_id,
          anim: Array.isArray(row.result?.anim) ? row.result.anim : null,
        });
      })
      .subscribe();
    let matchPollCount = 0;
    const interval = setInterval(async () => {
      try {
        const afterSeq = Math.max(lastPlayedShotSeqRef.current, inFlightShotSeqRef.current ?? 0);
        const newShots = await getPoolShotsAfter(matchId, afterSeq);
        newShots.forEach(queueShotAnimation);
        if (shootingRef.current || queuedAnimationsRef.current.size > 0) return;
        matchPollCount += 1;
        if (matchPollCount % 3 !== 0) return;
        const m = await getPoolMatch(matchId);
        if (m) {
          setMatch(m);
          if (m.tableState) {
            const parsed = typeof m.tableState === 'string' ? JSON.parse(m.tableState) : m.tableState;
            setState(prev => {
              if (newShots.length > 0 || (prev && prev.currentPlayer === (m.currentPlayer ?? parsed.currentPlayer ?? 1))) return prev;
              return {
                ...parsed,
                currentPlayer: (m.currentPlayer ?? parsed.currentPlayer ?? 1) as 1 | 2,
              };
            });
          }
        }
      } catch (error) {
        console.error('pool match polling failed', error);
      }
    }, 1000);
    return () => { supabase!.removeChannel(channel); clearInterval(interval); };
  }, [matchId, loading, queueShotAnimation]);

  useEffect(() => {
    const onBeforeUnload = () => {
      abandonRef.current = true;
      // só abandona se a partida ainda não começou (pending). Se já está playing,
      // deixa expirar pelo timeout do servidor para não prejudicar o adversário.
      if (matchId && match?.status === 'pending') {
        abandonPoolMatch(matchId);
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [matchId, match]);

  const isMatchActive = match?.status === 'accepted' || match?.status === 'playing';
  const myNumber = sessionUserId !== null && match
    ? sessionUserId === match.player1Id ? 1 : sessionUserId === match.player2Id ? 2 : null
    : null;
  const isMyTurn = isMatchActive && state !== null && myNumber !== null && myNumber === state.currentPlayer;

  if (loading) return <div className="p-8 text-[#858A98]">Carregando partida...</div>;
  if (!match || !state) return <div className="p-8 text-[#858A98]">Partida não encontrada.</div>;

  if (match.status === 'pending') {
    return (
      <div className="p-4 md:p-8 space-y-4">
        <div className="card-surface p-4 text-center">
          <div className="font-bold text-[#252733]">Jogador 1</div>
          <div className="text-[#858A98]">vs</div>
          <div className="font-bold text-[#252733]">Jogador 2</div>
        </div>
        <div className="card-surface p-8 text-center text-[#858A98]">
          <div className="text-sm">Aguardando aceite do adversário...</div>
          {sessionUserId === match.player1Id && (
            <div className="text-xs mt-2 text-[#858A98]">Você é o jogador 1 (criou o desafio).</div>
          )}
          {sessionUserId === match.player2Id && (
            <div className="text-xs mt-2 text-[#858A98]">Você é o jogador 2 (foi desafiado).</div>
          )}
          <button onClick={async () => { await abandonPoolMatch(match.id); navigate('/'); }} className="mt-4 px-4 py-2 rounded-xl border-2 border-[#E9EAF0] text-sm text-[#E30613]">Cancelar partida</button>
        </div>
      </div>
    );
  }

  if (match.status === 'playing' || match.status === 'accepted') {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-4 p-3 sm:p-5 lg:p-6">
        <div className="card-surface flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#858A98]">FutSENAI · PvP</div>
            <h1 className="mt-1 text-xl font-black text-[#252733] sm:text-2xl">Sinuca 8-ball</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl bg-[#F7F7F9] px-4 py-2 text-sm font-bold text-[#252733]">
              Vez do jogador {state.currentPlayer}
              {myNumber === state.currentPlayer && <span className="ml-2 text-[#16834a]">· Sua vez</span>}
            </div>
            <button onClick={async () => { await abandonPoolMatch(match.id); navigate('/'); }} className="rounded-xl border border-[#E9EAF0] px-4 py-2 text-sm font-semibold text-[#E30613] transition hover:bg-[#FFF0F2]">Sair da partida</button>
          </div>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 space-y-3">
            <div className="overflow-hidden rounded-2xl border border-[#624329] bg-[#24160e] p-2 shadow-xl sm:p-4">
              <canvas ref={canvasRef} width={1000} height={540} className="block h-auto w-full rounded-xl" aria-label="Mesa de sinuca com bolas numeradas" />
            </div>
            <div className="card-surface flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-xs font-semibold text-[#555967]">
              <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-[#d7353b]" />Lisas <b>1–7</b></span>
              <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full border border-[#d7353b] bg-white shadow-[inset_0_4px_0_#d7353b,inset_0_-4px_0_#d7353b]" />Listradas <b>9–15</b></span>
              <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-[#171717]" />Bola 8</span>
              <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full border border-gray-300 bg-white" />Branca</span>
            </div>
            <div className="px-1 text-xs text-[#858A98]">
              {state.assignments.player1
                ? `Jogador 1: ${state.assignments.player1 === 'solid' ? 'lisas' : 'listradas'} · Jogador 2: ${state.assignments.player2 === 'solid' ? 'lisas' : 'listradas'}`
                : 'Mesa aberta: a primeira bola encaçapada define lisas ou listradas.'}
            </div>
          </div>

          <div className="space-y-4">
            <div className="card-surface space-y-4 p-4 sm:p-5">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#858A98]">Jogadores</div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className={`rounded-xl px-3 py-2 text-sm font-bold ${state.currentPlayer === 1 ? 'bg-[#FFF0F2] text-[#E30613]' : 'bg-[#F7F7F9] text-[#555967]'}`}>Jogador 1</div>
                  <span className="text-xs font-bold text-[#a2a5af]">VS</span>
                  <div className={`rounded-xl px-3 py-2 text-sm font-bold ${state.currentPlayer === 2 ? 'bg-[#FFF0F2] text-[#E30613]' : 'bg-[#F7F7F9] text-[#555967]'}`}>Jogador 2</div>
                </div>
              </div>
              {isMyTurn ? (
                <>
                  <label className="block space-y-2">
                    <span className="flex justify-between text-sm font-semibold text-[#555967]"><span>Ângulo</span><span>{Math.round(angle * 180 / Math.PI)}°</span></span>
                    <input type="range" min={0} max={6.28} step={0.01} value={angle} onChange={e => setAngle(Number(e.target.value))} className="w-full accent-[#E30613]" disabled={shooting} />
                  </label>
                  <label className="block space-y-2">
                    <span className="flex justify-between text-sm font-semibold text-[#555967]"><span>Força</span><span>{Math.round(power * 100)}%</span></span>
                    <input type="range" min={0.1} max={1} step={0.01} value={power} onChange={e => setPower(Number(e.target.value))} className="w-full accent-[#E30613]" disabled={shooting} />
                  </label>
                  <button onClick={handleShoot} disabled={shooting} className="w-full rounded-xl bg-[#E30613] py-3 font-black tracking-wide text-white shadow-lg shadow-red-900/15 transition hover:bg-[#c9000c] disabled:cursor-not-allowed disabled:opacity-60">
                    {shooting ? 'ANIMANDO TACADA…' : 'TACAR'}
                  </button>
                </>
              ) : (
                <div className="rounded-xl bg-[#F7F7F9] p-4 text-center text-sm font-medium text-[#858A98]">
                  {shooting ? 'A bola está rolando…' : 'Aguardando a vez do adversário…'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 text-center text-[#858A98]">
      Partida finalizada ou cancelada.
      <button onClick={() => navigate('/')} className="mt-4 px-4 py-2 rounded-xl bg-[#E30613] text-white text-sm">Voltar</button>
    </div>
  );
}
