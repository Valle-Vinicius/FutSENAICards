import { motion } from 'framer-motion';
import type { PlayerCard } from '../types';
import { RARITY_META, SPECIAL_META } from '../types';
import { getPlayerImage } from '../data/players';
import { Circle, Star } from 'lucide-react';

export default function Card({ card, size = 'md', onClick, isNew }: { card: PlayerCard; size?: 'sm'|'md'|'lg'; onClick?: () => void; isNew?: boolean }) {
  const meta = RARITY_META[card.rarity];
  const img = getPlayerImage(card.name) || card.image;
  const isGK = card.position === 'GK';
  const dims = size === 'sm' ? 'w-36 h-52' : size === 'lg' ? 'w-60 h-84' : 'w-48 h-64';
  const attrFont = size === 'sm' ? 'text-[10px]' : 'text-[11px]';
  const nameFont = size === 'sm' ? 'text-sm' : 'text-base';

  const attrs = isGK
    ? [{l:'REF',v:card.reflexes ?? 0},{l:'POS',v:card.positioning ?? 0},{l:'HAN',v:card.handling ?? 0},{l:'VEL',v:card.pace},{l:'DEF',v:card.defending},{l:'FIS',v:card.physical}]
    : [{l:'VEL',v:card.pace},{l:'CHU',v:card.shooting},{l:'PAS',v:card.passing},{l:'DRI',v:card.dribbling},{l:'DEF',v:card.defending},{l:'FIS',v:card.physical}];

  return (
    <motion.div
      whileHover={{ y: -4 }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      aria-label={`${card.name}, overall ${card.overall}, ${card.position}`}
      className={`${dims} relative cursor-pointer select-none rounded-2xl overflow-hidden max-w-full ${card.rarity === 'icon' ? 'rgb-card' : ''}`}
      style={{ border: card.rarity === 'icon' ? '4px solid #ff0040' : `2px solid ${meta.color}`, boxShadow: `0 8px 24px rgba(37,39,51,0.15)` }}
    >
      {isNew && <span className="absolute top-16 right-2 z-20 bg-[#E30613] text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">NOVA</span>}

      {img ? (
        <img src={img} alt={card.name} className="absolute inset-0 w-full h-full object-cover object-top" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-[#F7F7F9] to-[#E9EAF0] flex items-center justify-center opacity-20"><Circle className="w-12 h-12" /></div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />

      <div className="absolute top-2 left-2 flex flex-col items-start gap-1 z-10 max-w-[60%]">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full truncate max-w-full ${card.rarity === 'icon' ? 'rgb-stat' : ''}`} style={{ background: card.rarity === 'icon' ? undefined : meta.color, color: '#fff' }}>{meta.label}</span>
        {card.special !== 'none' && (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded line-clamp-2 max-w-full leading-tight" style={{ background: SPECIAL_META[card.special].color, color: '#fff' }}>
            {SPECIAL_META[card.special].label}
          </span>
        )}
      </div>
      <div className={`absolute top-2 right-2 z-10 text-2xl font-bold leading-none ${card.rarity === 'icon' ? 'rgb-text' : ''}`} style={{ color: card.rarity === 'icon' ? undefined : meta.color, textShadow: '0 2px 4px rgba(0,0,0,0.6)' }}>
        {card.overall}
      </div>

      <div className="absolute top-10 right-2 z-10 text-[8px] text-white/70 max-w-[35%] truncate">
        {card.edition}
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-2.5 z-10">
        <div className="text-[10px] text-white/80 truncate">{card.position} · {card.club}</div>
        <div className={`${nameFont} font-bold text-white leading-tight line-clamp-2 mt-0.5`}>{card.name}</div>
        <div className={`grid grid-cols-6 gap-1 mt-1.5 ${attrFont}`}>
          {attrs.map(a => (
            <div key={a.l} className={`flex flex-col items-center rounded py-0.5 px-0.5 ${card.rarity === 'icon' ? 'rgb-stat' : 'bg-black/50'}`}>
              <span className="text-white/70 leading-none">{a.l}</span>
              <span className="font-bold text-white leading-none mt-0.5">{a.v}</span>
            </div>
          ))}
        </div>
      </div>

      {card.favorite && <Star className="absolute bottom-2 right-2 text-[#f5c542] w-4 h-4 z-20" />}
    </motion.div>
  );
}
