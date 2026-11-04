import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDown,
  ArrowLeftRight,
  Award,
  Check,
  Clock3,
  Crosshair,
  Footprints,
  Goal,
  Hand,
  Shield,
  ShieldAlert,
  Sparkles,
  Trophy,
  UserRound,
  X,
} from 'lucide-react';
import type { MatchEvent, MatchResult } from '../engine/match';
import { getEventPlayerName, getPvpAwards } from '../engine/pvp-result';
import type { ChallengeTeamSnapshot } from '../lib/services/challenges';
import type { Rarity, SpecialEdition } from '../types';
import { RARITY_META, SPECIAL_META } from '../types';

export interface SnapshotCardDetails {
  id: string;
  nationality?: string | null;
  age?: number | null;
  club?: string | null;
  rarity?: string | null;
  edition?: string | null;
  special?: string | null;
  image?: string | null;
  xp?: number | null;
}

interface PvpResultScreenProps {
  result: MatchResult;
  mySide: 'home' | 'away';
  homeSnapshot: ChallengeTeamSnapshot | null;
  awaySnapshot: ChallengeTeamSnapshot | null;
  cardDetailsById: Record<string, SnapshotCardDetails>;
  rewardsSyncStatus: 'syncing' | 'synced' | 'unavailable';
  onRematch: () => void;
  rematchLoading: boolean;
  onMenu: () => void;
}

type Side = 'home' | 'away';

const EMPTY_STATS = {
  possession: 0,
  passes: 0,
  passCompleted: 0,
  shots: 0,
  shotsOnTarget: 0,
  goals: 0,
  tackles: 0,
  fouls: 0,
  saves: 0,
};

const EVENT_ICON: Record<MatchEvent['type'], typeof Goal> = {
  kickoff: Clock3,
  pass: ArrowLeftRight,
  dribble: Footprints,
  shot: Crosshair,
  goal: Goal,
  save: Hand,
  miss: X,
  tackle: Shield,
  foul: ShieldAlert,
  yellow: Award,
  halftime: Clock3,
  fulltime: Trophy,
};

const RARITY_KEYS = Object.keys(RARITY_META) as Rarity[];
const SPECIAL_KEYS = Object.keys(SPECIAL_META) as SpecialEdition[];

function isRarity(value: string | null | undefined): value is Rarity {
  return !!value && RARITY_KEYS.includes(value as Rarity);
}

function isSpecial(value: string | null | undefined): value is SpecialEdition {
  return !!value && SPECIAL_KEYS.includes(value as SpecialEdition);
}

