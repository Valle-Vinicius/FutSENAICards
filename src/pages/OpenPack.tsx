import { useState, useRef, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../store/useGame';
import { supabase } from '../lib/supabase';
import { playBurst, playCharge, playFlip, playRareReveal } from '../lib/sound';
import Card from '../components/Card';
import type { PlayerCard, Rarity } from '../types';
import { PACK_RARITY_ORDER, RARITY_META } from '../types';
import { ArrowLeft, Coins, Trophy, Copy, LoaderCircle, PackageOpen, Sparkles } from 'lucide-react';
import cardBackCommon from '../imagens/cartas/comum.png';
import cardBackUncommon from '../imagens/cartas/incomum.png';
import cardBackRare from '../imagens/cartas/raro.png';
import cardBackEpic from '../imagens/cartas/epico.png';
import cardBackLegendary from '../imagens/cartas/lendario.png';
import cardBackIcon from '../imagens/cartas/icone.png';
import packBronze from '../imagens/pacotes/bronze.png';
import packSilver from '../imagens/pacotes/prata.png';
import packGold from '../imagens/pacotes/ouro.png';
import packPremium from '../imagens/pacotes/premium.png';
import packRarePlayers from '../imagens/pacotes/jogadoresraros.png';
import packLegends from '../imagens/pacotes/lendas.png';
import packGoalkeepers from '../imagens/pacotes/goleiros.png';
import packChoice from '../imagens/pacotes/escolhaespecial.png';
import packOffsale from '../imagens/pacotes/offsale.png';

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
const BULK_PACK_USER_ID = '35a8dc5f-c5db-4b33-9380-a32739ff6c10';
const PACK_ART: Record<string, string> = {
  bronze: packBronze,
  silver: packSilver,
  gold: packGold,
  premium: packPremium,
  rareplayers: packRarePlayers,
  legends: packLegends,
  position_gk: packGoalkeepers,
  choice: packChoice,
  off_sale: packOffsale,
};

function ParticleBurst({ fire, color, count }: { fire: boolean; color: string; count: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    if (!fire) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const bounds = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(bounds.width * pixelRatio);
    canvas.height = Math.round(bounds.height * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const W = bounds.width, H = bounds.height;
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
  const coins = useGame(s => s.coins);
  useEffect(() => {
    document.title = `${pack?.name ?? 'Abrir pacote'} | FutSENAI Cards`;
  }, [pack?.name]);
  const [canBulkOpen, setCanBulkOpen] = useState(false);
  const [bulkCount, setBulkCount] = useState(1);
  const [openedPackCount, setOpenedPackCount] = useState(1);
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (active) setCanBulkOpen(session?.user.id === BULK_PACK_USER_ID);
    });
    void client.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      if (active) setCanBulkOpen(data.session?.user.id === BULK_PACK_USER_ID);
    }).catch(error => {
      console.error('[open-pack] failed to check bulk access:', error);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const [phase, setPhase] = useState<'idle'|'waiting'|'charging'|'burst'|'rarity'|'reveal'|'summary'|'choice'>('idle');
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
  const [chargeTimedOut, setChargeTimedOut] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const openingRef = useRef(false);
  const chargeWaitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0;
    let h = 0;
    const particles: { x: number; y: number; vx: number; vy: number }[] = [];
    let raf = 0;
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      w = bounds.width;
      h = bounds.height;
      canvas.width = Math.round(w * pixelRatio);
      canvas.height = Math.round(h * pixelRatio);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      const targetCount = w < 640 ? 24 : 60;
      while (particles.length > targetCount) particles.pop();
      while (particles.length < targetCount) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 1.2,
          vy: (Math.random() - 0.5) * 1.2,
        });
      }
      particles.forEach(p => {
        p.x = Math.min(p.x, w);
        p.y = Math.min(p.y, h);
      });
    };
    const draw = () => {
      raf = 0;
      if (document.hidden) return;
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
    const scheduleDraw = () => {
      if (!document.hidden && !raf) raf = requestAnimationFrame(draw);
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else {
        scheduleDraw();
      }
    };
    const resizeObserver = new ResizeObserver(() => {
      resize();
      scheduleDraw();
    });
    resizeObserver.observe(canvas);
    resize();
    document.addEventListener('visibilitychange', onVisibilityChange);
    scheduleDraw();
    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  if (!pack) return <div className="p-8">Pacote não encontrado.</div>;

  const packArt = PACK_ART[pack.id];
  const isChoice = !!pack.choice;
  const openingQuantity = canBulkOpen && !isChoice ? bulkCount : 1;
  const totalPrice = pack.price * openingQuantity;
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const insufficientBalance = coins < totalPrice;
  const canOpenPack = pack.unlocked && !insufficientBalance && phase === 'idle';

  const sortCards = (list: PlayerCard[]) => [...list].sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.overall - a.overall);

  const startOpen = async () => {
    if (phase !== 'idle' || openingRef.current) return;
    openingRef.current = true;
    const openingOwnedIds = new Set(useGame.getState().cards.map(card => card.playerId));
    const quantity = openingQuantity;
    const startedAt = performance.now();
    const chargeMs = 1100;
    const shouldSkipAnimation = skip || reduceMotion || !animationsOn;
    const shouldCharge = !shouldSkipAnimation && !fast && quantity === 1;
    setChargeTimedOut(false);
    setBurstFire(false);
    if (shouldCharge) {
      setPhase('charging');
      setShake(true);
      chargeWaitTimeoutRef.current = setTimeout(() => {
        chargeWaitTimeoutRef.current = null;
        if (openingRef.current) {
          setShake(false);
          setChargeTimedOut(true);
        }
      }, chargeMs);
    } else {
      setPhase('waiting');
      setShake(false);
    }

    const clearChargeWaitTimeout = () => {
      if (chargeWaitTimeoutRef.current) {
        clearTimeout(chargeWaitTimeoutRef.current);
        chargeWaitTimeoutRef.current = null;
      }
    };

    if (isChoice) {
      let res;
      try {
        res = await previewPack(pack.id);
      } catch (error) {
        clearChargeWaitTimeout();
        openingRef.current = false;
        setChargeTimedOut(false);
        setShake(false);
        setPhase('idle');
        throw error;
      }
      clearChargeWaitTimeout();
      setChargeTimedOut(false);
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
      res = await openPack(pack.id, quantity);
    } catch (error) {
      clearChargeWaitTimeout();
      openingRef.current = false;
      setChargeTimedOut(false);
      setShake(false);
      setPhase('idle');
      throw error;
    }
    clearChargeWaitTimeout();
    setChargeTimedOut(false);
    if (!res) {
      openingRef.current = false;
      setShake(false);
      setPhase('idle');
      return;
    }
    openingRef.current = false;

    const sorted = sortCards(res.cards);
    setCards(sorted);
    setOpenedPackCount(quantity);
    setRevealed(new Array(sorted.length).fill(false));
    const seenPlayerIds = new Set(openingOwnedIds);
    setDuplicateCount(sorted.reduce((count, card) => {
      if (seenPlayerIds.has(card.playerId)) return count + 1;
      seenPlayerIds.add(card.playerId);
      return count;
    }, 0));
    if (quantity > 1) {
      setShake(false);
      setRevealed(new Array(sorted.length).fill(true));
      setPhase('summary');
      return;
    }
    if (skip || reduceMotion || !animationsOn) {
      setShake(false);
      setRevealed(new Array(sorted.length).fill(true));
      setPhase('summary');
      return;
    }
    if (fast) {
      setShake(false);
      setPhase('reveal');
      return;
    }
    const chargeLeft = Math.max(0, chargeMs - (performance.now() - startedAt));
    const burstMs = 900;
    if (chargeLeft > 0) {
      if (audioOn) playCharge(chargeLeft / 1000);
      setTimeout(() => {
        setShake(false);
        setBurstFire(true);
        if (audioOn) playBurst(RARITY_RANK[sorted[0]?.rarity ?? 'common']);
        setPhase(current => (current === 'charging' ? 'burst' : current));
      }, chargeLeft);
    } else {
      setShake(false);
      setBurstFire(true);
      if (audioOn) playBurst(RARITY_RANK[sorted[0]?.rarity ?? 'common']);
      setPhase('burst');
    }
    setTimeout(() => {
      setBurstFire(false);
      setPhase(current => (current === 'burst' ? 'reveal' : current));
    }, chargeLeft + burstMs);
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

  const packColor = pack.color || 'var(--red)';
  const maxRank = cards.length ? Math.max(...cards.map(c => RARITY_RANK[c.rarity])) : 0;
  const particleCount = [40, 55, 70, 85, 105, 130, 170][maxRank];
  const estimatedValue = cards.reduce((s, c) => s + RARITY_VALUE[c.rarity], 0);
  const summaryCards = openedPackCount > 1 ? cards.slice(0, 12) : cards;
  const formatProbability = (probability: number) => `${(probability * 100).toLocaleString('pt-BR', { maximumFractionDigits: 12 })}%`;

  return (
    <div
      className={`open-pack-page${isDarkPhase ? ' open-pack-page--dark' : ''}`}
      style={{ '--pack-accent': packColor } as CSSProperties}
    >
      <canvas ref={canvasRef} className="absolute inset-0 z-0 w-full h-full" />

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

      <div className="open-pack-page__content">
      <AnimatePresence mode="wait">
        {phase === 'idle' && (
          <motion.section
            key="idle"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28 }}
            className="open-pack-idle"
            aria-labelledby="open-pack-title"
          >
            <div className="open-pack-idle__topline">
              <div>
                <p className="open-pack-eyebrow"><span /> CENTRAL DE PACOTES <i>/</i> FUTSENAI</p>
                <Link to="/packs" className="open-pack-back"><ArrowLeft aria-hidden="true" /> Todos os pacotes</Link>
              </div>
              <div className="open-pack-balance">
                <Coins aria-hidden="true" />
                <div><span>Seu saldo</span><strong>{coins.toLocaleString('pt-BR')}</strong></div>
                <small>moedas</small>
              </div>
            </div>

            <div className="open-pack-idle__grid">
              <section className="open-pack-intro">
                <span className="open-pack-tag" style={{ color: packColor, borderColor: `${packColor}55` }}>
                  PACOTE SELECIONADO
                </span>
                <h1 id="open-pack-title">{pack.name}</h1>
                <p className="open-pack-intro__description">{pack.description}</p>
                <div className="open-pack-facts">
                  <div><span>Cartas no pacote</span><strong>{pack.cards}</strong></div>
                  <div><span>Conteúdo total</span><strong>{pack.cards * openingQuantity}</strong></div>
                  {pack.position && <div><span>Posição</span><strong>{pack.position}</strong></div>}
                </div>
                <p className="open-pack-intro__note">
                  <Sparkles aria-hidden="true" />
                  Cada abertura revela cartas reais da sua coleção.
                </p>
              </section>

              <figure className={`open-pack-art${shake ? ' open-pack-art--shaking' : ''}`}>
                <span className="open-pack-art__halo" style={{ backgroundColor: `${packColor}24` }} />
                {packArt ? (
                  <motion.img
                    src={packArt}
                    alt={`Arte original do ${pack.name}`}
                    className="open-pack-art__image"
                    draggable={false}
                    animate={animationsOn && !reduceMotion && phase === 'idle'
                      ? { y: [0, -8, 0], rotate: [0, -1.2, 1.2, 0] }
                      : undefined}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  />
                ) : (
                  <div className="open-pack-art__missing">
                    <PackageOpen aria-hidden="true" />
                    <span>Arte do pacote indisponível</span>
                  </div>
                )}
              </figure>

              <aside className="open-pack-purchase" aria-label="Detalhes e abertura do pacote">
                <p className="open-pack-eyebrow">PRONTO PARA A REVELAÇÃO?</p>
                <div className="open-pack-purchase__price">
                  <span>{totalPrice === 0 ? 'Pacote de evento' : 'Preço total'}</span>
                  <strong>{totalPrice === 0 ? 'Grátis' : totalPrice.toLocaleString('pt-BR')}</strong>
                  {totalPrice > 0 && <small><Coins aria-hidden="true" /> moedas</small>}
                </div>
                <div className="open-pack-purchase__balance">
                  <span>Seu saldo</span>
                  <strong>{coins.toLocaleString('pt-BR')} moedas</strong>
                </div>

                {canBulkOpen && !isChoice && (
                  <div className="open-pack-quantity" role="group" aria-label="Quantidade de pacotes">
                    <span>Quantidade de pacotes</span>
                    <div>
                      {[1, 5, 10, 100].map(quantity => (
                        <button
                          key={quantity}
                          type="button"
                          aria-pressed={bulkCount === quantity}
                          onClick={() => setBulkCount(quantity)}
                          className={bulkCount === quantity ? 'open-pack-quantity__option open-pack-quantity__option--active' : 'open-pack-quantity__option'}
                        >
                          {quantity}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!pack.unlocked ? (
                  <p className="open-pack-purchase__warning" role="status">Pacote bloqueado. Complete missões para desbloquear.</p>
                ) : insufficientBalance ? (
                  <p className="open-pack-purchase__warning" role="status">
                    Saldo insuficiente. Faltam {(totalPrice - coins).toLocaleString('pt-BR')} moedas.
                  </p>
                ) : null}

                <motion.button
                  type="button"
                  whileHover={canOpenPack && animationsOn && !reduceMotion ? { y: -2 } : undefined}
                  whileTap={canOpenPack && animationsOn && !reduceMotion ? { scale: 0.98 } : undefined}
                  onClick={startOpen}
                  disabled={!canOpenPack}
                  aria-busy={phase !== 'idle'}
                  className="open-pack-button"
                  style={{ backgroundColor: packColor }}
                >
                  {openingQuantity === 1 ? 'ABRIR PACOTE' : `ABRIR ${openingQuantity} PACOTES`}
                  <PackageOpen aria-hidden="true" />
                </motion.button>

                <div className="open-pack-options">
                  <label>
                    <input type="checkbox" checked={skip} onChange={e => setSkip(e.target.checked)} />
                    Pular animação
                  </label>
                  <label>
                    <input type="checkbox" checked={fast} onChange={e => setFast(e.target.checked)} />
                    Modo rápido
                  </label>
                </div>
                <p className="open-pack-purchase__safe">A compra só é concluída após confirmação do servidor.</p>
              </aside>
            </div>

            <section className="open-pack-probabilities" aria-labelledby="open-pack-probabilities-title">
              <div className="open-pack-probabilities__heading">
                <div>
                  <p className="open-pack-eyebrow">CHANCES DO PACOTE</p>
                  <h2 id="open-pack-probabilities-title">O que pode vir</h2>
                </div>
                <span>Probabilidades reais</span>
              </div>
              <div
                className="open-pack-probabilities__bar"
                role="img"
                aria-label={`Probabilidades: ${PACK_RARITY_ORDER.map(rarity => `${RARITY_META[rarity].label} ${formatProbability(pack.probabilities[rarity])}`).join(', ')}`}
              >
                {PACK_RARITY_ORDER.map(rarity => {
                  const probability = pack.probabilities[rarity];
                  if (probability <= 0) return null;
                  return (
                    <span
                      key={rarity}
                      style={{ width: `${probability * 100}%`, backgroundColor: RARITY_META[rarity].color }}
                    />
                  );
                })}
              </div>
              <ul className="open-pack-probabilities__legend">
                {PACK_RARITY_ORDER.map(rarity => (
                  <li key={rarity}>
                    <span className="open-pack-probabilities__name">
                      <i style={{ backgroundColor: RARITY_META[rarity].color }} />
                      {RARITY_META[rarity].label}
                    </span>
                    <strong>{formatProbability(pack.probabilities[rarity])}</strong>
                  </li>
                ))}
              </ul>
            </section>
          </motion.section>
        )}

        {phase === 'waiting' && (
          <motion.div
            key="waiting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="status"
            className="relative z-10 inline-flex items-center gap-2 rounded-full bg-black/10 px-4 py-2 text-sm text-[var(--muted)]"
          >
            <LoaderCircle
              aria-hidden="true"
              className={`h-4 w-4 ${animationsOn && !reduceMotion && !skip && !fast ? 'animate-spin' : ''}`}
            />
            <span>{isChoice ? 'Carregando opções…' : 'Abrindo pacote…'}</span>
          </motion.div>
        )}

        {phase === 'charging' && (
          <motion.div key="charging" className="flex flex-col items-center gap-6 relative z-10">
            <motion.div
              animate={shake ? { x: [0,-12,12,-10,10,-6,6,-3,3,0], y: [0,6,-6,4,-4,2,-2,0], rotate: [0,-6,6,-4,4,-2,2,0], scale: [1,1.1,1.05,1.12,1] } : {}}
              transition={{ duration: 1.1 }}
              className="open-pack-opening-pack"
            >
              {packArt
                ? <img src={packArt} alt={`Arte original do ${pack.name}`} />
                : <PackageOpen aria-hidden="true" />}
            </motion.div>
            {chargeTimedOut ? (
              <div role="status" className="inline-flex items-center gap-2 text-sm font-semibold text-white/75">
                <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                Aguardando resposta…
              </div>
            ) : (
              <>
                <motion.div
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 0.6 }}
                  className="text-xl font-black"
                  style={{ color: packColor }}
                >
                  ABRINDO...
                </motion.div>
                <div className="w-[min(16rem,70vw)] h-2 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 1.1, ease: 'easeInOut' }}
                    className="h-full rounded-full"
                    style={{ background: packColor }}
                  />
                </div>
              </>
            )}
          </motion.div>
        )}

        {phase === 'burst' && (
          <motion.div key="burst" className="flex flex-col items-center justify-center relative z-10">
            <motion.div
              initial={{ scale: 0.2, opacity: 0, rotate: -180 }}
              animate={{ scale: [0.2, 1.8, 1], opacity: [0, 1, 1], rotate: [ -180, 0, 0] }}
              transition={{ duration: fast ? 0.5 : 0.9, ease: 'backOut' }}
              className="open-pack-burst__art"
            >
              {packArt
                ? <img src={packArt} alt={`Arte original do ${pack.name}`} />
                : <PackageOpen aria-hidden="true" />}
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-4 text-2xl sm:text-3xl font-black"
              style={{ color: packColor, textShadow: `0 0 20px ${packColor}` }}
            >
              PACOTE ABERTO!
            </motion.div>
          </motion.div>
        )}

        {phase === 'choice' && (
          <motion.div key="choice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="open-pack-result open-pack-result--choice">
            <div className="open-pack-result__heading">
              <p className="open-pack-eyebrow"><span /> ESCOLHA ESPECIAL</p>
              <h1>Escolha sua carta</h1>
              <p>As opções abaixo foram geradas pelo pacote. Escolha uma para adicionar à sua coleção.</p>
            </div>
            <div className="grid w-full max-w-[25rem] grid-cols-2 gap-3 sm:max-w-none sm:grid-cols-3 sm:gap-5">
              {choiceCards.map(c => (
                <motion.div key={c.uid} whileHover={animationsOn && !reduceMotion ? { scale: 1.03, y: -4 } : undefined} onClick={() => {
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
                }} className="open-pack-choice-card mx-auto w-full max-w-48 min-w-0 cursor-pointer">
                  <Card card={c} size="fluid" />
                </motion.div>
              ))}
            </div>
            {claimingChoice && <div role="status" className="open-pack-status"><LoaderCircle aria-hidden="true" /> Confirmando sua escolha…</div>}
          </motion.div>
        )}

        {phase === 'reveal' && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="open-pack-result open-pack-result--dark"
          >
            <div className="open-pack-result__heading">
              <p className="open-pack-eyebrow"><span /> REVELAÇÃO</p>
              <h1>Clique nas cartas para revelar</h1>
            </div>
            <div className="grid w-full max-w-md grid-cols-2 gap-3 sm:flex sm:max-w-none sm:flex-wrap sm:justify-center sm:gap-5">
              {cards.map((c, i) => (
                <div key={c.uid} className="min-w-0">
                  <FlipCard card={c} revealed={revealed[i]} onReveal={() => revealCard(i)} rarityColor={RARITY_META[c.rarity].color} />
                </div>
              ))}
            </div>
            <div className="open-pack-result__actions">
              <button onClick={revealAll} className="open-pack-secondary-button">
                Revelar todas
              </button>
              {allRevealed && (
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  onClick={goToSummary}
                  className="open-pack-primary-button"
                  style={{ background: packColor }}
                >
                  Ver resumo
                </motion.button>
              )}
            </div>
          </motion.div>
        )}

        {phase === 'summary' && (
          <motion.div key="summary" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="open-pack-result open-pack-summary">
            <div className="open-pack-result__heading">
              <p className="open-pack-eyebrow"><span /> PACOTE ABERTO</p>
              <h1>Suas novas cartas chegaram</h1>
            </div>
            {openedPackCount > 1 && (
              <div className="text-center text-sm text-[var(--muted)]">
                Mostrando {summaryCards.length} de {cards.length} {cards.length === 1 ? 'carta' : 'cartas'}; todas foram adicionadas à coleção.
              </div>
            )}
            <div className="grid w-full max-w-md grid-cols-2 gap-3 sm:flex sm:max-w-none sm:flex-wrap sm:justify-center sm:gap-5 sm:items-end">
              {summaryCards.map((c, i) => (
                <motion.div
                  key={c.uid}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                  className={i === 0 ? 'col-span-2 flex flex-col items-center sm:col-auto' : 'min-w-0 w-full sm:w-48'}
                >
                  {i === 0 && <div className="mb-1 text-center text-xs font-black" style={{ color: RARITY_META[c.rarity].color }}>MELHOR CARTA</div>}
                  <Link to={`/card/${c.uid}`} className={i === 0 ? 'open-pack-summary__card open-pack-summary__card--best' : 'open-pack-summary__card'}>
                    <Card card={c} size="fluid" />
                  </Link>
                </motion.div>
              ))}
            </div>
            <div className="grid w-full max-w-2xl grid-cols-3 gap-3">
              <div className="flex-1 card-surface p-3 text-center space-y-1">
                <Coins className="w-6 h-6 mx-auto text-[#EF4444]" />
                <div className="text-lg font-bold text-[var(--text)]">{estimatedValue.toLocaleString('pt-BR')}</div>
                <div className="text-[10px] text-[var(--muted)]">Valor total</div>
              </div>
              <div className="flex-1 card-surface p-3 text-center space-y-1">
                <Trophy className="w-6 h-6 mx-auto text-[#EF4444]" />
                <div className="text-lg font-bold text-[var(--text)]">{cards[0]?.overall ?? 0}</div>
                <div className="text-[10px] text-[var(--muted)]">Melhor carta</div>
              </div>
              <div className="flex-1 card-surface p-3 text-center space-y-1">
                <Copy className="w-6 h-6 mx-auto text-[#EF4444]" />
                <div className="text-lg font-bold text-[var(--text)]">{duplicateCount}</div>
                <div className="text-[10px] text-[var(--muted)]">Duplicatas</div>
              </div>
            </div>
            <div className="open-pack-result__actions">
              <button onClick={() => navigate('/collection')} className="open-pack-primary-button">
                VER COLEÇÃO
              </button>
              <button onClick={() => { openingRef.current = false; setPhase('idle'); setCards([]); setRevealed([]); setBurstFire(false); setShake(false); setChargeTimedOut(false); setDuplicateCount(0); }} className="open-pack-secondary-button">
                ABRIR OUTRO PACOTE
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

function FlipCard({ card, revealed, onReveal, rarityColor }: { card: PlayerCard; revealed: boolean; onReveal: () => void; rarityColor: string }) {
  return (
    <div className="aspect-[7/10] w-full max-w-full cursor-pointer" style={{ width: 'min(44vw, 11rem)', perspective: 1000 }} onClick={() => !revealed && onReveal()}>
      <motion.div
        animate={{ rotateY: revealed ? 180 : 0 }}
        transition={{ duration: 0.7, type: 'spring', stiffness: 120 }}
        style={{ transformStyle: 'preserve-3d', position: 'relative', width: '100%', height: '100%' }}
      >
        <div style={{ backfaceVisibility: 'hidden', position: 'absolute', inset: 0, border: `2px solid ${rarityColor}` }} className="rounded-2xl overflow-hidden">
          <img src={CARD_BACKS[card.rarity] || CARD_BACKS.common} alt="Verso da carta" className="w-full h-full object-cover" />
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
          <Card card={card} size="fluid" />
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
