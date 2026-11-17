import { motion } from 'framer-motion';
import type { PlayerCard } from '../types';
import { RARITY_META, SPECIAL_META } from '../types';
import { getPlayerImage } from '../data/players';
import { Circle, Star } from 'lucide-react';

export default function Card({ card, size = 'md', onClick, isNew }: { card: PlayerCard; size?: 'sm'|'md'|'lg'|'fluid'; onClick?: () => void; isNew?: boolean }) {
  const meta = RARITY_META[card.rarity] ?? RARITY_META.common;
  const img = card.image || getPlayerImage(card.name);
  const isGK = card.position === 'GK';
  const isSecret = card.rarity === 'secret';
  const compact = size === 'sm' || size === 'fluid';
  const canHover = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: hover)').matches;
  const dims = size === 'fluid' ? 'w-full' : size === 'sm' ? 'w-36' : size === 'lg' ? 'w-60' : 'w-48';

  const attrs = isGK
    ? [{l:'REF',v:card.reflexes ?? 0},{l:'POS',v:card.positioning ?? 0},{l:'HAN',v:card.handling ?? 0},{l:'VEL',v:card.pace},{l:'DEF',v:card.defending},{l:'FIS',v:card.physical}]
    : [{l:'VEL',v:card.pace},{l:'CHU',v:card.shooting},{l:'PAS',v:card.passing},{l:'DRI',v:card.dribbling},{l:'DEF',v:card.defending},{l:'FIS',v:card.physical}];
  const visibleAttrs = compact ? [...attrs].sort((a, b) => b.v - a.v).slice(0, 3) : attrs;

  return (
    <motion.div
      whileHover={canHover ? { y: -4 } : undefined}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      aria-label={`${card.name}, overall ${card.overall}, ${card.position}`}
      className={`${dims} aspect-[7/10] h-auto shrink-0 fc-card relative cursor-pointer select-none rounded-2xl overflow-hidden max-w-full ${card.rarity === 'icon' ? 'rgb-card' : ''} ${isSecret ? 'bg-[#08090D]' : ''}`}
      style={{
        border: card.rarity === 'icon' ? '4px solid #ff0040' : isSecret ? '3px solid #7B8492' : `2px solid ${meta.color}`,
        boxShadow: isSecret
          ? '0 0 0 1px rgba(255,255,255,0.12) inset, 0 0 28px rgba(8,9,13,0.7)'
          : '0 8px 24px rgba(37,39,51,0.15)',
      }}
    >
      {isNew && <span className={`absolute z-20 bg-[#E30613] text-white fc-badge font-bold px-2 py-0.5 rounded-full shadow`} style={{ top: compact ? '21cqw' : '33cqw', right: '4.2cqw' }}>NOVA</span>}

      {img ? (
        <img src={img} alt={card.name} loading="lazy" decoding="async" draggable={false} className="absolute inset-0 w-full h-full object-cover object-top" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-[#F7F7F9] to-[#E9EAF0] flex items-center justify-center opacity-20"><Circle className="w-12 h-12" /></div>
      )}

      <div className={`absolute inset-0 ${isSecret ? 'bg-gradient-to-t from-[#050609]/95 via-[#08090D]/50 to-black/20' : 'bg-gradient-to-t from-black/80 via-black/35 to-transparent'}`} />

      <div className="absolute flex flex-col items-start gap-1 z-10 max-w-[60%]" style={{ top: '4.2cqw', left: '4.2cqw' }}>
        <span
          className={`fc-badge font-bold px-2 py-0.5 rounded-full truncate max-w-full ${card.rarity === 'icon' ? 'rgb-stat' : ''} ${isSecret ? 'border border-[#BFC5CE] shadow-[0_0_10px_rgba(255,255,255,0.2)]' : ''}`}
          style={{ background: card.rarity === 'icon' ? undefined : meta.color, color: '#fff' }}
        >
          {meta.label}
        </span>
        {card.special && card.special !== 'none' && (
          <span className="fc-special font-bold px-1.5 py-0.5 rounded line-clamp-2 max-w-full leading-tight" style={{ background: SPECIAL_META[card.special]?.color ?? '', color: '#fff' }}>
            {SPECIAL_META[card.special]?.label ?? ''}
          </span>
        )}
      </div>
      <div className={`absolute z-10 fc-ovr font-bold leading-none ${card.rarity === 'icon' ? 'rgb-text' : ''}`} style={{ top: '4.2cqw', right: '4.2cqw', color: card.rarity === 'icon' ? undefined : isSecret ? '#F3F4F6' : meta.color, textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
        {card.overall}
      </div>

      {!compact && (
        <div className="absolute z-10 fc-edition text-white/70 max-w-[35%] truncate" style={{ top: '21cqw', right: '4.2cqw' }}>
          {card.edition}
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 fc-pad z-10">
        <div className="fc-pos text-white/80 truncate">{compact ? card.position : `${card.position} · ${card.club}`}</div>
        <div className={`${compact ? 'fc-name--compact' : 'fc-name'} font-bold text-white leading-tight line-clamp-2 mt-0.5`}>{card.name}</div>
        <div className={`grid ${compact ? 'grid-cols-3 fc-attr--compact' : 'grid-cols-6 fc-attr'} gap-1 mt-1.5`}>
          {visibleAttrs.map(a => (
            <div key={a.l} className={`flex flex-col items-center rounded py-0.5 px-0.5 ${card.rarity === 'icon' ? 'rgb-stat' : isSecret ? 'border border-white/25 bg-[#090B10]/80' : 'bg-black/50'}`}>
              <span className="text-white/70 leading-none">{a.l}</span>
              <span className="font-bold text-white leading-none mt-0.5">{a.v}</span>
            </div>
          ))}
        </div>
      </div>

      {card.favorite && <Star className="absolute bottom-2 right-2 text-[#f5c542] z-20" style={{ width: 'max(10px, 8cqw)', height: 'max(10px, 8cqw)' }} />}
    </motion.div>
  );
}
