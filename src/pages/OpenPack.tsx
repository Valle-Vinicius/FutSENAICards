import { useState, useRef, useEffect, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../store/useGame';
import { playBurst, playCharge, playFlip, playRareReveal } from '../lib/sound';
import Card from '../components/Card';
import type { PlayerCard, Rarity } from '../types';
import { RARITY_META } from '../types';
import { PackageOpen, Sparkles } from 'lucide-react';
import cardBackCommon from '../imagens/cartas/comum.png';
import cardBackUncommon from '../imagens/cartas/incomum.png';
import cardBackRare from '../imagens/cartas/raro.png';
import cardBackEpic from '../imagens/cartas/epico.png';
import cardBackLegendary from '../imagens/cartas/lendario.png';
import cardBackIcon from '../imagens/cartas/icone.png';
import './OpenPack.css';

const CARD_BACKS: Record<string, string> = {
  common: cardBackCommon,
  uncommon: cardBackUncommon,
  rare: cardBackRare,
  epic: cardBackEpic,
  legendary: cardBackLegendary,
  icon: cardBackIcon,
  secret: cardBackIcon,
};

const RARITY_RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, icon: 5, secret: 6 };
const RARITY_VALUE: Record<Rarity, number> = { common: 100, uncommon: 250, rare: 600, epic: 1500, legendary: 4000, icon: 10000, secret: 20000 };

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
    const rootStyles = getComputedStyle(document.documentElement);
    const colors = [
      color,
      ...['--white', '--gold', '--purple', '--blue']
        .map(token => rootStyles.getPropertyValue(token).trim())
        .filter(Boolean),
    ];
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
  return <canvas ref={canvasRef} aria-hidden="true" className="open-pack-burst-canvas" />;
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
  const isDarkPhase = phase === 'charging' || phase === 'burst' || phase === 'rarity' || phase === 'reveal';
  const [cards, setCards] = useState<PlayerCard[]>([]);
  const [choiceCards, setChoiceCards] = useState<PlayerCard[]>([]);
  const [choiceId, setChoiceId] = useState<string | null>(null);
  const [claimingChoice, setClaimingChoice] = useState(false);
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [skip, setSkip] = useState(false);
  const [fast, setFast] = useState(false);
  const [burstFire, setBurstFire] = useState(false);
  const [shake, setShake] = useState(false);

  const openingRef = useRef(false);

  if (!pack) return <div className="open-pack-not-found">Pacote não encontrado.</div>;

  const isChoice = !!pack.choice;
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sortCards = (list: PlayerCard[]) => [...list].sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.overall - a.overall);

  const startOpen = async () => {
    if (phase !== 'idle' || openingRef.current) return;
    openingRef.current = true;
    setPhase('charging');
    setShake(true);

    if (isChoice) {
      let res;
      try {
        res = await previewPack(pack.id);
      } catch (error) {
        openingRef.current = false;
        throw error;
      }
      if (!res) {
        openingRef.current = false;
        setShake(false);
        setPhase('idle');
        return;
      }
      openingRef.current = false;
      const sorted = sortCards(res.cards);
      setChoiceCards(sorted);
      setChoiceId(res.choiceId);
      setShake(false);
      setPhase('choice');
      return;
    }

    let res;
    try {
      res = await openPack(pack.id);
    } catch (error) {
      openingRef.current = false;
      throw error;
    }
    if (!res) {
      openingRef.current = false;
      setShake(false);
      setPhase('idle');
      return;
    }
    openingRef.current = false;

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
  const particleCount = [40, 55, 70, 85, 105, 130, 170][maxRank];
  const estimatedValue = cards.reduce((s, c) => s + RARITY_VALUE[c.rarity], 0);

  return (
    <div
      className={`open-pack-screen ${isDarkPhase ? 'open-pack-screen--dark' : ''}`}
      style={{ '--pack-accent': packColor } as CSSProperties}
    >
      <ParticleBurst fire={burstFire} color={packColor} count={particleCount} />
      <AnimatePresence>
        {phase === 'burst' && (
          <motion.div
            key="flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.8 }}
            className="open-pack-flash"
          />
        )}
      </AnimatePresence>

      <div className="open-pack-content">
        <AnimatePresence mode="wait">
          {phase === 'idle' && (
            <motion.section
              key="idle"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="open-pack-panel open-pack-panel--idle"
              aria-labelledby="open-pack-title"
            >
              <div className="open-pack-info">
                <div className="open-pack-copy">
                  <h1 id="open-pack-title">{pack.name}</h1>
                  <p className="open-pack-description">
                    {pack.cards} cartas · {pack.price === 0 ? 'Evento' : `${pack.price.toLocaleString('pt-BR')} moedas`}
                  </p>
                </div>

                <motion.button
                  type="button"
                  whileHover={!reduceMotion ? { y: -2 } : undefined}
                  whileTap={!reduceMotion ? { scale: 0.98 } : undefined}
                  onClick={startOpen}
                  className="open-pack-primary"
                >
                  <PackageOpen aria-hidden="true" />
                  <span>Abrir pacote</span>
                </motion.button>

                <div className="open-pack-options">
                  <label>
                    <input type="checkbox" checked={skip} onChange={e => setSkip(e.target.checked)} />
                    <span>Pular animação</span>
                  </label>
                  <label>
                    <input type="checkbox" checked={fast} onChange={e => setFast(e.target.checked)} />
                    <span>Modo rápido</span>
                  </label>
                </div>
              </div>

              <div className="open-pack-art-stage" aria-hidden="true">
                <motion.div
                  className="open-pack-art-card"
                  animate={reduceMotion || !animationsOn ? undefined : { y: [0, -8, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <img src={CARD_BACKS.common} alt="" width="1024" height="1536" />
                </motion.div>
                <span className="open-pack-art-accent" />
              </div>
            </motion.section>
          )}

          {phase === 'charging' && (
            <motion.section
              key="charging"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="open-pack-panel open-pack-panel--state open-pack-panel--charging"
              aria-labelledby="open-pack-charging-title"
            >
              <div className="open-pack-state-visual">
                <motion.img
                  src={CARD_BACKS.common}
                  alt=""
                  width="1024"
                  height="1536"
                  animate={shake && !reduceMotion ? {
                    x: [0, -12, 12, -10, 10, -6, 6, -3, 3, 0],
                    rotate: [0, -6, 6, -4, 4, -2, 2, 0],
                    scale: [1, 1.06, 1.03, 1.08, 1],
                  } : undefined}
                  transition={{ duration: fast ? 0.45 : 1.1 }}
                />
              </div>
              <div className="open-pack-state-copy">
                <h1 id="open-pack-charging-title">Abrindo pacote</h1>
                <p>{pack.name}</p>
                <div className="open-pack-progress" aria-hidden="true">
                  <motion.span
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: fast ? 0.45 : 1.1, ease: 'easeInOut' }}
                  />
                </div>
              </div>
            </motion.section>
          )}

          {phase === 'burst' && (
            <motion.section
              key="burst"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              className="open-pack-burst-state"
              aria-live="polite"
            >
              <Sparkles aria-hidden="true" className="open-pack-burst-icon" />
              <h1>Pacote aberto!</h1>
            </motion.section>
          )}

          {phase === 'choice' && (
            <motion.section
              key="choice"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="open-pack-panel open-pack-panel--state open-pack-choice-state"
              aria-labelledby="open-pack-choice-title"
            >
              <h1 id="open-pack-choice-title">Escolha sua carta</h1>
              <div className="open-pack-choice-list">
                {choiceCards.map(c => (
                  <motion.button
                    type="button"
                    key={c.uid}
                    whileHover={!claimingChoice && !reduceMotion ? { y: -4 } : undefined}
                    onClick={() => {
                      if (!choiceId || claimingChoice) return;
                      setClaimingChoice(true);
                      const prevOwned = new Set(useGame.getState().cards.map(x => x.playerId));
                      void claimPreviewedCard(c, choiceId).then(claimedCard => {
                        if (claimedCard) {
                          setCards([claimedCard]);
                          setRevealed([true]);
                          setDuplicateCount(prevOwned.has(c.playerId) ? 1 : 0);
                          setPhase('summary');
                        } else {
                          setClaimingChoice(false);
                        }
                      }).catch(() => setClaimingChoice(false));
                    }}
                    className="open-pack-choice-card"
                    disabled={claimingChoice}
                    aria-label={`Escolher ${c.name}`}
                    aria-busy={claimingChoice}
                  >
                    <Card card={c} size="md" />
                  </motion.button>
                ))}
              </div>
            </motion.section>
          )}

          {phase === 'reveal' && (
            <motion.section
              key="reveal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="open-pack-panel open-pack-panel--state open-pack-reveal-state"
              aria-labelledby="open-pack-reveal-title"
            >
              <h1 id="open-pack-reveal-title">Clique nas cartas para revelar</h1>
              <div className="open-pack-reveal-list">
                {cards.map((c, i) => (
                  <FlipCard
                    key={c.uid}
                    card={c}
                    revealed={revealed[i]}
                    onReveal={() => revealCard(i)}
                    rarityColor={RARITY_META[c.rarity].color}
                  />
                ))}
              </div>
              <div className="open-pack-actions">
                <button type="button" onClick={revealAll} className="open-pack-secondary">
                  Revelar todas
                </button>
                {allRevealed && (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={goToSummary}
                    className="open-pack-primary"
                  >
                    Ver resumo
                  </motion.button>
                )}
              </div>
            </motion.section>
          )}

          {phase === 'summary' && (
            <motion.section
              key="summary"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="open-pack-summary"
              aria-labelledby="open-pack-summary-title"
            >
              <header className="open-pack-summary-heading">
                <h1 id="open-pack-summary-title">Pacote aberto com sucesso!</h1>
              </header>
              <div className="open-pack-summary-layout">
                <div className="open-pack-summary-cards">
                  {cards.map((c, i) => (
                    <motion.div
                      key={c.uid}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.08, duration: 0.4 }}
                    >
                      {i === 0 && (
                        <p
                          className="open-pack-best-label"
                          style={{ '--rarity-color': RARITY_META[c.rarity].color } as CSSProperties}
                        >
                          Melhor carta
                        </p>
                      )}
                      <Card card={c} size={i === 0 ? 'lg' : 'md'} />
                    </motion.div>
                  ))}
                </div>

                <aside className="open-pack-summary-aside">
                  <dl className="open-pack-summary-stats">
                    <div>
                      <dt>Valor total</dt>
                      <dd>{estimatedValue.toLocaleString('pt-BR')}</dd>
                    </div>
                    <div>
                      <dt>Melhor carta</dt>
                      <dd>{cards[0]?.overall ?? 0}</dd>
                    </div>
                    <div>
                      <dt>Duplicatas</dt>
                      <dd>{duplicateCount}</dd>
                    </div>
                  </dl>
                  <div className="open-pack-actions open-pack-summary-actions">
                    <button type="button" onClick={() => navigate('/collection')} className="open-pack-primary">
                      Ver coleção
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        openingRef.current = false;
                        setPhase('idle');
                        setCards([]);
                        setRevealed([]);
                        setBurstFire(false);
                        setShake(false);
                        setDuplicateCount(0);
                      }}
                      className="open-pack-secondary"
                    >
                      Abrir outro pacote
                    </button>
                  </div>
                </aside>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FlipCard({ card, revealed, onReveal, rarityColor }: { card: PlayerCard; revealed: boolean; onReveal: () => void; rarityColor: string }) {
  return (
    <button
      type="button"
      className="open-pack-flip-card"
      style={{ '--rarity-color': rarityColor } as CSSProperties}
      onClick={() => !revealed && onReveal()}
      disabled={revealed}
      aria-label={revealed ? `${card.name}, carta revelada` : `Revelar carta de ${card.name}`}
    >
      <motion.div
        animate={{ rotateY: revealed ? 180 : 0 }}
        transition={{ duration: 0.7, type: 'spring', stiffness: 120 }}
        className="open-pack-flip-card-inner"
      >
        <div className="open-pack-flip-card-face open-pack-flip-card-back">
          <img src={CARD_BACKS[card.rarity] || CARD_BACKS.common} alt="" width="1024" height="1536" />
          <motion.div
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
            className="open-pack-flip-shine"
          />
          <span className="open-pack-flip-card-hint">Clique para revelar</span>
        </div>
        <div className="open-pack-flip-card-face open-pack-flip-card-front">
          <Card card={card} size="lg" />
        </div>
      </motion.div>
    </button>
  );
}
