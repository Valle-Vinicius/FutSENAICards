import { useState, useEffect, useRef, useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from '../store/toast';
import { getLatestPoolShotSeq, getPoolMatch, getPoolShotsAfter, getRecentPoolShots, submitShot, abandonPoolMatch } from '../lib/services/pool';
import type { PoolShotEvent } from '../lib/services/pool';
import { getCompetitiveProfile } from '../lib/services/leaderboard';
import { createInitialState, simulateShot } from '../engine/pool/physics';
import { calculateShotTrajectory } from '../engine/pool/trajectory';
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

function compactShotFrames(frames: { balls: { x: number; y: number; pocketed: boolean }[] }[]): number[][] {
  const toRow = (frame: { balls: { x: number; y: number; pocketed: boolean }[] }) => frame.balls.flatMap(ball => (
    ball.pocketed ? [-1, -1] : [Math.round(ball.x * 1000), Math.round(ball.y * 1000)]
  ));
  const anim: number[][] = [];
  for (let i = 0; i < frames.length; i += 4) anim.push(toRow(frames[i]));
  if (frames.length > 0 && (frames.length - 1) % 4 !== 0) anim.push(toRow(frames[frames.length - 1]));
  return anim;
}

function drawPoolTable(
  canvas: HTMLCanvasElement,
  balls: Ball[],
  angle: number,
  showAim: boolean,
  power = 0.5,
  assignments: TableState['assignments'] = { player1: null, player2: null },
  currentPlayer: 1 | 2 = 1,
) {
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

  const cue = balls.find(ball => ball.type === 'cue');
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  if (showAim && cue && !cue.pocketed) {
    const recoil = BALL_RADIUS * (1.8 + power * 5);
    ctx.beginPath();
    ctx.moveTo(offsetX + (cue.x - dirX * (recoil + 0.25)) * scale, offsetY + (cue.y - dirY * (recoil + 0.25)) * scale);
    ctx.lineTo(offsetX + (cue.x - dirX * recoil) * scale, offsetY + (cue.y - dirY * recoil) * scale);
    ctx.strokeStyle = '#d7b17b';
    ctx.lineWidth = Math.max(4, BALL_RADIUS * scale * 0.34);
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  const ownType = assignments[`player${currentPlayer}` as 'player1' | 'player2'];
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

    if (ownType && ball.type === ownType) {
      ctx.beginPath();
      ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,205,83,0.95)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }

  if (showAim && cue && !cue.pocketed) {
    const trajectory = calculateShotTrajectory(balls, angle, power);
    if (!trajectory) return;
    const startX = offsetX + cue.x * scale;
    const startY = offsetY + cue.y * scale;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(offsetX + trajectory.cueEnd.x * scale, offsetY + trajectory.cueEnd.y * scale);
    ctx.strokeStyle = 'rgba(255,255,255,0.72)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.setLineDash([7, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (trajectory.objectBallId !== null) {
      ctx.beginPath();
      ctx.arc(
        offsetX + trajectory.cueEnd.x * scale,
        offsetY + trajectory.cueEnd.y * scale,
        BALL_RADIUS * scale * 1.2,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (trajectory.objectStart && trajectory.objectEnd) {
      ctx.beginPath();
      ctx.moveTo(
        offsetX + trajectory.objectStart.x * scale,
        offsetY + trajectory.objectStart.y * scale,
      );
      ctx.lineTo(
        offsetX + trajectory.objectEnd.x * scale,
        offsetY + trajectory.objectEnd.y * scale,
      );
      ctx.strokeStyle = 'rgba(98,220,255,0.9)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

function formatShotLog(
  shot: PoolShotEvent,
  match: { player1Id: string; player2Id: string },
  names: { player1: string; player2: string },
): string {
  const playerNumber = shot.playerId === match.player1Id ? 1 : 2;
  const playerName = playerNumber === 1 ? names.player1 : names.player2;
  const nextName = shot.nextPlayer === 1 ? names.player1 : names.player2;
  if (shot.foul === null) return `${playerName} está executando a tacada…`;

  if (shot.winner !== null && shot.foulReason === 'eight_early') {
    const winnerName = shot.winner === 1 ? names.player1 : names.player2;
    return `${winnerName} venceu: ${playerName} encaçapou a bola 8 antes de limpar o grupo.`;
  }
  if (shot.winner !== null) {
    const winnerName = shot.winner === 1 ? names.player1 : names.player2;
    return `${winnerName} venceu encaçapando a bola 8.`;
  }

  const foulMessages: Record<string, string> = {
    no_contact: 'a branca não tocou em nenhuma bola',
    wrong_first_ball: 'a branca acertou primeiro uma bola do outro grupo',
    cue_pocketed: 'a branca caiu na caçapa',
    eight_early: 'a bola 8 foi encaçapada antes de limpar o grupo',
  };
  if (shot.foul) {
    const reason = shot.foulReason ? foulMessages[shot.foulReason] ?? 'houve uma falta' : 'houve uma falta';
    return `${playerName} cometeu falta: ${reason}. Vez de ${nextName}.`;
  }

  const objectBalls = shot.pocketed.filter(id => id !== 0);
  const contactedBall = shot.firstContact === null
    ? ''
    : `A branca acertou primeiro a bola ${shot.firstContact === 15 ? '8' : shot.firstContact >= 8 ? shot.firstContact + 1 : shot.firstContact}. `;
  if (objectBalls.length > 0) {
    const labels = objectBalls.map(id => id === 15 ? '8' : id >= 8 ? String(id + 1) : String(id));
    const ballsText = labels.length === 1 ? `a bola ${labels[0]}` : `as bolas ${labels.join(', ')}`;
    return `${contactedBall}${playerName} encaçapou ${ballsText}. ${shot.nextPlayer === playerNumber ? 'Continua jogando.' : `Vez de ${nextName}.`}`;
  }
  return `${contactedBall}${playerName} não encaçapou nenhuma bola. Vez de ${nextName}.`;
}

export default function Pool() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState<any>(null);
  const [state, setState] = useState<TableState | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [playerNames, setPlayerNames] = useState({ player1: 'Jogador 1', player2: 'Jogador 2' });
  const [shotLog, setShotLog] = useState<PoolShotEvent[]>([]);
  const [now, setNow] = useState(0);
  const [howToOpen, setHowToOpen] = useState(() => {
    try { return window.localStorage.getItem('pool-how-to-v1') !== 'seen'; }
    catch { return true; }
  });
  const sessionUserIdRef = useRef<string | null>(null);
  const stateRef = useRef<TableState | null>(null);
  const pendingOfficialStateRef = useRef<TableState | null>(null);
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
  const aimPointerDownRef = useRef(false);

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
        const [name1, name2, recentShots] = await Promise.all([
          getCompetitiveProfile(m.player1Id).then(profile => profile.name).catch(error => {
            console.error('failed to load pool player 1 name', error);
            return 'Jogador 1';
          }),
          getCompetitiveProfile(m.player2Id).then(profile => profile.name).catch(error => {
            console.error('failed to load pool player 2 name', error);
            return 'Jogador 2';
          }),
          getRecentPoolShots(matchId, 12).catch(error => {
            console.error('failed to load pool shot history', error);
            return [];
          }),
        ]);
        setPlayerNames({ player1: name1, player2: name2 });
        setShotLog(recentShots);
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
    drawPoolTable(canvas, state.balls, angle, !shooting, power, state.assignments, state.currentPlayer);
  }, [state, angle, power, shooting]);

  useEffect(() => {
    const updateTime = () => setNow(Date.now());
    updateTime();
    const timer = window.setInterval(updateTime, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const updateAimFromPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!state || shooting || !state.balls) return;
    const cue = state.balls.find(ball => ball.type === 'cue');
    const canvas = event.currentTarget;
    if (!cue || cue.pocketed) return;
    const rect = canvas.getBoundingClientRect();
    const pixelX = (event.clientX - rect.left) * canvas.width / rect.width;
    const pixelY = (event.clientY - rect.top) * canvas.height / rect.height;
    const scale = Math.min((canvas.width - 48) / TABLE_WIDTH, (canvas.height - 48) / TABLE_HEIGHT);
    const offsetX = (canvas.width - TABLE_WIDTH * scale) / 2;
    const offsetY = (canvas.height - TABLE_HEIGHT * scale) / 2;
    const tableX = (pixelX - offsetX) / scale;
    const tableY = (pixelY - offsetY) / scale;
    if (tableX < 0 || tableX > TABLE_WIDTH || tableY < 0 || tableY > TABLE_HEIGHT) return;
    const nextAngle = Math.atan2(tableY - cue.y, tableX - cue.x);
    setAngle((nextAngle + Math.PI * 2) % (Math.PI * 2));
  };

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
      const progress = Math.max(0, Math.min(anim.length - 1, ((performance.now() - t0) / 1000) * 48));
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
        if (shot.playerId !== sessionUserIdRef.current) {
          inFlightShotSeqRef.current = shot.seq;
          const prediction = stateRef.current
            ? simulateShot(stateRef.current, { angle: shot.angle, power: shot.power })
            : null;
          if (prediction) {
            await playAnim(compactShotFrames(prediction.frames));
            if (!pendingOfficialStateRef.current) setState(prediction.finalState);
          } else if (shot.anim?.length) {
            await playAnim(shot.anim);
          }
        }
        inFlightShotSeqRef.current = null;
        lastPlayedShotSeqRef.current = shot.seq;
        advanced = true;
      }

      if (advanced && queuedAnimationsRef.current.size === 0) {
        const pendingOfficialState = pendingOfficialStateRef.current;
        pendingOfficialStateRef.current = null;
        if (pendingOfficialState) {
          setState(pendingOfficialState);
        } else {
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
      const serverShot = submitShot(match.id, angle, power);
      const prediction = simulateShot(state, { angle, power });
      await playAnim(compactShotFrames(prediction.frames));
      const res = await serverShot;
      const recentShots = await getRecentPoolShots(match.id, 12).catch(error => {
        console.error('failed to refresh pool shot history after shot', error);
        return [];
      });
      setShotLog(recentShots);
      if (typeof res?.seq === 'number') {
        lastPlayedShotSeqRef.current = Math.max(lastPlayedShotSeqRef.current, res.seq);
      }
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
    const refreshShotHistory = async () => {
      try {
        setShotLog(await getRecentPoolShots(matchId, 12));
      } catch (error) {
        console.error('pool shot history refresh failed', error);
      }
    };
    const channel = supabase
      .channel(`pool-match-${matchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pool_matches', filter: `id=eq.${matchId}` }, (payload: any) => {
        const row = payload.new;
        if (row?.table_state) {
          const parsed = typeof row.table_state === 'string' ? JSON.parse(row.table_state) : row.table_state;
          const officialState = {
            ...parsed,
            currentPlayer: (row.current_player ?? parsed.currentPlayer ?? 1) as 1 | 2,
          };
          if (shootingRef.current) pendingOfficialStateRef.current = officialState;
          else setState(officialState);
        }
        if (row?.status) {
          setMatch((m: any) => m ? {
            ...m,
            status: row.status,
            currentPlayer: row.current_player,
            turnDeadline: row.turn_deadline,
            winnerId: row.winner_id,
            finishReason: row.finish_reason,
          } : m);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pool_shots', filter: `match_id=eq.${matchId}` }, async (payload: any) => {
        const row = payload.new;
        queueShotAnimation({
          seq: row.seq,
          playerId: row.player_id,
          angle: row.angle,
          power: row.power,
          anim: Array.isArray(row.result?.anim) ? row.result.anim : null,
          pocketed: Array.isArray(row.result?.pocketed) ? row.result.pocketed : [],
          foul: typeof row.result?.foul === 'boolean' ? row.result.foul : null,
          foulReason: typeof row.result?.foulReason === 'string' ? row.result.foulReason : null,
          firstContact: typeof row.result?.firstContact === 'number' ? row.result.firstContact : null,
          nextPlayer: typeof row.result?.nextPlayer === 'number' ? row.result.nextPlayer : null,
          winner: typeof row.result?.winner === 'number' ? row.result.winner : null,
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pool_shots', filter: `match_id=eq.${matchId}` }, () => {
        void refreshShotHistory();
      })
      .subscribe();
    let matchPollCount = 0;
    const interval = setInterval(async () => {
      try {
        matchPollCount += 1;
        if (matchPollCount % 3 === 0) await refreshShotHistory();
        const afterSeq = Math.max(lastPlayedShotSeqRef.current, inFlightShotSeqRef.current ?? 0);
        const newShots = await getPoolShotsAfter(matchId, afterSeq);
        newShots.forEach(queueShotAnimation);
        if (shootingRef.current || queuedAnimationsRef.current.size > 0) return;
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
  const activePlayerNumber = state?.currentPlayer ?? 1;
  const activePlayerName = activePlayerNumber === 1 ? playerNames.player1 : playerNames.player2;
  const activeAssignedType = state?.assignments[`player${activePlayerNumber}` as 'player1' | 'player2'] ?? null;
  const ownBallsRemaining = state && activeAssignedType
    ? state.balls.filter(ball => ball.type === activeAssignedType && !ball.pocketed).length
    : null;
  const remainingSeconds = match?.turnDeadline
    ? Math.max(0, Math.ceil((new Date(match.turnDeadline).getTime() - now) / 1000))
    : null;

  const handleLeave = async () => {
    const message = match.status === 'pending'
      ? 'Cancelar este convite e sair da partida?'
      : 'Sair agora contará como desistência e dará a vitória ao adversário. Deseja continuar?';
    if (!window.confirm(message)) return;
    const abandoned = await abandonPoolMatch(match.id);
    if (!abandoned) {
      toast.alert('Não foi possível encerrar a partida.');
      return;
    }
    navigate('/');
  };

  if (loading) return <div className="p-8 text-[#858A98]">Carregando partida...</div>;
  if (!match || !state) return <div className="p-8 text-[#858A98]">Partida não encontrada.</div>;

  if (match.status === 'pending') {
    return (
      <div className="p-4 md:p-8 space-y-4">
        <div className="card-surface p-4 text-center">
          <div className="font-bold text-[#252733]">{playerNames.player1}</div>
          <div className="text-[#858A98]">vs</div>
          <div className="font-bold text-[#252733]">{playerNames.player2}</div>
        </div>
        <div className="card-surface p-8 text-center text-[#858A98]">
          <div className="text-lg font-black text-[#252733]">Convite enviado</div>
          <div className="mt-2 text-sm">Aguardando {playerNames.player2} aceitar a partida.</div>
          {sessionUserId === match.player1Id && (
            <div className="text-xs mt-2 text-[#858A98]">Você criou o desafio.</div>
          )}
          {sessionUserId === match.player2Id && (
            <div className="text-xs mt-2 text-[#858A98]">Você foi desafiado.</div>
          )}
          <button onClick={handleLeave} className="mt-4 px-4 py-2 rounded-xl border-2 border-[#E9EAF0] text-sm text-[#E30613]">Cancelar partida</button>
        </div>
      </div>
    );
  }

  if (match.status === 'playing' || match.status === 'accepted') {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-4 p-3 sm:p-5 lg:p-6">
        <div className={`card-surface flex flex-wrap items-center justify-between gap-4 border-l-4 p-4 sm:p-5 ${isMyTurn ? 'border-l-[#16834a]' : 'border-l-[#2877db]'}`}>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#858A98]">FutSENAI · PvP</div>
            <h1 className="mt-1 text-xl font-black text-[#252733] sm:text-2xl">Sinuca 8-ball</h1>
            <div className={`mt-2 text-lg font-black ${isMyTurn ? 'text-[#16834a]' : 'text-[#2877db]'}`}>
              {isMyTurn ? 'Sua vez de jogar' : `Vez de ${activePlayerName}`}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-[#626675]">
              {shooting
                ? 'Tacada em andamento… acompanhe as bolas.'
                : !state.assignments.player1
                  ? 'Mesa aberta: a primeira bola encaçapada (exceto a 8) define lisas ou listradas.'
                  : isMyTurn && ownBallsRemaining === 0
                    ? 'Seu grupo acabou. Mire na bola 8 para vencer.'
                    : isMyTurn
                      ? `Encaçape uma bola ${activeAssignedType === 'solid' ? 'lisa' : 'listrada'}; arraste na mesa para mirar.`
                      : `${activePlayerName} está jogando. Observe a última tacada e prepare sua vez.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {remainingSeconds !== null && (
              <div className={`rounded-xl px-4 py-2 text-center ${remainingSeconds <= 10 ? 'bg-[#FFF0F2] text-[#D00010]' : 'bg-[#F7F7F9] text-[#252733]'}`}>
                <div className="text-[10px] font-bold uppercase tracking-wider">Tempo do turno</div>
                <div className="text-xl font-black tabular-nums">{Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, '0')}</div>
              </div>
            )}
            <button onClick={handleLeave} className="rounded-xl border border-[#E9EAF0] px-4 py-2 text-sm font-semibold text-[#E30613] transition hover:bg-[#FFF0F2]">Sair da partida</button>
          </div>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 space-y-3">
            <div className="overflow-hidden rounded-2xl border border-[#624329] bg-[#24160e] p-2 shadow-xl sm:p-4">
              <canvas
                ref={canvasRef}
                width={1000}
                height={540}
                className={`block h-auto w-full rounded-xl ${isMyTurn && !shooting ? 'cursor-crosshair touch-none' : ''}`}
                aria-label="Mesa de sinuca; toque ou arraste para mirar"
                onPointerDown={event => {
                  if (!isMyTurn || shooting) return;
                  aimPointerDownRef.current = true;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  updateAimFromPointer(event);
                }}
                onPointerMove={event => {
                  if (aimPointerDownRef.current && isMyTurn) updateAimFromPointer(event);
                }}
                onPointerUp={() => { aimPointerDownRef.current = false; }}
                onPointerCancel={() => { aimPointerDownRef.current = false; }}
              />
            </div>
            <div className="card-surface flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-xs font-semibold text-[#555967]">
              <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-[#d7353b]" />Lisas <b>1–7</b></span>
              <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full border border-[#d7353b] bg-white shadow-[inset_0_4px_0_#d7353b,inset_0_-4px_0_#d7353b]" />Listradas <b>9–15</b></span>
              <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-[#171717]" />Bola 8</span>
              <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full border border-gray-300 bg-white" />Branca</span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="card-surface space-y-3 p-4 sm:p-5">
              <div className="text-xs font-bold uppercase tracking-wider text-[#858A98]">Jogadores</div>
              {[1, 2].map(player => {
                const playerType = state.assignments[`player${player}` as 'player1' | 'player2'];
                const remaining = playerType
                  ? state.balls.filter(ball => ball.type === playerType && !ball.pocketed).length
                  : null;
                const playerName = player === 1 ? playerNames.player1 : playerNames.player2;
                const active = state.currentPlayer === player;
                return (
                  <div key={player} className={`rounded-xl border p-3 ${active ? 'border-[#E30613] bg-[#FFF8F8]' : 'border-[#E9EAF0] bg-white'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-bold text-[#252733]">{playerName}</span>
                      {active && <span className="shrink-0 rounded-full bg-[#E30613] px-2 py-0.5 text-[10px] font-black uppercase text-white">Jogando</span>}
                    </div>
                    <div className="mt-1 text-xs text-[#626675]">
                      {playerType
                        ? `${playerType === 'solid' ? 'Lisas' : 'Listradas'} · ${remaining} restantes${remaining === 0 ? ' · mire na 8' : ''}`
                        : 'Grupo ainda não definido'}
                    </div>
                  </div>
                );
              })}

              {isMyTurn ? (
                <>
                  <div className="grid grid-cols-3 gap-1 text-center text-[10px] font-black uppercase tracking-wide text-[#626675]">
                    <div className="rounded-lg bg-[#F7F7F9] p-2"><b className="mr-1 text-[#E30613]">1</b>Mire</div>
                    <div className="rounded-lg bg-[#F7F7F9] p-2"><b className="mr-1 text-[#E30613]">2</b>Força</div>
                    <div className="rounded-lg bg-[#F7F7F9] p-2"><b className="mr-1 text-[#E30613]">3</b>Taque</div>
                  </div>
                  <label className="block space-y-2">
                    <span className="flex justify-between text-sm font-semibold text-[#555967]"><span>Ângulo · ajuste fino</span><span>{Math.round(angle * 180 / Math.PI)}°</span></span>
                    <input type="range" min={0} max={6.283} step={0.001} value={angle} onChange={e => setAngle(Number(e.target.value))} className="w-full accent-[#E30613]" disabled={shooting} />
                  </label>
                  <label className="block space-y-2">
                    <span className="flex justify-between text-sm font-semibold text-[#555967]"><span>Força</span><span>{Math.round(power * 100)}%</span></span>
                    <input type="range" min={0.1} max={1} step={0.01} value={power} onChange={e => setPower(Number(e.target.value))} className="w-full accent-[#E30613]" disabled={shooting} />
                  </label>
                  <p className="text-xs text-[#858A98]">Toque ou arraste na mesa para mirar. A projeção considera se a força alcança a bola.</p>
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

            <div className="card-surface p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-[#858A98]">Última jogada</div>
              {shotLog.length > 0
                ? <p className="mt-2 text-sm font-semibold text-[#252733]">{formatShotLog(shotLog[shotLog.length - 1], match, playerNames)}</p>
                : <p className="mt-2 text-sm text-[#858A98]">As tacadas e faltas aparecerão aqui.</p>}
              {shotLog.length > 1 && (
                <details className="mt-3 border-t border-[#E9EAF0] pt-2">
                  <summary className="cursor-pointer text-xs font-bold text-[#555967]">Ver tacadas anteriores</summary>
                  <ol className="mt-2 space-y-2">
                    {shotLog.slice(0, -1).slice(-8).reverse().map(shot => (
                      <li key={shot.seq} className="text-xs text-[#626675]">{formatShotLog(shot, match, playerNames)}</li>
                    ))}
                  </ol>
                </details>
              )}
            </div>

            <div className="card-surface overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  const next = !howToOpen;
                  setHowToOpen(next);
                  if (!next) {
                    try { window.localStorage.setItem('pool-how-to-v1', 'seen'); }
                    catch (error) { console.error('failed to save pool help preference', error); }
                  }
                }}
                className="flex w-full items-center justify-between px-4 py-3 text-left font-bold text-[#252733]"
                aria-expanded={howToOpen}
              >
                Como jogar <span aria-hidden="true">{howToOpen ? '−' : '+'}</span>
              </button>
              {howToOpen && (
                <div className="space-y-2 border-t border-[#E9EAF0] px-4 py-3 text-xs leading-relaxed text-[#626675]">
                  <p>Encaçape lisas ou listradas; a primeira bola válida define seu grupo.</p>
                  <p>Toque primeiro em uma bola do seu grupo. Depois de limpar o grupo, acerte a bola 8.</p>
                  <p>Se não encaçapar uma bola, acertar o grupo errado ou encaçapar a branca, a vez passa ao adversário.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const winnerName = match.winnerId === match.player1Id
    ? playerNames.player1
    : match.winnerId === match.player2Id
      ? playerNames.player2
      : state.winner === 1 ? playerNames.player1 : state.winner === 2 ? playerNames.player2 : null;
  const endMessages: Record<string, string> = {
    declined: 'O convite foi recusado.',
    expired: 'O convite expirou antes de ser aceito.',
    invite_cancelled: 'O convite foi cancelado.',
    invite_declined: 'O convite foi recusado.',
    invite_expired: 'O convite expirou antes de ser aceito.',
    forfeit: 'A partida terminou por desistência.',
    turn_expired: 'A partida terminou porque o tempo do turno acabou.',
    eight_pocketed: 'A bola 8 foi encaçapada corretamente.',
    eight_early: 'A bola 8 foi encaçapada antes de limpar o grupo.',
  };
  const endingText = match.status === 'finished'
    ? `${winnerName ? `${winnerName} venceu.` : 'A partida foi encerrada.'} ${endMessages[match.finishReason] ?? ''}`.trim()
    : match.finishReason === 'forfeit' && winnerName
      ? `${winnerName} venceu por desistência.`
      : endMessages[match.finishReason] ?? (match.status === 'forfeited' ? 'A partida foi encerrada por desistência.' : 'A partida foi encerrada.');

  return (
    <div className="mx-auto max-w-xl p-4 md:p-8">
      <div className="card-surface p-8 text-center">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#858A98]">Sinuca 8-ball</div>
        <h1 className="mt-3 text-2xl font-black text-[#252733]">
          {(match.status === 'finished' || match.status === 'forfeited') && winnerName ? `${winnerName} venceu!` : 'Partida encerrada'}
        </h1>
        <p className="mt-3 text-sm text-[#626675]">{endingText}</p>
        {shotLog.length > 0 && (
          <div className="mt-5 rounded-xl bg-[#F7F7F9] p-3 text-left text-sm text-[#555967]">
            <b>Última jogada:</b> {formatShotLog(shotLog[shotLog.length - 1], match, playerNames)}
          </div>
        )}
        <button onClick={() => navigate('/')} className="mt-6 rounded-xl bg-[#E30613] px-5 py-3 text-sm font-black text-white">Voltar</button>
      </div>
    </div>
  );
}
