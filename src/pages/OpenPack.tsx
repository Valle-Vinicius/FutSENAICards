import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../store/useGame';
import { toast } from '../store/toast';
import { playBurst, playCharge, playFlip, playRareReveal } from '../lib/sound';
import Card from '../components/Card';
import type { PlayerCard, Rarity } from '../types';
import { RARITY_META } from '../types';
import { Coins, Trophy, Copy } from 'lucide-react';
import bgWhite from '../imagens/background/backgroundbranco.png';
import cardBackCommon from '../imagens/cartas/comum.png';
import cardBackUncommon from '../imagens/cartas/incomum.png';
import cardBackRare from '../imagens/cartas/raro.png';
import cardBackEpic from '../imagens/cartas/epico.png';
import cardBackLegendary from '../imagens/cartas/lendario.png';
import cardBackIcon from '../imagens/cartas/icone.png';

const CARD_BACKS: Record<string, string> = {
  common: cardBackCommon,
  uncommon: cardBackUncommon,
  rare: cardBackRare,
  epic: cardBackEpic,
  legendary: cardBackLegendary,
  icon: cardBackIcon,
};

const RARITY_RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, icon: 5 };
const RARITY_VALUE: Record<Rarity, number> = { common: 100, uncommon: 250, rare: 600, epic: 1500, legendary: 4000, icon: 10000 };

function ParticleBurst({ fire, color, count }: { fire: boolean; color: string; count: number }) {
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
    for (let i = 0; i < count; i++) {
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
  }, [fire, color, count]);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-20" />;
}

