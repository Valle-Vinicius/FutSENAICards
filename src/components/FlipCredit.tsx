import { useState, type CSSProperties, type PointerEvent } from 'react';
import { ArrowLeftRight, ArrowUpRight } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import Card from './Card';
import { RARITY_META, type PlayerCard } from '../types';

interface CreditAttribute {
  l: string;
  v: number;
}

interface FlipCreditProps {
  card: PlayerCard;
  attributes: CreditAttribute[];
  positionLabel: string;
  specialLabel: string;
  projectName: string;
  projectDescription: string;
  technologies: string[];
  website: string;
  animationsEnabled: boolean;
}

export default function FlipCredit({
  card,
  attributes,
  positionLabel,
  specialLabel,
  projectName,
  projectDescription,
  technologies,
  website,
  animationsEnabled,
}: FlipCreditProps) {
  const [flipped, setFlipped] = useState(false);
  const [glowPosition, setGlowPosition] = useState<{ x: number; y: number } | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const useFade = Boolean(prefersReducedMotion);
  const shouldAnimate = animationsEnabled && prefersReducedMotion === false;
  const canGlow = shouldAnimate
    && typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const rarity = RARITY_META[card.rarity] ?? RARITY_META.common;

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!canGlow || event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setGlowPosition({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
  };

  const sceneStyle: CSSProperties = {
    position: 'relative',
    aspectRatio: '7 / 10',
    transformStyle: 'preserve-3d',
    transform: useFade ? undefined : flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
    transition: shouldAnimate ? 'transform 650ms cubic-bezier(0.2, 0.75, 0.25, 1)' : 'none',
  };
  const frontStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    backfaceVisibility: useFade ? undefined : 'hidden',
    transform: useFade ? undefined : 'rotateY(0deg)',
    opacity: useFade ? (flipped ? 0 : 1) : 1,
    transition: animationsEnabled && useFade ? 'opacity 140ms ease' : 'none',
    pointerEvents: useFade && flipped ? 'none' : undefined,
  };
  const backStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    backfaceVisibility: useFade ? undefined : 'hidden',
    transform: useFade ? undefined : 'rotateY(180deg)',
    opacity: useFade ? (flipped ? 1 : 0) : 1,
    transition: animationsEnabled && useFade ? 'opacity 140ms ease' : 'none',
    pointerEvents: useFade && !flipped ? 'none' : undefined,
    border: card.rarity === 'icon' ? '4px solid #ff0040' : `2px solid ${rarity.color}`,
    boxShadow: '0 8px 24px rgba(37,39,51,0.2)',
  };
  const glowStyle: CSSProperties | undefined = glowPosition
    ? {
      '--glow-x': `${glowPosition.x}px`,
      '--glow-y': `${glowPosition.y}px`,
    } as CSSProperties
    : undefined;

  return (
    <div className="w-full" style={{ perspective: '1000px' }}>
      <div style={sceneStyle}>
        <div
          aria-hidden={flipped}
          inert={flipped}
          style={frontStyle}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setGlowPosition(null)}
        >
          <button
            type="button"
            aria-pressed={flipped}
            aria-label={`Virar carta de ${card.name} para ver o projeto ${projectName}`}
            onClick={() => setFlipped(true)}
            className="absolute inset-0 w-full rounded-2xl bg-transparent p-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--red)]"
          >
            <Card
              card={card}
              size="fluid"
              variant="credit"
              attributes={attributes}
              positionLabel={positionLabel}
              specialLabel={specialLabel}
              animateHover={shouldAnimate}
            />
          </button>
          {canGlow && glowStyle && <span aria-hidden="true" className="credit-card-glow absolute inset-0 z-30" style={glowStyle} />}
        </div>

        <div aria-hidden={!flipped} inert={!flipped} style={backStyle} className={`overflow-hidden rounded-2xl ${card.rarity === 'icon' ? 'rgb-card' : ''}`}>
          <div className="absolute inset-0 bg-gradient-to-br from-[#252733] via-[#181a22] to-[#090a0d]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,197,66,0.2),transparent_55%)]" />
          <div className="relative flex h-full flex-col justify-between gap-3 p-3 text-white sm:gap-4 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full border border-sky-200/60 bg-sky-900/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-200">
                DEVELOPER
              </span>
              <button
                type="button"
                aria-pressed={flipped}
                aria-label={`Virar carta de ${card.name} para a frente`}
                onClick={() => setFlipped(false)}
                className="inline-flex items-center gap-1 rounded-full border border-white/25 px-2 py-1 text-[10px] font-semibold text-white/90 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <ArrowLeftRight className="h-3 w-3" aria-hidden="true" />
                Voltar
              </button>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/60">Projeto</p>
              <h3 className="mt-1 text-lg font-black leading-tight sm:text-xl">{projectName}</h3>
              <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-white/75">{projectDescription}</p>
            </div>
            <div>
              <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/60">Tecnologias</p>
              <div className="flex flex-wrap gap-1.5">
                {technologies.map(technology => (
                  <span key={technology} className="rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[9px] font-medium text-white/90">
                    {technology}
                  </span>
                ))}
              </div>
            </div>
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#252733] transition-colors hover:bg-white/90 motion-reduce:transition-none"
            >
              Abrir projeto
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
