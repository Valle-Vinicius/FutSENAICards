import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../store/useGame';
import { playBurst } from '../lib/sound';
import Card from '../components/Card';
import type { PlayerCard } from '../types';
import { RARITY_META } from '../types';

// ---------- Particle canvas ----------
function ParticleBurst({ fire, color }: { fire: boolean; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    if (!fire) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    const W = canvas.width, H = canvas.height;
    const particles: { x: number; y: number; vx: number; vy: number; life: number; size: number; hue: string }[] = [];
    const colors = [color, '#ffffff', '#f5c542', '#a855f7', '#3b82f6', '#b6ff3b'];
    for (let i = 0; i < 120; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 6;
      particles.push({
        x: W / 2, y: H / 2,
        vx: Math.cos(ang) * spd * 2,
        vy: Math.sin(ang) * spd * 2,
        life: 1,
        size: 2 + Math.random() * 4,
        hue: colors[Math.floor(Math.random() * colors.length)],
      });
    }
    const start = performance.now();
    const tick = (now: number) => {
      const dt = (now - start) / 1000;
      ctx.clearRect(0, 0, W, H);
      let alive = false;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        p.vx *= 0.98;
        p.life -= 0.012;
        if (p.life <= 0) continue;
        alive = true;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.hue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (alive && dt < 3) rafRef.current = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W, H);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [fire, color]);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-20" />;
}