export default function OpenPack() {
  const { packId } = useParams();
  const navigate = useNavigate();
  const packs = useGame(s => s.packConfigs);
  const openPack = useGame(s => s.openPack);
  const previewPack = useGame(s => s.previewPack);
  const claimPreviewedCard = useGame(s => s.claimPreviewedCard);
  const audioOn = useGame(s => s.settings.audio);
  const animationsOn = useGame(s => s.settings.animations);
  const pack = packs.find(p => p.id === packId);

  const [phase, setPhase] = useState<'idle'|'charging'|'burst'|'rarity'|'reveal'|'summary'|'choice'>('idle');
  const [cards, setCards] = useState<PlayerCard[]>([]);
  const [choiceCards, setChoiceCards] = useState<PlayerCard[]>([]);
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [skip, setSkip] = useState(false);
  const [fast, setFast] = useState(false);
  const [burstFire, setBurstFire] = useState(false);
  const [shake, setShake] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = canvas.width = canvas.clientWidth || canvas.offsetWidth || 800;
    let h = canvas.height = canvas.clientHeight || canvas.offsetHeight || 600;
    const particles: { x: number; y: number; vx: number; vy: number }[] = [];
    for (let i = 0; i < 60; i++) particles.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2 });
    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fill();
      }
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(255,255,255,${0.2 * (1 - dist / 150)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    const onResize = () => {
      w = canvas.width = canvas.clientWidth || canvas.offsetWidth;
      h = canvas.height = canvas.clientHeight || canvas.offsetHeight;
    };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, []);

  if (!pack) return <div className="p-8">Pacote não encontrado.</div>;

  const isChoice = !!pack.choice;
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sortCards = (list: PlayerCard[]) => [...list].sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.overall - a.overall);

  const startOpen = () => {
    if (phase !== 'idle') return;
    if (isChoice) {
      const res = previewPack(pack.id);
      if (!res) { toast.alert('Saldo insuficiente.'); return; }
      const sorted = sortCards(res);
      setChoiceCards(sorted);
      setPhase('choice');
      return;
    }
    const res = openPack(pack.id);
    if (!res) { alert('Saldo insuficiente.'); return; }
    const sorted = sortCards(res.cards);
    setCards(sorted);
    setRevealed(new Array(sorted.length).fill(false));
    const prevOwned = new Set(useGame.getState().cards.map(c => c.playerId));
    setDuplicateCount(sorted.filter(c => prevOwned.has(c.playerId)).length);
    if (skip || reduceMotion || !animationsOn) {
      setRevealed(new Array(sorted.length).fill(true));
      setPhase('summary');
      return;
    }
    setPhase('charging');
    setShake(true);
    const chargeMs = fast ? 450 : 1100;
    if (audioOn) playCharge(chargeMs / 1000);
    setTimeout(() => { setShake(false); setBurstFire(true); if (audioOn) playBurst(RARITY_RANK[sorted[0]?.rarity ?? 'common']); setPhase(p => (p === 'charging' ? 'burst' : p)); }, chargeMs);
    const burstMs = fast ? 500 : 900;
    setTimeout(() => { setBurstFire(false); setPhase(p => (p === 'burst' ? 'reveal' : p)); }, chargeMs + burstMs);
  };

  const revealCard = (i: number) => {
    setRevealed(prev => { const n = [...prev]; n[i] = true; return n; });
    if (audioOn) {
      playFlip();
      if (RARITY_RANK[cards[i]?.rarity ?? 'common'] >= 3) playRareReveal();
    }
  };
  const revealAll = () => { setRevealed(new Array(cards.length).fill(true)); };
  const allRevealed = revealed.length > 0 && revealed.every(Boolean);
  const goToSummary = () => setPhase('summary');

  const packColor = pack.color || '#E30613';
  const maxRank = cards.length ? Math.max(...cards.map(c => RARITY_RANK[c.rarity])) : 0;
  const particleCount = [40, 55, 70, 85, 105, 130][maxRank];
  const estimatedValue = cards.reduce((s, c) => s + RARITY_VALUE[c.rarity], 0);

  return (
    <div className="min-h-[95vh] flex flex-col items-center justify-center p-4 pb-20 relative overflow-y-auto rounded-2xl" style={{ backgroundImage: `url(${bgWhite})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
      <canvas ref={canvasRef} className="absolute inset-0 z-0 w-full h-full" />
      <AnimatePresence>
        {(phase === 'charging' || phase === 'burst' || phase === 'rarity' || phase === 'reveal') && (
          <motion.div
            key="stage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, scale: phase === 'burst' ? [1, 1.03, 1] : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-gradient-to-b from-[#05060a] via-[#0a0d14] to-[#05060a]"
          />
        )}
      </AnimatePresence>

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

      <ParticleBurst fire={burstFire} color={packColor} count={particleCount} />

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
            <div className="flex items-center gap-4 text-xs text-[#858A98]">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={skip} onChange={e => setSkip(e.target.checked)} />
                Pular animação
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={fast} onChange={e => setFast(e.target.checked)} />
                Modo rápido
              </label>
            </div>
          </motion.div>
        )}

        {phase === 'charging' && (
          <motion.div key="charging" className="flex flex-col items-center gap-6 relative z-10">
            <motion.div
              animate={shake ? { x: [0,-12,12,-10,10,-6,6,-3,3,0], y: [0,6,-6,4,-4,2,-2,0], rotate: [0,-6,6,-4,4,-2,2,0], scale: [1,1.1,1.05,1.12,1] } : {}}
              transition={{ duration: fast ? 0.45 : 1.1 }}
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
                transition={{ duration: fast ? 0.45 : 1.1, ease: 'easeInOut' }}
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
              transition={{ duration: fast ? 0.5 : 0.9, ease: 'backOut' }}
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
                <motion.div key={c.uid} whileHover={{ scale: 1.05 }} onClick={() => {
                  const prevOwned = new Set(useGame.getState().cards.map(x => x.playerId));
                  claimPreviewedCard(c);
                  setCards([c]);
                  setRevealed([true]);
                  setDuplicateCount(prevOwned.has(c.playerId) ? 1 : 0);
                  setPhase('summary');
                }} className="cursor-pointer">
                  <Card card={c} size="md" />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {phase === 'reveal' && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-6 w-full relative z-10"
          >
            <div className="text-lg font-bold text-white/80">Clique nas cartas para revelar</div>
            <div className="flex flex-wrap justify-center gap-5">
              {cards.map((c, i) => (
                <div key={c.uid}>
                  <FlipCard card={c} revealed={revealed[i]} onReveal={() => revealCard(i)} rarityColor={RARITY_META[c.rarity].color} />
                </div>
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
            <div className="text-3xl font-black text-[#E30613]">PACOTE ABERTO COM SUCESSO!</div>
            <div className="flex flex-wrap justify-center gap-5 items-end">
              {cards.map((c, i) => (
                <motion.div
                  key={c.uid}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                >
                  {i === 0 && <div className="text-center text-xs font-black mb-1" style={{ color: RARITY_META[c.rarity].color }}>MELHOR CARTA</div>}
                  
                  <Card card={c} size={i === 0 ? 'lg' : 'md'} />
                </motion.div>
              ))}
            </div>
            <div className="flex gap-3 w-full max-w-2xl">
              <div className="flex-1 card-surface p-3 text-center space-y-1">
                <Coins className="w-6 h-6 mx-auto text-[#EF4444]" />
                <div className="text-lg font-bold text-[#252733]">{estimatedValue.toLocaleString('pt-BR')}</div>
                <div className="text-[10px] text-[#858A98]">Valor total</div>
              </div>
              <div className="flex-1 card-surface p-3 text-center space-y-1">
                <Trophy className="w-6 h-6 mx-auto text-[#EF4444]" />
                <div className="text-lg font-bold text-[#252733]">{cards[0]?.overall ?? 0}</div>
                <div className="text-[10px] text-[#858A98]">Melhor carta</div>
              </div>
              <div className="flex-1 card-surface p-3 text-center space-y-1">
                <Copy className="w-6 h-6 mx-auto text-[#EF4444]" />
                <div className="text-lg font-bold text-[#252733]">{duplicateCount}</div>
                <div className="text-[10px] text-[#858A98]">Duplicatas</div>
              </div>
            </div>
            <div className="flex gap-3 flex-wrap justify-center">
              <button onClick={() => navigate('/collection')} className="px-6 py-3 rounded-xl font-black text-white" style={{ background: '#E30613' }}>
                VER COLEÇÃO
              </button>
              <button onClick={() => { setPhase('idle'); setCards([]); setRevealed([]); setBurstFire(false); setDuplicateCount(0); }} className="px-6 py-3 rounded-xl bg-white border border-[#E9EAF0] text-[#252733] font-black hover:bg-[#F7F7F9]">
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
        <div style={{ backfaceVisibility: 'hidden', position: 'absolute', inset: 0, border: `2px solid ${rarityColor}` }} className="rounded-2xl overflow-hidden">
          <img src={CARD_BACKS[card.rarity] || CARD_BACKS.common} alt="Verso da carta" className="w-full h-full object-contain" />
          <motion.div
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none"
            style={{ transform: 'skewX(-20deg)' }}
          />
          <motion.div
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none"
          />
          <div className="absolute bottom-3 left-0 right-0 text-center text-[10px] text-white/70 font-bold">Clique para revelar</div>
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
