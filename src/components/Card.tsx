import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { PlayerCard } from '../types';
import { RARITY_META, SPECIAL_META } from '../types';
import { getPlayerImage } from '../data/players';
import { Circle, Star } from 'lucide-react';

interface CardAttribute {
  l: string;
  v: number;
}

interface CardProps {
  card: PlayerCard;
  size?: 'sm'|'md'|'lg'|'fluid';
  onClick?: () => void;
  isNew?: boolean;
  attributes?: CardAttribute[];
  positionLabel?: string;
  specialLabel?: string;
  animateHover?: boolean;
  variant?: 'credit';
}

export default function Card({ card, size = 'md', onClick, isNew, attributes, positionLabel, specialLabel, animateHover = true, variant }: CardProps) {
  const meta = RARITY_META[card.rarity] ?? RARITY_META.common;
  const img = card.image || getPlayerImage(card.name);
  const isGK = card.position === 'GK';
  const isSecret = card.rarity === 'secret';
  const isCredit = variant === 'credit';
  const compact = size === 'sm' || size === 'fluid';
  const canHover = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: hover)').matches
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dims = size === 'fluid' ? 'w-full' : size === 'sm' ? 'w-36' : size === 'lg' ? 'w-60' : 'w-48';
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!animateHover || !canHover || event.pointerType === 'touch') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    event.currentTarget.style.setProperty('--card-tilt-x', `${(0.5 - y) * 7}deg`);
    event.currentTarget.style.setProperty('--card-tilt-y', `${(x - 0.5) * 9}deg`);
    event.currentTarget.style.setProperty('--card-shine-x', `${x * 100}%`);
    event.currentTarget.style.setProperty('--card-shine-y', `${y * 100}%`);
  };
  const resetPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty('--card-tilt-x', '0deg');
    event.currentTarget.style.setProperty('--card-tilt-y', '0deg');
    event.currentTarget.style.setProperty('--card-shine-x', '50%');
    event.currentTarget.style.setProperty('--card-shine-y', '40%');
  };

  const attrs = attributes ?? (isGK
    ? [{l:'REF',v:card.reflexes ?? 0},{l:'POS',v:card.positioning ?? 0},{l:'HAN',v:card.handling ?? 0},{l:'VEL',v:card.pace},{l:'DEF',v:card.defending},{l:'FIS',v:card.physical}]
    : [{l:'VEL',v:card.pace},{l:'CHU',v:card.shooting},{l:'PAS',v:card.passing},{l:'DRI',v:card.dribbling},{l:'DEF',v:card.defending},{l:'FIS',v:card.physical}]);
  const visibleAttrs = attributes ? attrs : compact ? [...attrs].sort((a, b) => b.v - a.v).slice(0, 3) : attrs;

  return (
    <div
      onClick={onClick}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      aria-label={`${card.name}, overall ${card.overall}, ${card.position}`}
      data-rarity={card.rarity}
      className={`${dims} aspect-[7/10] h-auto shrink-0 fc-card relative cursor-pointer select-none rounded-2xl overflow-hidden max-w-full ${animateHover ? 'fc-card--interactive' : ''} ${card.rarity === 'icon' ? 'rgb-card' : ''} ${isSecret ? 'bg-[#08090D]' : ''}`}
      style={{
        border: card.rarity === 'icon' ? '4px solid #ff0040' : isSecret ? '3px solid #7B8492' : `2px solid ${meta.color}`,
        '--card-rarity-color': meta.color,
        '--card-tilt-x': '0deg',
        '--card-tilt-y': '0deg',
        '--card-shine-x': '50%',
        '--card-shine-y': '40%',
        boxShadow: isSecret
          ? '0 0 0 1px rgba(255,255,255,0.12) inset, 0 0 28px rgba(8,9,13,0.7)'
          : '0 8px 24px rgba(37,39,51,0.15)',
      } as CSSProperties}
    >
      {isNew && <span className={`absolute z-20 bg-[var(--red)] text-white fc-badge font-bold px-2 py-0.5 rounded-full shadow`} style={{ top: compact ? '21cqw' : '33cqw', right: '4.2cqw' }}>NOVA</span>}

      {img ? (
        <img src={img} alt={card.name} loading="lazy" decoding="async" draggable={false} className="absolute inset-0 w-full h-full object-cover object-top" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg)] to-[var(--border)] flex items-center justify-center opacity-20"><Circle className="w-12 h-12" /></div>
      )}

      {isCredit ? (
        <div className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
      ) : (
        <div className={`absolute inset-0 ${isSecret ? 'bg-gradient-to-t from-[#050609]/95 via-[#08090D]/50 to-black/20' : 'bg-gradient-to-t from-black/80 via-black/35 to-transparent'}`} />
      )}
      <div className="fc-card-hologram" aria-hidden="true" />

      <div className="absolute flex flex-col items-start gap-1 z-10 max-w-[60%]" style={{ top: '4.2cqw', left: '4.2cqw' }}>
        <span
          className={`fc-badge font-bold px-2 py-0.5 rounded-full truncate max-w-full ${isCredit ? 'border border-sky-200/70 shadow-sm' : ''} ${card.rarity === 'icon' ? 'rgb-stat' : ''} ${isSecret ? 'border border-[#BFC5CE] shadow-[0_0_10px_rgba(255,255,255,0.2)]' : ''}`}
          style={{
            background: isCredit ? '#075985' : card.rarity === 'icon' ? undefined : meta.color,
            color: isCredit ? '#bae6fd' : '#fff',
          }}
        >
          {isCredit ? 'DEVELOPER' : meta.label}
        </span>
        {(specialLabel || (card.special && card.special !== 'none')) && (
          <span className="fc-special font-bold px-1.5 py-0.5 rounded line-clamp-2 max-w-full leading-tight" style={{ background: SPECIAL_META[card.special]?.color ?? '', color: '#fff' }}>
            {specialLabel ?? SPECIAL_META[card.special]?.label ?? ''}
          </span>
        )}
      </div>
      <div className={`absolute z-10 fc-ovr ${isCredit ? 'fc-ovr--credit' : ''} font-bold leading-none ${card.rarity === 'icon' ? 'rgb-text' : ''}`} style={{ top: '4.2cqw', right: '4.2cqw', color: card.rarity === 'icon' ? undefined : isSecret ? '#F3F4F6' : meta.color, textShadow: isCredit ? '0 1px 2px rgba(0,0,0,0.55)' : '0 2px 4px rgba(0,0,0,0.8)' }}>
        {card.overall}
      </div>

      {(!compact || positionLabel) && (
        <div className={`absolute z-10 fc-edition max-w-[35%] truncate ${isCredit ? 'rounded bg-black/70 px-1.5 py-0.5 font-semibold text-white' : 'text-white/70'}`} style={{ top: '21cqw', right: '4.2cqw' }}>
          {card.edition}
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 fc-pad z-10">
        <div className="fc-pos text-white/80 truncate">{positionLabel ? `${positionLabel} · ${card.club}` : compact ? card.position : `${card.position} · ${card.club}`}</div>
        <div className={`${isCredit ? 'fc-name--credit truncate whitespace-nowrap' : compact ? 'fc-name--compact line-clamp-2' : 'fc-name line-clamp-2'} font-bold text-white leading-tight mt-0.5`}>{card.name}</div>
        <div className={isCredit
          ? 'grid grid-cols-6 gap-0 rounded-lg bg-black/40 px-1 py-1 mt-1.5 fc-attr--credit'
          : `grid ${compact ? 'grid-cols-3 fc-attr--compact' : 'grid-cols-6 fc-attr'} gap-1 mt-1.5`}
        >
          {visibleAttrs.map(a => (
            <div key={a.l} className={isCredit
              ? 'flex flex-col items-center py-0.5'
              : `flex flex-col items-center rounded py-0.5 px-0.5 ${card.rarity === 'icon' ? 'rgb-stat' : isSecret ? 'border border-white/25 bg-[#090B10]/80' : 'bg-black/50'}`}
            >
              <span className={`${isCredit ? 'text-white/60' : 'text-white/70'} leading-none`}>{a.l}</span>
              <span className={`${isCredit ? 'font-semibold' : 'font-bold'} text-white leading-none mt-0.5`}>{a.v}</span>
            </div>
          ))}
        </div>
      </div>

      {card.favorite && <Star className="absolute bottom-2 right-2 text-[#f5c542] z-20" style={{ width: 'max(10px, 8cqw)', height: 'max(10px, 8cqw)' }} />}
    </div>
  );
}
