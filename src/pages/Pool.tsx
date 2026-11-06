import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from '../store/toast';
import { getPoolMatch, submitShot, abandonPoolMatch } from '../lib/services/pool';
import { createInitialState, simulateShot } from '../engine/pool/physics';
import { TABLE_WIDTH, TABLE_HEIGHT, BALL_RADIUS } from '../engine/pool/types';
import type { TableState } from '../engine/pool/types';

export default function Pool() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState<any>(null);
  const [state, setState] = useState<TableState | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const [angle, setAngle] = useState(0);
  const [power, setPower] = useState(0.5);
  const [shooting, setShooting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  // evita abandono indevido em remount do React StrictMode; só abandona no beforeunload real
  const abandonRef = useRef(false);

  useEffect(() => {
    if (!matchId || loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      let uid: string | null = null;
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        uid = data.session?.user?.id ?? null;
        setSessionUserId(uid);
      }
      const m = await getPoolMatch(matchId);
      console.log('[Pool] loaded match:', m);
      if (!m) { toast.alert('Partida não encontrada.'); navigate('/'); return; }
      setMatch(m);
      const rawState = m.tableState ? JSON.parse(m.tableState) : createInitialState();
      const initial = rawState && rawState.balls ? rawState : createInitialState();
      setState({
        ...initial,
        currentPlayer: (m.currentPlayer ?? initial.currentPlayer ?? 1) as 1 | 2,
      });
      setLoading(false);
    })();
  }, [matchId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !state) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scale = Math.min(canvas.width / TABLE_WIDTH, canvas.height / TABLE_HEIGHT);
    const offsetX = (canvas.width - TABLE_WIDTH * scale) / 2;
    const offsetY = (canvas.height - TABLE_HEIGHT * scale) / 2;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#1a5c2a';
      ctx.fillRect(offsetX, offsetY, TABLE_WIDTH * scale, TABLE_HEIGHT * scale);
      ctx.strokeStyle = '#0d3b1a';
      ctx.lineWidth = 4;
      ctx.strokeRect(offsetX, offsetY, TABLE_WIDTH * scale, TABLE_HEIGHT * scale);
      const pockets = [
        { x: 0, y: 0 }, { x: TABLE_WIDTH / 2, y: 0 }, { x: TABLE_WIDTH, y: 0 },
        { x: 0, y: TABLE_HEIGHT }, { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT }, { x: TABLE_WIDTH, y: TABLE_HEIGHT },
      ];
      for (const pk of pockets) {
        ctx.beginPath();
        ctx.arc(offsetX + pk.x * scale, offsetY + pk.y * scale, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#000';
        ctx.fill();
      }
      for (const b of state.balls) {
        if (b.pocketed) continue;
        const x = offsetX + b.x * scale;
        const y = offsetY + b.y * scale;
        ctx.beginPath();
        ctx.arc(x, y, BALL_RADIUS * scale, 0, Math.PI * 2);
        ctx.fillStyle = b.type === 'cue' ? '#fff' : b.type === 'eight' ? '#000' : b.type === 'solid' ? '#dc3847' : '#fff';
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.stroke();
        if (b.id > 0) {
          ctx.fillStyle = b.type === 'stripe' ? '#000' : '#fff';
          ctx.font = `${Math.max(8, BALL_RADIUS * scale * 0.8)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(b.id), x, y);
        }
      }
      if (!shooting && state.balls[0] && !state.balls[0].pocketed) {
        const cue = state.balls[0];
        const cx = offsetX + cue.x * scale;
        const cy = offsetY + cue.y * scale;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * 100, cy + Math.sin(angle) * 100);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    };
    draw();
  }, [state, angle, shooting]);

  const shootingRef = useRef(false);
  useEffect(() => { shootingRef.current = shooting; }, [shooting]);
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const handleShoot = async () => {
    if (shooting || !state || !match || !state.balls) return;
    if (sessionUserId === null) return;
    const myNumber = sessionUserId === match.player1Id ? 1 : sessionUserId === match.player2Id ? 2 : null;
    if (myNumber === null || myNumber !== state.currentPlayer) return;
    setShooting(true);
    try {
      const result = simulateShot(state, { angle, power });
      const frames = result.frames;
      const serverPromise = submitShot(match.id, angle, power);

      if (frames.length > 0) {
        const t0 = performance.now();
        await new Promise<void>(resolve => {
          const tick = (now: number) => {
            const idx = Math.max(0, Math.min(frames.length - 1, Math.floor(((now - t0) / 1000) * 60)));
            const frame = frames[idx];
            if (!frame) return;
            setState(prev => prev && prev.balls ? ({
              ...prev,
              balls: prev.balls.map((b, k) => ({ ...b, x: frame.balls[k]?.x ?? b.x, y: frame.balls[k]?.y ?? b.y, pocketed: frame.balls[k]?.pocketed ?? b.pocketed })),
            }) : prev);
            if (idx < frames.length - 1) rafRef.current = requestAnimationFrame(tick); else resolve();
          };
          rafRef.current = requestAnimationFrame(tick);
        });
      }

      const res = await serverPromise;
      if (res?.finalState) {
        setState({
          ...res.finalState,
          currentPlayer: (res.finalState.currentPlayer ?? match.currentPlayer ?? 1) as 1 | 2,
        });
      } else {
        toast.alert(res?.error ?? 'Não foi possível validar a tacada.');
        const fresh = await getPoolMatch(match.id);
        if (fresh?.tableState) {
          const parsed = JSON.parse(fresh.tableState);
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
      setShooting(false);
    }
  };

  useEffect(() => {
    if (!matchId || !supabase) return;
    const channel = supabase
      .channel(`pool-match-${matchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pool_matches', filter: `id=eq.${matchId}` }, (payload: any) => {
        const row = payload.new;
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
      .subscribe();
    const interval = setInterval(async () => {
      const m = await getPoolMatch(matchId);
      if (m) {
        setMatch(m);
        if (m.tableState) {
          const parsed = JSON.parse(m.tableState);
          setState({
            ...parsed,
            currentPlayer: (m.currentPlayer ?? parsed.currentPlayer ?? 1) as 1 | 2,
          });
        }
      }
    }, 3000);
    return () => { supabase!.removeChannel(channel); clearInterval(interval); };
  }, [matchId]);

  useEffect(() => {
    const onBeforeUnload = () => {
      abandonRef.current = true;
      if (matchId && (match?.status === 'pending' || match?.status === 'accepted' || match?.status === 'playing')) {
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
      <div className="p-4 md:p-8 space-y-4">
        <div className="card-surface p-4 space-y-3">
          <div className="flex justify-between items-center">
            <div className="font-bold text-[#252733]">Jogador 1</div>
            <div className="text-[#858A98]">vs</div>
            <div className="font-bold text-[#252733]">Jogador 2</div>
          </div>
          <div className="text-xs text-[#858A98] text-center">
            Vez: Jogador {state.currentPlayer} · {state.assignments.player1 ? `Lisas/Listradas definidas` : 'Mesa aberta: a primeira bola enfiada define lisas ou listradas'}
          </div>
          <button onClick={async () => { await abandonPoolMatch(match.id); navigate('/'); }} className="w-full py-2 rounded-xl border-2 border-[#E9EAF0] text-sm text-[#E30613]">Sair da partida</button>
        </div>

        <div className="card-surface p-2">
          <canvas ref={canvasRef} width={600} height={300} className="w-full rounded-xl" style={{ background: '#1a5c2a' }} />
        </div>

        {isMyTurn ? (
          <div className="card-surface p-4 space-y-3">
            <div className="flex items-center gap-4">
              <label className="text-sm text-[#858A98]">Ângulo</label>
              <input type="range" min={0} max={6.28} step={0.01} value={angle} onChange={e => setAngle(Number(e.target.value))} className="flex-1" disabled={shooting} />
            </div>
            <div className="flex items-center gap-4">
              <label className="text-sm text-[#858A98]">Força</label>
              <input type="range" min={0.1} max={1} step={0.01} value={power} onChange={e => setPower(Number(e.target.value))} className="flex-1" disabled={shooting} />
            </div>
            <button onClick={handleShoot} disabled={shooting} className="w-full py-3 rounded-xl bg-[#E30613] text-white font-bold disabled:opacity-60">
              {shooting ? 'Simulando...' : 'TACADA'}
            </button>
          </div>
        ) : (
          <div className="card-surface p-4 text-center text-sm text-[#858A98]">
            Aguardando a vez do adversário…
          </div>
        )}
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
