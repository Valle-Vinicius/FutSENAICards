import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { PackageOpen } from 'lucide-react';
import { useGame } from '../store/useGame';
import { RARITY_META, RARITY_ORDER, type PackDef } from '../types';

const PACK_SECTIONS = [
  { title: 'Clássicos', ids: ['bronze', 'silver', 'gold', 'premium'] },
  { title: 'Especiais', ids: ['rareplayers', 'legends', 'position_gk', 'choice'] },
  { title: 'Eventos', ids: ['off_sale'] },
];

const PACK_BUTTON_STYLES: Record<string, { background: string; foreground: string }> = {
  '#cd7f32': { background: '#cd7f32', foreground: '#252733' },
  '#c0c0c0': { background: '#c0c0c0', foreground: '#252733' },
  '#f5c542': { background: '#f5c542', foreground: '#252733' },
  '#e30613': { background: '#E30613', foreground: '#FFFFFF' },
  '#a855f7': { background: '#7e22ce', foreground: '#FFFFFF' },
  '#3b82f6': { background: '#1d4ed8', foreground: '#FFFFFF' },
  '#b6ff3b': { background: '#b6ff3b', foreground: '#252733' },
};

const PACK_ICON_COLORS: Record<string, string> = {
  '#cd7f32': '#252733',
  '#c0c0c0': '#252733',
  '#f5c542': '#252733',
  '#e30613': '#E30613',
  '#a855f7': '#7e22ce',
  '#3b82f6': '#1d4ed8',
  '#b6ff3b': '#252733',
};

function renderPack(pack: PackDef, coins: number) {
  const color = pack.color || '#858A98';
  const normalizedColor = color.toLowerCase();
  const buttonStyle = PACK_BUTTON_STYLES[normalizedColor] ?? (
    pack.color
      ? { background: color, foreground: '#252733' }
      : { background: '#6B7280', foreground: '#FFFFFF' }
  );
  const iconColor = PACK_ICON_COLORS[normalizedColor] ?? '#252733';
  const hasBalance = coins >= pack.price;
  const style = {
    borderTopColor: color,
    '--pack-glow': `${color}44`,
  } as CSSProperties;
  const rarityEntries = RARITY_ORDER.map(rarity => [rarity, pack.probabilities[rarity]] as const);
  const ariaProbabilities = rarityEntries
    .map(([rarity, chance]) => `${RARITY_META[rarity].label} ${(chance * 100).toFixed(1)}%`)
    .join(', ');

  return (
    <article
      key={pack.id}
      className="card-surface aspect-square w-full min-w-0 flex flex-col gap-2 overflow-hidden border-t-4 p-2 transition-shadow hover:shadow-[0_0_18px_var(--pack-glow)] motion-reduce:transition-none"
      style={style}
    >
      <header className="flex min-h-0 flex-col items-center text-center">
        <div
          className="mb-1 flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${color}22`, color: iconColor }}
          aria-hidden="true"
        >
          <PackageOpen className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <h3 className="text-sm font-bold leading-4 tracking-wide text-[#252733]">{pack.name.toLocaleUpperCase('pt-BR')}</h3>
        <p className="mt-1 min-h-8 text-xs leading-4 text-[#626879]">{pack.description}</p>
      </header>

      <div className="flex items-center justify-between gap-1 border-y border-[#E9EAF0] py-1 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-[#626879]">Cartas</span>
          <span className="font-semibold text-[#252733]">{pack.cards}</span>
        </div>
        <div className="flex min-w-0 items-center gap-1">
          <span className="text-[#626879]">Preço</span>
          <span
            className="whitespace-nowrap rounded-md px-1.5 py-0.5 text-right font-bold text-[#252733]"
            style={{ backgroundColor: `${color}22` }}
          >
            {pack.price === 0 ? 'Evento' : `${pack.price.toLocaleString('pt-BR')} moedas`}
          </span>
        </div>
      </div>

      <div className="space-y-1">
        <h4 className="text-xs font-semibold text-[#424858]">Probabilidades</h4>
        <div
          role="img"
          aria-label={`Probabilidades: ${ariaProbabilities}`}
          className="flex h-2 overflow-hidden rounded-full bg-[#E9EAF0]"
        >
          {rarityEntries.map(([rarity, chance]) => chance > 0 && (
            <span
              key={rarity}
              className="h-full"
              style={{ width: `${chance * 100}%`, backgroundColor: RARITY_META[rarity].color }}
            />
          ))}
        </div>
        <ul className="grid grid-cols-2 gap-x-2 text-xs leading-4 text-[#424858]">
          {rarityEntries.map(([rarity, chance]) => (
            <li key={rarity} className="flex min-w-0 items-center justify-between gap-1">
              <span className="flex min-w-0 items-center gap-1">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: RARITY_META[rarity].color }} aria-hidden="true" />
                <span className="truncate">{RARITY_META[rarity].label}</span>
              </span>
              <span className="shrink-0 tabular-nums">{(chance * 100).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto">
        {!pack.unlocked ? (
          <div className="flex min-h-11 items-center justify-center text-center text-xs text-[#626879]">
            Bloqueado (complete missões)
          </div>
        ) : (
          <Link
            to={`/open/${pack.id}`}
            aria-disabled={!hasBalance}
            tabIndex={hasBalance ? undefined : -1}
            className={`flex min-h-11 w-full items-center justify-center rounded-xl px-3 text-center text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#252733] ${
              hasBalance
                ? 'text-white transition-[filter] hover:brightness-110 motion-reduce:transition-none'
                : 'pointer-events-none cursor-not-allowed bg-[#D5D8E0] text-[#424858]'
            }`}
            style={hasBalance ? { backgroundColor: buttonStyle.background, color: buttonStyle.foreground } : undefined}
          >
            {hasBalance ? 'ABRIR' : 'Saldo insuficiente'}
          </Link>
        )}
      </div>
    </article>
  );
}

export default function Packs() {
  const packs = useGame(s => s.packConfigs);
  const coins = useGame(s => s.coins);
  const knownIds = new Set(PACK_SECTIONS.flatMap(section => section.ids));
  const sections = PACK_SECTIONS.map(section => ({
    title: section.title,
    packs: packs.filter(pack => section.ids.includes(pack.id)),
  })).filter(section => section.packs.length > 0);
  const otherPacks = packs.filter(pack => !knownIds.has(pack.id));
  if (otherPacks.length > 0) sections.push({ title: 'Outros', packs: otherPacks });

  return (
    <div className="space-y-6 p-4 pb-12 md:p-8">
      <h1 className="text-2xl font-semibold text-[#252733] md:text-3xl">Loja de pacotes</h1>
      {sections.map(section => (
        <section key={section.title} className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#424858]">{section.title}</h2>
          <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {section.packs.map(pack => renderPack(pack, coins))}
          </div>
        </section>
      ))}
    </div>
  );
}
