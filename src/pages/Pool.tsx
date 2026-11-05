import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from '../store/toast';
import { getPoolMatch, submitShot } from '../lib/services/pool';
import { createInitialState, simulateShot } from '../engine/pool/physics';
import { TABLE_WIDTH, TABLE_HEIGHT, BALL_RADIUS } from '../engine/pool/types';
import type { TableState } from '../engine/pool/types';

export default function Pool() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState<any>(null);
  const [state, setState] = useState<TableState | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);
  const [angle, setAngle] = useState(0);
  const [power, setPower] = useState(0.5);
  const [shooting, setShooting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!matchId || loadedRef.current) return;
    loadedRef.current = true;
    getPoolMatch(matchId).then(async m => {
      if (!m) { toast.alert('Partida não encontrada.'); navigate('/'); return; }
      setMatch(m);
      setState(m.tableState ? JSON.parse(m.tableState) : createInitialState());
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        setCurrentUserId(data.session?.user?.id ?? null);
      }
      setLoading(false);
    });
  }, [matchId, navigate]);

  useEffect(() => {
    if (!matchId || !supabase) return;
    const channel = supabase
      .channel(`pool-match-${matchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pool_matches', filter: `id=eq.${matchId}` }, (payload: any) => {
        const row = payload.new;
        if (row?.table_state) {
          setState(JSON.parse(row.table_state));
        }
        if (row?.status === 'finished') {
          // show result
        }
      })
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
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
      // table
      ctx.fillStyle = '#1a5c2a';
      ctx.fillRect(offsetX, offsetY, TABLE_WIDTH * scale, TABLE_HEIGHT * scale);
      ctx.strokeStyle = '#0d3b1a';
      ctx.lineWidth = 4;
      ctx.strokeRect(offsetX, offsetY, TABLE_WIDTH * scale, TABLE_HEIGHT * scale);
      // pockets
      const pockets = [{ x: 0, y: 0 }, { x: TABLE_WIDTH / 2, y: 0 }, { x: TABLE_WIDTH, y: 0 }, { x: 0, y: TABLE_HEIGHT }, { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT }, { x: TABLE_WIDTH, y: TABLE_HEIGHT }];
      for (const pk of pockets) {
        ctx.beginPath();
        ctx.arc(offsetX + pk.x * scale, offsetY + pk.y * scale, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#000';
        ctx.fill();
      }
      // balls
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
      // aim line
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

  const handleShoot = async () => {
    if (shooting || !state || !match) return;
    const isMyTurn = (state.currentPlayer === 1 && currentUserId === match.player1_id) || (state.currentPlayer === 2 && currentUserId === match.player2_id);
    if (!isMyTurn) return;
    setShooting(true);
    try {
      const result = simulateShot(state, { angle, power });
      // animate frames
      let i = 0;
      const animate = () => {
        if (i >= result.frames.length) {
          setState(result.finalState || state);
          setShooting(false);
          // sync with server
          submitShot(match.id, angle, power).then(serverRes => {
            if (serverRes && serverRes.finalState) {
              setState(serverRes.finalState);
            }
          }).catch(() => {});
          return;
        }
        setState(prev => prev ? { ...prev, balls: result.frames[i].balls.map((b, idx) => ({ ...prev.balls[idx], x: b.x, y: b.y, pocketed: b.pocketed })) } : prev);
        i++;
        rafRef.current = requestAnimationFrame(animate);
      };
      if (result.frames.length === 0) {
        setState(result.finalState || state);
        setShooting(false);
      } else {
        animate();
      }
    } catch (e) {
      console.error('shot failed', e);
      setShooting(false);
    }
  };

  const isMyTurn = state ? ((state.currentPlayer === 1 && currentUserId === match?.player1_id) || (state.currentPlayer === 2 && currentUserId === match?.player2_id)) : false;
  if (loading) return <div className="p-8 text-[#858A98]">Carregando partida...</div>;
  if (!match || !state) return <div className="p-8 text-[#858A98]">Partida não encontrada.</div>;

  return (
    <div className="p-4 md:p-8 space-y-4">
      <div className="card-surface p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div className="font-bold text-[#252733]">Jogador 1</div>
          <div className="text-[#858A98]">vs</div>
          <div className="font-bold text-[#252733]">Jogador 2</div>
        </div>
        <div className="text-xs text-[#858A98] text-center">Vez: Jogador {state.currentPlayer} · {state.assignments.player1 ? `Lisas/Listradas definidas` : 'Definindo...'}</div>
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
          Aguardando a vez do adversário...
        </div>
      )}
    </div>
  );
}
