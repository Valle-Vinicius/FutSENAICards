import { motion } from 'framer-motion';
import type { PlayerCard } from '../types';
import { RARITY_META, SPECIAL_META } from '../types';

export default function Card({ card, size = 'md', onClick, isNew }: { card: PlayerCard; size?: 'sm'|'md'|'lg'; onClick?: () => void; isNew?: boolean }) {
  const meta = RARITY_META[card.rarity];
  const isGK = ['GK','FutsalGK'].includes(card.position);
  const dims = size === 'sm' ? 'w-32 h-44' : size === 'lg' ? 'w-56 h-80' : 'w-44 h-60';

  const attrs = isGK
    ? [{l:'REF',v:card.reflexes ?? 0},{l:'POS',v:card.positioning ?? 0},{l:'HAN',v:card.handling ?? 0},{l:'PAC',v:card.pace},{l:'DEF',v:card.defending},{l:'FIS',v:card.physical}]
    : [{l:'PAC',v:card.pace},{l:'SHO',v:card.shooting},{l:'PAS',v:card.passing},{l:'DRI',v:card.dribbling},{l:'DEF',v:card.defending},{l:'PHY',v:card.physical}];

  return (
    <motion.div
      whileHover={{ y: -4 }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      aria-label={`${card.name}, overall ${card.overall}, ${card.position}`}
      className={`${dims} relative cursor-pointer select-none rounded-2xl overflow-hidden max-w-full`}
      style={{ border: `2px solid ${meta.color}`, boxShadow: `0 8px 24px rgba(37,39,51,0.15)` }}
    >
      {isNew && <span className="absolute top-2 right-2 z-20 bg-[#E30613] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">NOVA</span>}

      {card.image ? (
        <img src={card.image} alt={card.name} className="absolute inset-0 w-full h-full object-cover object-top" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-[#F7F7F9] to-[#E9EAF0] flex items-center justify-center text-5xl opacity-20">⚽</div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />

      <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10">
        <div className="flex flex-col items-start gap-1">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: meta.color, color: '#fff' }}>{meta.label}</span>
          {card.special !== 'none' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded truncate max-w-full" style={{ background: SPECIAL_META[card.special].color, color: '#fff' }}>{SPECIAL_META[card.special].label}</span>}
        </div>
        <div className="text-2xl font-bold leading-none" style={{ color: meta.color, textShadow: '0 2px 4px rgba(0,0,0,0.6)' }}>{card.overall}</div>
      </div>

      <div className="absolute top-10 right-2 text-[9px] text-white/70 z-10">{card.edition}</div>

      <div className="absolute bottom-0 left-0 right-0 p-2.5 z-10">
        <div className="text-[10px] text-white/70">{card.position} · {card.club}</div>
        <div className="text-sm font-bold text-white truncate">{card.name}</div>
        <div className="grid grid-cols-6 gap-0.5 mt-1.5 text-[9px]">
          {attrs.map(a => (
            <div key={a.l} className="flex flex-col items-center bg-black/40 rounded py-0.5">
              <span className="text-white/60">{a.l}</span>
              <span className="font-bold text-white">{a.v}</span>
            </div>
          ))}
        </div>
      </div>

      {card.favorite && <span className="absolute bottom-2 right-2 text-[#f5c542] text-sm z-20">★</span>}
    </motion.div>
  );
}