export default function OpenPack() {
  const { packId } = useParams();
  const navigate = useNavigate();
  const packs = useGame(s => s.packConfigs);
  const openPack = useGame(s => s.openPack);
  const previewPack = useGame(s => s.previewPack);
  const claimPreviewedCard = useGame(s => s.claimPreviewedCard);
  const pack = packs.find(p => p.id === packId);

  const [phase, setPhase] = useState<'idle'|'charging'|'burst'|'reveal'|'summary'|'choice'>('idle');
  const [cards, setCards] = useState<PlayerCard[]>([]);
  const [choiceCards, setChoiceCards] = useState<PlayerCard[]>([]);
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [skip, setSkip] = useState(false);
  const [burstFire, setBurstFire] = useState(false);
  const [shake, setShake] = useState(false);

  if (!pack) return <div className="p-8">Pacote não encontrado.</div>;

  const isChoice = !!pack.choice;

  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const startOpen = () => {
    if (phase !== 'idle') return;
    if (isChoice) {
      const res = previewPack(pack.id);
      if (!res) { alert('Saldo insuficiente.'); return; }
      setChoiceCards(res);
      setPhase('choice');
      return;
    }
    const res = openPack(pack.id);
    if (!res) { alert('Saldo insuficiente.'); return; }
    setCards(res.cards);
    setRevealed(new Array(res.cards.length).fill(false));
    if (skip || reduceMotion) {
      setRevealed(new Array(res.cards.length).fill(true));
      setPhase('summary');
      return;
    }
    setPhase('charging');
    setShake(true);
    setTimeout(() => { setShake(false); setPhase('burst'); setBurstFire(true); if (useGame.getState().settings.audio) playBurst(); }, 1100);
    setTimeout(() => { setBurstFire(false); setPhase('reveal'); }, 2000);
  };

  const revealCard = (i: number) => {
    setRevealed(prev => { const n = [...prev]; n[i] = true; return n; });
  };
  const revealAll = () => setRevealed(new Array(cards.length).fill(true));
  const allRevealed = revealed.length > 0 && revealed.every(Boolean);
  const goToSummary = () => setPhase('summary');

  const packColor = pack.color || '#E30613';

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-4 relative overflow-hidden rounded-2xl">
      {/* dark stage during animation */}
      <AnimatePresence>
        {(phase === 'charging' || phase === 'burst' || phase === 'reveal') && (
          <motion.div
            key="stage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-gradient-to-b from-[#05060a] via-[#0a0d14] to-[#05060a]"
          />
        )}
      </AnimatePresence>

      {/* ambient light rays */}
      <AnimatePresence>
        {phase === 'charging' && (
          <motion.div
            key="rays"
            initial={{ opacity: 0, rotate: 0 }}
            animate={{ opacity: 0.6, rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `conic-gradient(from 0deg, transparent 0deg, ${packColor}33 20deg, transparent 40deg, ${packColor}22 80deg, transparent 100deg)`,
            }}
          />
        )}
      </AnimatePresence>

      <ParticleBurst fire={burstFire} color={packColor} />

      {/* flash */}
      <AnimatePresence>
        {phase === 'burst' && (
          <motion.div
            key="flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 bg-white pointer-events-none z-30"
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {phase === 'idle' && (
          <motion.div key="idle" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex flex-col items-center gap-6 relative z-10">
            <motion.div
              animate={{ y: [0, -10, 0], rotate: [0, -2, 2, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="text-9xl drop-shadow-2xl"
            >
              📦
            </motion.div>
            <div className="text-2xl font-black" style={{ color: packColor }}>{pack.name}</div>
            <div className="text-[#858A98] text-sm">{pack.cards} cartas · {pack.price === 0 ? 'Evento' : pack.price.toLocaleString('pt-BR') + ' moedas'}</div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={startOpen}
              className="px-10 py-4 rounded-2xl text-white font-black text-lg shadow-lg"
              style={{ background: `linear-gradient(135deg, ${packColor}, #000)` }}
            >
              ABRIR PACOTE
            </motion.button>
            <label className="flex items-center gap-2 text-xs text-[#858A98]">
              <input type="checkbox" checked={skip} onChange={e => setSkip(e.target.checked)} />
              Pular animação
            </label>
          </motion.div>
        )}

        {phase === 'charging' && (
          <motion.div key="charging" className="flex flex-col items-center gap-6 relative z-10">
            <motion.div
              animate={shake ? { x: [0,-12,12,-10,10,-6,6,-3,3,0], y: [0,6,-6,4,-4,2,-2,0], rotate: [0,-6,6,-4,4,-2,2,0], scale: [1,1.1,1.05,1.12,1] } : {}}
              transition={{ duration: 1.1 }}
              className="text-9xl"
            >
              📦
            </motion.div>
            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 0.6, repeat: Infinity }}
              className="text-xl font-black"
              style={{ color: packColor }}
            >
              ABRINDO...
            </motion.div>
            <div className="w-64 h-2 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 1.1, ease: 'easeInOut' }}
                className="h-full rounded-full"
                style={{ background: packColor }}
              />
            </div>
          </motion.div>
        )}

        {phase === 'burst' && (
          <motion.div key="burst" className="flex flex-col items-center justify-center relative z-10">
            <motion.div
              initial={{ scale: 0.2, opacity: 0, rotate: -180 }}
              animate={{ scale: [0.2, 1.8, 1], opacity: [0, 1, 1], rotate: [ -180, 0, 0] }}
              transition={{ duration: 0.9, ease: 'backOut' }}
              className="text-9xl"
            >
              💥
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-4 text-3xl font-black"
              style={{ color: packColor, textShadow: `0 0 20px ${packColor}` }}
            >
              PACOTE ABERTO!
            </motion.div>
          </motion.div>
        )}

        {phase === 'choice' && (
          <motion.div key="choice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-6 relative z-10">
            <div className="text-2xl font-black text-[#E30613]">ESCOLHA SUA CARTA</div>
            <div className="flex flex-wrap justify-center gap-5">
              {choiceCards.map(c => (
                <motion.div key={c.uid} whileHover={{ scale: 1.05 }} onClick={() => { claimPreviewedCard(c); setPhase('summary'); setCards([c]); setRevealed([true]); }} className="cursor-pointer">
                  <Card card={c} size="md" />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
        {phase === 'reveal' && (
          <motion.div key="reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-6 w-full relative z-10">
            <div className="text-lg font-bold text-white/80">Clique nas cartas para revelar</div>
            <div className="flex flex-wrap justify-center gap-5">
              {cards.map((c, i) => (
                <motion.div
                  key={c.uid}
                  initial={{ opacity: 0, y: -200, rotate: -30, scale: 0.5 }}
                  animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                  transition={{ delay: i * 0.12, type: 'spring', stiffness: 120, damping: 12 }}
                >
                  <FlipCard card={c} revealed={revealed[i]} onReveal={() => revealCard(i)} rarityColor={RARITY_META[c.rarity].color} />
                </motion.div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={revealAll} className="px-4 py-2 rounded-xl bg-white/10 text-white font-bold hover:bg-white/20 backdrop-blur">
                Revelar todas
              </button>
              {allRevealed && (
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  onClick={goToSummary}
                  className="px-4 py-2 rounded-xl font-bold text-black"
                  style={{ background: packColor }}
                >
                  Ver resumo
                </motion.button>
              )}
            </div>
          </motion.div>
        )}

        {phase === 'summary' && (
          <motion.div key="summary" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-6 w-full relative z-10">
            <div className="text-3xl font-black" style={{ color: packColor }}>VOCÊ RECEBEU</div>
            <div className="flex flex-wrap justify-center gap-5">
              {cards.map((c, i) => (
                <motion.div
                  key={c.uid}
                  initial={{ opacity: 0, scale: 0.5, rotateY: 90 }}
                  animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                  transition={{ delay: i * 0.1, type: 'spring' }}
                >
                  <Card card={c} size="md" />
                </motion.div>
              ))}
            </div>
            <div className="flex gap-3 flex-wrap justify-center">
              <button onClick={() => navigate('/collection')} className="px-6 py-3 rounded-xl font-black text-white" style={{ background: packColor }}>
                VER COLEÇÃO
              </button>
              <button onClick={() => { setPhase('idle'); setCards([]); setRevealed([]); setBurstFire(false); }} className="px-6 py-3 rounded-xl bg-white border border-[#E9EAF0] text-[#252733] font-black hover:bg-[#F7F7F9]">
                ABRIR OUTRO PACOTE
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FlipCard({ card, revealed, onReveal, rarityColor }: { card: PlayerCard; revealed: boolean; onReveal: () => void; rarityColor: string }) {
  return (
    <div className="w-44 h-60 cursor-pointer" style={{ perspective: 1000 }} onClick={() => !revealed && onReveal()}>
      <motion.div
        animate={{ rotateY: revealed ? 180 : 0 }}
        transition={{ duration: 0.7, type: 'spring', stiffness: 120 }}
        style={{ transformStyle: 'preserve-3d', position: 'relative', width: '100%', height: '100%' }}
      >
        <div style={{ backfaceVisibility: 'hidden', position: 'absolute', inset: 0 }} className="rounded-2xl bg-gradient-to-br from-[#1a1f27] to-[#0b0e13] border-2 border-white/20 flex items-center justify-center overflow-hidden">
          <motion.div
            animate={{ opacity: [0.3, 0.7, 0.3], scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-6xl"
          >
            🃏
          </motion.div>
          <div className="absolute bottom-2 text-xs text-white/40">Clique para revelar</div>
          {/* shimmer */}
          <div className="absolute inset-0 opacity-30" style={{ background: `linear-gradient(110deg, transparent 30%, ${rarityColor} 50%, transparent 70%)`, backgroundSize: '200% 100%', animation: 'shimmer 2s linear infinite' }} />
        </div>
        <div style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', position: 'absolute', inset: 0 }}>
          <Card card={card} size="md" />
          {revealed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.8, 0] }}
              transition={{ duration: 1.2 }}
              className="absolute inset-0 pointer-events-none rounded-2xl"
              style={{ boxShadow: `0 0 40px ${rarityColor}` }}
            />
          )}
        </div>
      </motion.div>
    </div>
  );
}
