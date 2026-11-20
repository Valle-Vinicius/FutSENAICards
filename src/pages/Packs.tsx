import type { CSSProperties } from 'react';
import { ArrowUpRight, Coins, LockKeyhole, PackageOpen, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import bronzeArt from '../imagens/pacotes/bronze.png';
import silverArt from '../imagens/pacotes/prata.png';
import goldArt from '../imagens/pacotes/ouro.png';
import premiumArt from '../imagens/pacotes/premium.png';
import rarePlayersArt from '../imagens/pacotes/jogadoresraros.png';
import legendsArt from '../imagens/pacotes/lendas.png';
import goalkeepersArt from '../imagens/pacotes/goleiros.png';
import choiceArt from '../imagens/pacotes/escolhaespecial.png';
import offSaleArt from '../imagens/pacotes/offsale.png';
import { PACK_RARITY_ORDER, RARITY_META, type PackDef } from '../types';
import { useGame } from '../store/useGame';

const PACK_SECTIONS = [
  {
    title: 'Clássicos',
    eyebrow: 'A base do seu elenco',
    description: 'Do primeiro reforço àquele upgrade que faltava.',
    ids: ['bronze', 'silver', 'gold', 'premium'],
    accent: '#e30613',
  },
  {
    title: 'Especiais',
    eyebrow: 'Cartas fora de série',
    description: 'Pacotes para quem está caçando raridades.',
    ids: ['rareplayers', 'legends', 'position_gk', 'choice'],
    accent: '#8f5a1d',
  },
  {
    title: 'Eventos',
    eyebrow: 'Edições de ocasião',
    description: 'Oportunidades especiais que entram em campo.',
    ids: ['off_sale'],
    accent: '#7e22ce',
  },
];

const PACK_ART: Record<string, string> = {
  bronze: bronzeArt,
  silver: silverArt,
  gold: goldArt,
  premium: premiumArt,
  rareplayers: rarePlayersArt,
  legends: legendsArt,
  position_gk: goalkeepersArt,
  choice: choiceArt,
  off_sale: offSaleArt,
};

function formatProbability(chance: number) {
  return `${(chance * 100).toLocaleString('pt-BR', { maximumFractionDigits: 12 })}%`;
}

function renderPack(pack: PackDef, coins: number) {
  const color = pack.color || '#6b7280';
  const canAfford = coins >= pack.price;
  const normalizedColor = color.toLowerCase();
  const darkButtonText = ['#cd7f32', '#c0c0c0', '#f5c542', '#b6ff3b'].includes(normalizedColor);
  const buttonColor = normalizedColor === '#3b82f6'
    ? '#1d4ed8'
    : normalizedColor === '#a855f7'
      ? '#7e22ce'
      : color;
  const isFeatured = pack.id === 'premium';
  const isLegendary = pack.id === 'legends';
  const rarityEntries = PACK_RARITY_ORDER.map(rarity => [rarity, pack.probabilities[rarity]] as const);
  const ariaProbabilities = rarityEntries
    .map(([rarity, chance]) => `${RARITY_META[rarity].label} ${formatProbability(chance)}`)
    .join(', ');
  const style = {
    '--pack-color': color,
    borderColor: isFeatured ? color : 'rgb(226 228 232)',
  } as CSSProperties;

  return (
    <article
      key={pack.id}
      className={`group relative flex min-h-[31rem] min-w-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_8px_24px_rgba(24,27,34,0.06)] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_16px_34px_rgba(24,27,34,0.14)] motion-reduce:transform-none motion-reduce:transition-none ${
        isFeatured ? 'ring-1 ring-[#e30613]/20' : ''
      }`}
      style={style}
    >
      <div
        className="relative isolate flex h-52 shrink-0 items-center justify-center overflow-hidden border-b border-black/5 sm:h-56"
        style={{
          background: 'linear-gradient(145deg, color-mix(in srgb, var(--pack-color) 20%, white), #f1f2f4 72%)',
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-35"
          style={{
            backgroundImage:
              'linear-gradient(90deg, transparent 49.8%, rgba(35,38,44,.12) 50%, transparent 50.2%), radial-gradient(circle at center, transparent 0 42%, rgba(35,38,44,.13) 42.2% 42.6%, transparent 42.8%), linear-gradient(0deg, transparent 49.8%, rgba(35,38,44,.08) 50%, transparent 50.2%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full opacity-20 blur-3xl"
          style={{ backgroundColor: color }}
        />
        <span
          className="absolute left-4 top-4 z-10 inline-flex min-h-7 items-center gap-1.5 border px-2.5 text-[9px] font-black uppercase tracking-[0.13em] backdrop-blur-sm"
          style={{ borderColor: `${color}66`, backgroundColor: 'rgba(255,255,255,.82)', color }}
        >
          {isFeatured ? <Sparkles aria-hidden="true" className="h-3 w-3" /> : <PackageOpen aria-hidden="true" className="h-3 w-3" />}
          {isFeatured ? 'Destaque da loja' : isLegendary ? 'Raridade máxima' : pack.price === 0 ? 'Evento' : 'Pacote FUTSENAI'}
        </span>
        {PACK_ART[pack.id] ? (
          <img
            src={PACK_ART[pack.id]}
            alt={`Embalagem original do ${pack.name}`}
            loading={isFeatured ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
            className={`relative z-[1] h-[94%] w-[70%] object-contain drop-shadow-[0_14px_12px_rgba(0,0,0,0.22)] transition-transform duration-300 group-hover:scale-[1.035] motion-reduce:transition-none ${
              isFeatured ? 'sm:h-[102%]' : ''
            }`}
          />
        ) : (
          <PackageOpen aria-hidden="true" className="relative z-[1] h-20 w-20 text-[#3d4149]" strokeWidth={1.2} />
        )}
        <div className="absolute bottom-3 left-4 z-10 flex items-center gap-2 rounded-full border border-white/70 bg-white/90 px-2.5 py-1 text-[10px] font-bold text-[#24262b] shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
          {pack.cards} {pack.cards === 1 ? 'carta' : 'cartas'}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="min-h-[74px]">
          <h3 className="font-[Arial_Narrow,Impact,sans-serif] text-lg font-black leading-5 tracking-tight text-[#17191d]">
            {pack.name.toLocaleUpperCase('pt-BR')}
          </h3>
          <p className="mt-1.5 line-clamp-2 text-xs leading-[1.45rem] text-[#626879]">{pack.description}</p>
        </div>

        <div className="mt-3 flex items-end justify-between gap-2 border-y border-[#eceef1] py-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#777d87]">Conteúdo</p>
            <p className="mt-0.5 text-sm font-extrabold tabular-nums text-[#22252a]">{pack.cards} cartas</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#777d87]">Preço</p>
            <p className="mt-0.5 flex items-center justify-end gap-1 text-sm font-extrabold tabular-nums text-[#22252a]">
              {pack.price === 0 ? 'Evento' : pack.price.toLocaleString('pt-BR')}
              {pack.price > 0 && <Coins aria-hidden="true" className="h-3.5 w-3.5 text-[#e30613]" />}
            </p>
          </div>
        </div>

        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#555b65]">Chances por raridade</h4>
            <span className="text-[9px] font-medium text-[#9297a0]">reais</span>
          </div>
          <div
            role="img"
            aria-label={`Probabilidades: ${ariaProbabilities}`}
            className="flex h-2 overflow-hidden rounded-full bg-[#eceef1]"
          >
            {rarityEntries.map(([rarity, chance]) => chance > 0 && (
              <span
                key={rarity}
                className="h-full"
                style={{ width: `${chance * 100}%`, backgroundColor: RARITY_META[rarity].color }}
              />
            ))}
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {rarityEntries.filter(([, chance]) => chance > 0).map(([rarity, chance]) => (
              <li key={rarity} className="flex min-w-0 items-center justify-between gap-1 text-[10px] leading-4">
                <span className="flex min-w-0 items-center gap-1.5 text-[#656b75]">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: RARITY_META[rarity].color }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{RARITY_META[rarity].label}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-[#30343a]">{formatProbability(chance)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-auto pt-4">
          {!pack.unlocked ? (
            <div className="flex min-h-11 items-center justify-center gap-2 border border-dashed border-[#d6d8dd] bg-[#f7f7f8] px-3 text-center text-xs font-semibold text-[#626879]">
              <LockKeyhole aria-hidden="true" className="h-4 w-4" />
              Bloqueado · complete missões
            </div>
          ) : (
            <Link
              to={`/open/${pack.id}`}
              aria-disabled={!canAfford}
              tabIndex={canAfford ? undefined : -1}
              className={`flex min-h-11 w-full items-center justify-center gap-2 px-4 text-center text-xs font-black uppercase tracking-[0.12em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17191d] ${
                canAfford
                  ? 'text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.99] motion-reduce:transition-none'
                  : 'pointer-events-none cursor-not-allowed bg-[#e6e7ea] text-[#686d76]'
              }`}
              style={canAfford ? { backgroundColor: buttonColor, color: darkButtonText ? '#17191d' : '#fff' } : undefined}
            >
              {canAfford ? (
                <>
                  ABRIR
                  <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                </>
              ) : (
                <>
                  <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" />
                  Saldo insuficiente
                </>
              )}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Packs() {
  const packs = useGame(s => s.packConfigs);
  const coins = useGame(s => s.coins);
  const knownIds = new Set(PACK_SECTIONS.flatMap(section => section.ids));
  const sections = PACK_SECTIONS.map(section => ({
    ...section,
    packs: packs.filter(pack => section.ids.includes(pack.id)),
  })).filter(section => section.packs.length > 0);
  const otherPacks = packs.filter(pack => !knownIds.has(pack.id));
  if (otherPacks.length > 0) {
    sections.push({
      title: 'Outros',
      eyebrow: 'Mais opções',
      description: 'Outros pacotes disponíveis no clube.',
      ids: [],
      accent: '#626879',
      packs: otherPacks,
    });
  }

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#fff_0%,#f4f5f7_44%,#fff_100%)] px-4 pb-10 pt-5 text-[#17191d] sm:px-6 sm:pt-7 lg:px-9">
      <div className="mx-auto w-full max-w-[1440px]">
        <header className="relative mb-8 overflow-hidden border-b border-[#e6e7ea] pb-6 sm:mb-10 sm:pb-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-14 -top-20 h-56 w-56 rounded-full bg-[#e30613]/[0.07] blur-3xl"
          />
          <div className="relative flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-3xl">
              <p className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.17em] text-[#777d87]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#e30613]" />
                Central de pacotes <span className="text-[#e30613]">/</span> FUTSENAI
              </p>
              <h1 className="font-[Arial_Narrow,Impact,sans-serif] text-4xl font-black uppercase leading-[0.94] tracking-[-0.055em] text-[#17191d] sm:text-5xl lg:text-6xl">
                A próxima carta
                <span className="block text-[#e30613]">pode ser sua.</span>
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[#626879] sm:text-base">
                Escolha seu pacote, confira as chances e prepare o elenco para a próxima rodada.
              </p>
            </div>

            <div className="flex min-h-14 min-w-[164px] items-center gap-3 border-l-2 border-[#e30613] bg-white/80 px-4 py-2 shadow-[0_6px_20px_rgba(24,27,34,0.06)]">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fff0f1] text-[#e30613]">
                <Coins aria-hidden="true" className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-[9px] font-bold uppercase tracking-[0.13em] text-[#777d87]">Seu saldo</span>
                <strong className="mt-0.5 block text-lg font-black tabular-nums leading-5 text-[#17191d]">
                  {coins.toLocaleString('pt-BR')}
                  <span className="ml-1 text-xs font-semibold text-[#626879]">moedas</span>
                </strong>
              </span>
            </div>
          </div>
        </header>

        <div className="space-y-9 sm:space-y-12">
          {sections.map((section, index) => (
            <section
              key={section.title}
              aria-labelledby={`pack-section-${index}`}
              className={`relative isolate overflow-hidden border-t-2 border-[#dedfe3] pt-5 sm:pt-6 ${
                section.title === 'Especiais' ? 'border-t-[#d7c6a9]' : section.title === 'Eventos' ? 'border-t-[#d6c3e8]' : ''
              }`}
            >
              <div className="relative mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 sm:mb-5">
                <div>
                  <p className="mb-1 text-[9px] font-black uppercase tracking-[0.17em]" style={{ color: section.accent }}>
                    {section.eyebrow}
                  </p>
                  <h2
                    id={`pack-section-${index}`}
                    className="font-[Arial_Narrow,Impact,sans-serif] text-2xl font-black uppercase leading-none tracking-tight text-[#202329] sm:text-3xl"
                  >
                    {section.title}
                  </h2>
                </div>
                <p className="text-xs leading-5 text-[#777d87] sm:text-sm">{section.description}</p>
              </div>
              <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5">
                {section.packs.map(pack => renderPack(pack, coins))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