function PvpPlayerCard({
  playerName,
  playerPosition,
  overall,
  snapshotCard,
  details,
  stats,
  rating,
  accent,
  compact = false,
}: {
  playerName: string;
  playerPosition: string;
  overall: number | null;
  snapshotCard: ChallengeTeamSnapshot['cards'][number] | null;
  details?: SnapshotCardDetails;
  stats?: { goals: number; assists: number; saves: number; tackles: number };
  rating?: number;
  accent: 'gold' | 'red' | 'neutral';
  compact?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const rarity = isRarity(details?.rarity) ? details.rarity : null;
  const rarityMeta = rarity ? RARITY_META[rarity] : null;
  const special = isSpecial(details?.special) ? details.special : null;
  const exactImage = details?.image || null;
  const displayName = snapshotCard?.name ?? playerName;
  const attributes = snapshotCard
    ? [
      ['VEL', snapshotCard.pace],
      ['CHU', snapshotCard.shooting],
      ['PAS', snapshotCard.passing],
      ['DRI', snapshotCard.dribbling],
      ['DEF', snapshotCard.defending],
      ['FIS', snapshotCard.physical],
    ] as const
    : [];
  const accentClasses = accent === 'gold'
    ? 'border-amber-300/70 shadow-[0_0_34px_rgba(245,197,66,0.22)]'
    : accent === 'red'
      ? 'border-rose-400/40 shadow-[0_0_25px_rgba(227,6,19,0.14)]'
      : 'border-white/10';

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.4 }}
      className={`relative w-full overflow-hidden rounded-2xl border bg-[#10141f] ${accentClasses} ${compact ? 'max-w-[155px]' : 'max-w-[230px]'}`}
      aria-label={`Carta de ${displayName}${rating === undefined ? '' : `, nota ${rating.toFixed(1)}`}`}
    >
      <div className={`relative aspect-[3/4] overflow-hidden ${accent === 'gold' ? 'bg-gradient-to-br from-amber-200/20 via-[#25202a] to-[#151923]' : 'bg-gradient-to-br from-rose-300/10 via-[#20232e] to-[#10141f]'}`}>
        {snapshotCard && exactImage && !imageUnavailable ? (
          <img
            src={exactImage}
            alt={`Arte da carta de ${displayName}`}
            className="absolute inset-0 h-full w-full object-cover object-top"
            onError={() => setImageUnavailable(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[radial-gradient(ellipse_at_50%_35%,rgba(255,255,255,0.12),transparent_60%)] px-3 text-center">
            {snapshotCard ? <UserRound className="h-10 w-10 text-white/30" aria-hidden="true" /> : <ShieldAlert className="h-10 w-10 text-rose-300/60" aria-hidden="true" />}
            <span className="text-[9px] font-semibold tracking-[0.16em] text-white/50">
              {!snapshotCard ? 'IDENTIDADE DO SNAPSHOT INDISPONÍVEL' : 'ARTE DA INSTÂNCIA INDISPONÍVEL'}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
        <div className="absolute left-3 top-3 flex max-w-[70%] flex-col gap-1">
          {rarityMeta ? (
            <span className="w-fit rounded-full px-2 py-0.5 text-[9px] font-bold uppercase text-white" style={{ backgroundColor: rarityMeta.color }}>
              {rarityMeta.label}
            </span>
          ) : (
            <span className="w-fit rounded-full border border-white/20 bg-black/50 px-2 py-0.5 text-[9px] font-bold uppercase text-white/75">
              Carta PvP
            </span>
          )}
          {special && special !== 'none' && (
            <span className="w-fit rounded bg-black/65 px-1.5 py-0.5 text-[8px] font-bold text-amber-200">
              {SPECIAL_META[special].label}
            </span>
          )}
        </div>
        <div className={`absolute right-3 top-3 text-3xl font-black ${accent === 'gold' ? 'text-amber-200' : 'text-white'}`}>
          {snapshotCard ? snapshotCard.overall : overall ?? '—'}
        </div>
        {details?.edition && (
          <div className="absolute right-3 top-12 max-w-[42%] truncate text-[8px] font-semibold uppercase tracking-wider text-white/65">
            {details.edition}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className="truncate text-[9px] font-semibold uppercase tracking-wider text-white/60">
            {playerPosition}{details?.club ? ` · ${details.club}` : ''}
          </div>
          <div className="mt-0.5 line-clamp-2 min-h-10 text-sm font-bold leading-tight text-white">{displayName}</div>
          {attributes.length > 0 && (
            <div className="mt-2 grid grid-cols-6 gap-1">
              {attributes.map(([label, value]) => (
                <div key={label} className="rounded bg-black/55 px-0.5 py-1 text-center">
                  <div className="text-[7px] text-white/55">{label}</div>
                  <div className="text-[9px] font-bold text-white">{value}</div>
                </div>
              ))}
            </div>
          )}
          {rating !== undefined && (
            <div className={`mt-2 flex items-center justify-between rounded-lg px-2 py-1 ${accent === 'gold' ? 'bg-amber-300/20 text-amber-100' : 'bg-white/10 text-white'}`}>
              <span className="text-[9px] font-bold uppercase tracking-wider">Nota</span>
              <span className="text-lg font-black tabular-nums">{rating.toFixed(1)}</span>
            </div>
          )}
          {stats && (
            <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[9px] font-semibold text-white/80">
              {stats.goals > 0 && <span>{stats.goals} GOL{stats.goals > 1 ? 'S' : ''}</span>}
              {stats.assists > 0 && <span>{stats.assists} AST</span>}
              {stats.saves > 0 && <span>{stats.saves} DEF</span>}
              {stats.tackles > 0 && <span>{stats.tackles} DES</span>}
              {stats.goals + stats.assists + stats.saves + stats.tackles === 0 && <span>Sem ações de destaque registradas</span>}
            </div>
          )}
        </div>
      </div>
      <div className="truncate border-t border-white/10 px-2 py-1 text-center font-mono text-[8px] text-white/40" title={snapshotCard?.uid}>
        {snapshotCard ? `INSTÂNCIA ${snapshotCard.uid}` : 'SEM CORRESPONDÊNCIA EXATA NO SNAPSHOT'}
      </div>
    </motion.article>
  );
}

function ComparativeStat({
  label,
  homeValue,
  awayValue,
  homeDisplay = String(homeValue),
  awayDisplay = String(awayValue),
}: {
  label: string;
  homeValue: number;
  awayValue: number;
  homeDisplay?: string;
  awayDisplay?: string;
}) {
  const total = homeValue + awayValue;
  const homePercent = total > 0 ? Math.max(0, Math.min(100, homeValue / total * 100)) : 50;
  const awayPercent = 100 - homePercent;
  const reduceMotion = useReducedMotion();

  return (
    <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-x-3 gap-y-1.5">
      <span className="text-right text-sm font-bold tabular-nums text-white">{homeDisplay}</span>
      <span className="text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">{label}</span>
      <span className="text-sm font-bold tabular-nums text-white">{awayDisplay}</span>
      <div className="col-span-3 flex h-1.5 overflow-hidden rounded-full bg-white/10">
        <motion.div
          initial={reduceMotion ? false : { width: 0 }}
          animate={{ width: `${homePercent}%` }}
          transition={{ duration: reduceMotion ? 0 : 0.7, ease: 'easeOut' }}
          className="h-full bg-gradient-to-r from-rose-700 to-[#E30613]"
        />
        <motion.div
          initial={reduceMotion ? false : { width: 0 }}
          animate={{ width: `${awayPercent}%` }}
          transition={{ duration: reduceMotion ? 0 : 0.7, ease: 'easeOut', delay: reduceMotion ? 0 : 0.08 }}
          className="h-full bg-gradient-to-r from-sky-400 to-blue-600"
        />
      </div>
    </div>
  );
}

function eventIcon(event: MatchEvent) {
  const Icon = EVENT_ICON[event.type] ?? Sparkles;
  return <Icon className={`h-4 w-4 ${event.type === 'goal' ? 'text-amber-300' : 'text-white/55'}`} aria-hidden="true" />;
}

export default function PvpResultScreen({
  result,
  mySide,
  homeSnapshot,
  awaySnapshot,
  cardDetailsById,
  rewardsSyncStatus,
  onRematch,
  rematchLoading,
  onMenu,
}: PvpResultScreenProps) {
  const reduceMotion = useReducedMotion();
  const [showRatingFormula, setShowRatingFormula] = useState(false);
  const [unavailableRewardImages, setUnavailableRewardImages] = useState<Set<string>>(new Set());
  const { mvp, worst, awards } = getPvpAwards(result, { home: homeSnapshot, away: awaySnapshot });
  const homeStats = { ...EMPTY_STATS, ...(result.teamStats?.home ?? {}) };
  const awayStats = { ...EMPTY_STATS, ...(result.teamStats?.away ?? {}) };
  const events = result.events ?? [];
  const homeSnapshotCards = homeSnapshot?.cards ?? [];
  const awaySnapshotCards = awaySnapshot?.cards ?? [];
  const homePossessionTotal = homeStats.possession + awayStats.possession;
  const homePossession = homePossessionTotal ? Math.round(homeStats.possession / homePossessionTotal * 100) : 0;
  const awayPossession = homePossessionTotal ? 100 - homePossession : 0;
  const myScore = mySide === 'home' ? result.homeScore : result.awayScore;
  const opponentScore = mySide === 'home' ? result.awayScore : result.homeScore;
  const outcome = myScore === opponentScore ? 'draw' : myScore > opponentScore ? 'win' : 'loss';
  const outcomeLabel = outcome === 'win' ? 'VITÓRIA' : outcome === 'loss' ? 'DERROTA' : 'EMPATE';
  const outcomeColor = outcome === 'win' ? 'text-amber-200' : outcome === 'loss' ? 'text-rose-300' : 'text-white/80';
  const homeName = result.config.homeName || homeSnapshot?.name || 'Desafiante';
  const awayName = result.config.awayName || awaySnapshot?.name || 'Desafiado';
  const rewardedCards = mySnapshotCardsForSide(mySide, homeSnapshotCards, awaySnapshotCards);
  const statRows = [
    { label: 'Posse de bola', home: homePossession, away: awayPossession, percent: true },
    { label: 'Passes', home: homeStats.passes, away: awayStats.passes },
    { label: 'Passes completos', home: homeStats.passCompleted, away: awayStats.passCompleted },
    { label: 'Finalizações', home: homeStats.shots, away: awayStats.shots },
    { label: 'Chutes no alvo', home: homeStats.shotsOnTarget, away: awayStats.shotsOnTarget },
    { label: 'Desarmes', home: homeStats.tackles, away: awayStats.tackles },
    { label: 'Defesas', home: homeStats.saves, away: awayStats.saves },
    { label: 'Faltas', home: homeStats.fouls, away: awayStats.fouls },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#080b12] px-3 py-6 text-white sm:px-6 sm:py-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-40 -top-32 h-96 w-96 rounded-full bg-[#E30613]/15 blur-[120px]" />
        <div className="absolute -right-36 top-1/4 h-96 w-96 rounded-full bg-blue-700/10 blur-[130px]" />
        <div className="absolute inset-x-0 top-0 h-96 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),transparent)]" />
        <div className="absolute left-1/2 top-36 h-80 w-[1px] -translate-x-1/2 bg-gradient-to-b from-white/10 to-transparent" />
      </div>

      <div className="relative mx-auto max-w-6xl space-y-6 sm:space-y-8">
        <motion.header
          initial={reduceMotion ? false : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.45 }}
          className="flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-white/55">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E30613]/40 bg-[#E30613]/10 text-[#ff515b]">FS</span>
            FutSENAI <span className="hidden text-white/25 sm:inline">/</span><span className="hidden sm:inline">Pós-partida PvP</span>
          </div>
          <div className="rounded-full border border-emerald-300/20 bg-emerald-300/5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-200 sm:text-[10px]">
            Resultado oficial do servidor
          </div>
        </motion.header>

        <motion.section
          initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.55, delay: reduceMotion ? 0 : 0.08 }}
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#111622]/90 px-4 py-8 shadow-[0_24px_90px_rgba(0,0,0,0.35)] sm:px-8 sm:py-10"
        >
          {outcome === 'win' && <div className="pointer-events-none absolute left-1/2 top-0 h-48 w-3/4 -translate-x-1/2 bg-amber-300/10 blur-[90px]" />}
          <div className="relative grid items-center gap-6 md:grid-cols-[1fr_auto_1fr] md:gap-8">
            <div className={`order-2 text-center md:order-1 ${mySide === 'home' ? 'md:text-right' : 'md:text-left'}`}>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Desafiante · Casa</div>
              <div className="mt-2 break-words text-xl font-black sm:text-2xl">{homeName}</div>
              <div className="mt-1 text-xs text-white/45">{homeSnapshot?.formation ?? result.config.homeFormation}</div>
            </div>
            <div className="order-1 text-center md:order-2">
              <div className={`mb-3 inline-flex items-center gap-2 text-[11px] font-black tracking-[0.22em] ${outcomeColor}`}>
                {outcome === 'win' ? <Trophy className="h-4 w-4" aria-hidden="true" /> : outcome === 'loss' ? <ShieldAlert className="h-4 w-4" aria-hidden="true" /> : <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />}
                {outcomeLabel}
              </div>
              <div className="flex items-center justify-center gap-3 sm:gap-5">
                <span className={`text-6xl font-black leading-none tracking-tight tabular-nums sm:text-8xl ${mySide === 'home' && outcome === 'win' || mySide === 'away' && outcome === 'loss' ? 'text-white' : 'text-white/70'}`}>
                  {result.homeScore}
                </span>
                <span className="text-3xl font-light text-white/20 sm:text-5xl">:</span>
                <span className={`text-6xl font-black leading-none tracking-tight tabular-nums sm:text-8xl ${mySide === 'away' && outcome === 'win' || mySide === 'home' && outcome === 'loss' ? 'text-white' : 'text-white/70'}`}>
                  {result.awayScore}
                </span>
              </div>
              <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
                {result.durationMinutes || 90} minutos · apito final
              </div>
            </div>
            <div className={`order-3 text-center ${mySide === 'away' ? 'md:text-right' : 'md:text-left'}`}>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Desafiado · Visitante</div>
              <div className="mt-2 break-words text-xl font-black sm:text-2xl">{awayName}</div>
              <div className="mt-1 text-xs text-white/45">{awaySnapshot?.formation ?? result.config.awayFormation}</div>
            </div>
          </div>
        </motion.section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/75">Performance da partida</div>
              <h2 className="mt-1 text-xl font-black sm:text-2xl">Destaques individuais</h2>
            </div>
            <button
              onClick={() => setShowRatingFormula(value => !value)}
              className="text-right text-[10px] font-semibold text-white/45 underline decoration-white/20 underline-offset-4 hover:text-white/80"
              aria-expanded={showRatingFormula}
            >
              Como calculamos as notas?
            </button>
          </div>
          {showRatingFormula && (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-white/60">
              Nota determinística: base 6,0; +1,4 por gol, +0,8 por assistência, +0,35 por defesa, +0,18 por desarme, +0,025 por passe completo e +0,1 por chute no alvo. Desconta 0,08 por passe incompleto, 0,15 por chute para fora, 0,2 por falta e 0,5 por cartão amarelo. Resultado limitado a 0–10 e arredondado a uma casa. O motor não registra perdas de posse nem assistência no fluxo atual.
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {mvp && (
              <article className="relative overflow-hidden rounded-2xl border border-amber-300/25 bg-gradient-to-br from-amber-300/[0.08] via-[#131722] to-[#10141d] p-4 sm:p-5">
                <div className="absolute right-4 top-4 text-amber-200/25"><Trophy className="h-12 w-12" aria-hidden="true" /></div>
                <div className="relative mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-amber-200">
                  <Sparkles className="h-4 w-4" aria-hidden="true" /> MVP da partida
                </div>
                <div className="relative flex items-center justify-center gap-4 sm:gap-6">
                  <PvpPlayerCard
                    playerName={mvp.player.name}
                    playerPosition={mvp.player.position}
                    overall={mvp.snapshotCard?.overall ?? null}
                    snapshotCard={mvp.snapshotCard}
                    details={mvp.snapshotCard ? cardDetailsById[mvp.snapshotCard.uid] : undefined}
                    stats={mvp.stats}
                    rating={mvp.rating}
                    accent="gold"
                  />
                  <div className="hidden max-w-[150px] text-sm leading-relaxed text-white/55 lg:block">
                    Melhor avaliação entre os jogadores com estatísticas registradas.
                    <div className="mt-2 font-semibold text-amber-100">{mvp.side === 'home' ? homeName : awayName}</div>
                  </div>
                </div>
              </article>
            )}
            {worst && (
              <article className="relative overflow-hidden rounded-2xl border border-rose-300/15 bg-gradient-to-br from-rose-300/[0.05] via-[#131722] to-[#10141d] p-4 sm:p-5">
                <div className="relative mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-rose-200/85">
                  <ShieldAlert className="h-4 w-4" aria-hidden="true" /> Nota mais baixa
                </div>
                <div className="relative flex items-center justify-center gap-4 sm:gap-6">
                  <PvpPlayerCard
                    playerName={worst.player.name}
                    playerPosition={worst.player.position}
                    overall={worst.snapshotCard?.overall ?? null}
                    snapshotCard={worst.snapshotCard}
                    details={worst.snapshotCard ? cardDetailsById[worst.snapshotCard.uid] : undefined}
                    stats={worst.stats}
                    rating={worst.rating}
                    accent="red"
                  />
                  <div className="hidden max-w-[150px] text-sm leading-relaxed text-white/55 lg:block">
                    Menor nota entre os demais jogadores elegíveis. Avaliação baseada apenas nas ações registradas.
                    <div className="mt-2 font-semibold text-rose-100">{worst.side === 'home' ? homeName : awayName}</div>
                  </div>
                </div>
              </article>
            )}
          </div>
          {awards.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {awards.map(award => (
                <article key={award.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3">
                  <PvpPlayerCard
                    compact
                    playerName={award.player.player.name}
                    playerPosition={award.player.player.position}
                    overall={award.player.snapshotCard?.overall ?? null}
                    snapshotCard={award.player.snapshotCard}
                    details={award.player.snapshotCard ? cardDetailsById[award.player.snapshotCard.uid] : undefined}
                    accent="neutral"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-[9px] font-bold uppercase tracking-[0.14em] text-white/45">{award.title}</div>
                    <div className="mt-1 truncate text-xs font-bold text-white">{award.player.player.name}</div>
                    <div className="mt-0.5 text-[10px] text-white/55">{award.detail}</div>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="text-[10px] leading-relaxed text-white/35">
            Desarmes registrados incluem interceptações e desarmes do motor. Dribles não são contabilizados em estatísticas individuais; por isso, não há prêmio de drible. Assistências também não são atualmente atribuídas pelo motor.
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-2xl border border-white/10 bg-[#111622]/80 p-4 sm:p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Comparativo</div>
                <h2 className="mt-1 text-lg font-black">Números da partida</h2>
              </div>
              <ArrowLeftRight className="h-5 w-5 text-white/30" aria-hidden="true" />
            </div>
            <div className="mb-5 grid grid-cols-2 gap-3 text-xs font-bold">
              <div className="truncate text-rose-200">{homeName}<span className="ml-1 text-[9px] font-medium text-white/35">· DESAFIANTE</span></div>
              <div className="truncate text-right text-sky-200">{awayName}<span className="ml-1 text-[9px] font-medium text-white/35">· DESAFIADO</span></div>
            </div>
            <div className="space-y-4">
              {statRows.map(row => (
                <ComparativeStat
                  key={row.label}
                  label={row.label}
                  homeValue={row.home}
                  awayValue={row.away}
                  homeDisplay={row.percent ? `${row.home}%` : String(row.home)}
                  awayDisplay={row.percent ? `${row.away}%` : String(row.away)}
                />
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-[#111622]/80 p-4 sm:p-5">
            <div className="mb-5 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-200" aria-hidden="true" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-100/55">Pós-jogo</div>
                <h2 className="mt-1 text-lg font-black">Recompensas da sua equipe</h2>
              </div>
            </div>
            <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.045] p-3">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-100">
                <Check className="h-4 w-4" aria-hidden="true" />
                {rewardsSyncStatus === 'synced' ? 'Dados sincronizados com o servidor' : rewardsSyncStatus === 'syncing' ? 'Sincronizando dados confirmados…' : 'Não foi possível confirmar a sincronização'}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-white/50">
                O resultado oficial aplica XP e estatísticas às cartas titulares pela transação do servidor. Esta interface não concede recompensas novamente.
              </p>
            </div>
            <div className="mt-4 space-y-2">
              {rewardedCards.map(snapshotCard => {
                const exactImage = cardDetailsById[snapshotCard.uid]?.image;
                return (
                  <div key={snapshotCard.uid} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-black/15 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div
                        className="flex h-11 w-8 shrink-0 items-center justify-center overflow-hidden rounded border border-white/10 bg-white/[0.04]"
                        title={!exactImage || unavailableRewardImages.has(snapshotCard.uid) ? 'Arte da instância indisponível' : undefined}
                      >
                        {exactImage && !unavailableRewardImages.has(snapshotCard.uid)
                          ? <img
                            src={exactImage}
                            alt={`Arte da carta de ${snapshotCard.name}`}
                            className="h-full w-full object-cover object-top"
                            onError={() => setUnavailableRewardImages(current => new Set(current).add(snapshotCard.uid))}
                          />
                          : <UserRound className="h-4 w-4 text-white/25" aria-hidden="true" />}
                      </div>
                      <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-white/85">{snapshotCard.name}</div>
                      <div className="font-mono text-[8px] text-white/35">{snapshotCard.uid}</div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-amber-100/70">XP atual</div>
                      <div className="text-xs font-bold tabular-nums text-white">{cardDetailsById[snapshotCard.uid]?.xp ?? '—'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
              <div className="rounded-lg bg-white/[0.035] p-2 text-white/50">
                <span className="block font-bold uppercase tracking-wider text-white/35">Moedas</span>
                Não há recompensa em moedas registrada no PvP.
              </div>
              <div className="rounded-lg bg-white/[0.035] p-2 text-white/50">
                <span className="block font-bold uppercase tracking-wider text-white/35">Nível da conta</span>
                O PvP atualiza XP das cartas, não o nível global.
              </div>
            </div>
            <p className="mt-3 text-[9px] leading-relaxed text-white/30">
              O backend não retorna um recibo com o XP ganho nesta partida. Os valores acima são o XP total atual das mesmas instâncias, após sincronização; não representam o acréscimo desta partida.
            </p>
          </article>
        </section>

        <section id="match-details" className="scroll-mt-6 rounded-2xl border border-white/10 bg-[#111622]/80 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Replay oficial</div>
              <h2 className="mt-1 text-lg font-black">Linha do tempo</h2>
            </div>
            <div className="text-[10px] text-white/35">{events.length} eventos registrados</div>
          </div>
          <div className="relative max-h-[440px] space-y-1 overflow-y-auto pr-1">
            <div className="absolute bottom-3 left-[17px] top-3 w-px bg-white/10" aria-hidden="true" />
            {events.map((event, index) => {
              const isGoal = event.type === 'goal';
              const name = getEventPlayerName(event, result);
              return (
                <motion.div
                  key={`${event.minute}-${event.type}-${event.playerId ?? 'none'}-${index}`}
                  initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.2, delay: reduceMotion ? 0 : Math.min(index * 0.012, 0.25) }}
                  className={`relative grid grid-cols-[2.25rem_2.5rem_1fr] items-start gap-2 rounded-xl p-2.5 ${isGoal ? 'border border-amber-200/20 bg-amber-200/[0.07]' : 'border border-transparent hover:bg-white/[0.025]'}`}
                >
                  <span className={`pt-0.5 text-right font-mono text-[10px] font-bold tabular-nums ${isGoal ? 'text-amber-200' : 'text-white/40'}`}>{event.minute}'</span>
                  <span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ${isGoal ? 'bg-amber-200/15' : 'bg-[#1c2230]'}`}>
                    {eventIcon(event)}
                  </span>
                  <div className="min-w-0">
                    {name && <div className={`truncate text-[10px] font-bold ${isGoal ? 'text-amber-100' : 'text-white/65'}`}>{name}</div>}
                    <div className={`text-xs leading-relaxed ${isGoal ? 'font-bold text-amber-50' : 'text-white/65'}`}>{event.description}</div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        <footer className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-between">
          <button onClick={onMenu} className="rounded-xl border border-white/15 bg-white/[0.035] px-5 py-3 text-sm font-bold text-white/80 transition hover:bg-white/[0.08]">
            Voltar ao menu
          </button>
          <div className="flex flex-col gap-3 sm:flex-row">
            <a href="#match-details" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-white/80 transition hover:bg-white/[0.06]">
              <ArrowDown className="h-4 w-4" aria-hidden="true" /> Detalhes da partida
            </a>
            <button
              onClick={onRematch}
              disabled={rematchLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#c5000b] to-[#E30613] px-5 py-3 text-sm font-black text-white shadow-[0_8px_28px_rgba(227,6,19,0.24)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
            >
              <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
              {rematchLoading ? 'Criando revanche…' : 'Jogar revanche'}
            </button>
          </div>
        </footer>
      </div>
    </main>
  );
}

function mySnapshotCardsForSide(
  side: Side,
  homeCards: ChallengeTeamSnapshot['cards'],
  awayCards: ChallengeTeamSnapshot['cards'],
) {
  return side === 'home' ? homeCards : awayCards;
}
