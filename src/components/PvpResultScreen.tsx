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
import { getPlayerImage } from '../data/players';
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
  const displayName = snapshotCard?.name ?? playerName;
  const exactImage = snapshotCard ? getPlayerImage(displayName) || details?.image || null : null;
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
    ? 'border-[#f5c542] shadow-[0_0_24px_rgba(245,197,66,0.18)]'
    : accent === 'red'
      ? 'border-[#E30613]/40'
      : 'border-[#E9EAF0]';

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.4 }}
      className={`relative w-full overflow-hidden rounded-2xl border bg-white shadow-[0_2px_12px_rgba(37,39,51,0.06)] ${accentClasses} ${compact ? 'max-w-[155px]' : 'max-w-[230px]'}`}
      aria-label={`Carta de ${displayName}${rating === undefined ? '' : `, nota ${rating.toFixed(1)}`}`}
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-[#F7F7F9]">
        {snapshotCard && exactImage && !imageUnavailable ? (
          <img
            src={exactImage}
            alt={`Arte da carta de ${displayName}`}
            className="absolute inset-0 h-full w-full object-cover object-top"
            onError={() => setImageUnavailable(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#F7F7F9] px-3 text-center">
            {snapshotCard ? <UserRound className="h-10 w-10 text-[#858A98]/50" aria-hidden="true" /> : <ShieldAlert className="h-10 w-10 text-[#E30613]/60" aria-hidden="true" />}
            <span className="text-[9px] font-semibold tracking-[0.12em] text-[#858A98]">
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
            <span className="w-fit rounded bg-black/65 px-1.5 py-0.5 text-[8px] font-bold text-[#f5c542]">
              {SPECIAL_META[special].label}
            </span>
          )}
        </div>
        <div className={`absolute right-3 top-3 text-3xl font-black ${accent === 'gold' ? 'text-[#f5c542]' : 'text-white'}`}>
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
            <div className={`mt-2 flex items-center justify-between rounded-lg px-2 py-1 ${accent === 'gold' ? 'bg-[#FFF0F2] text-[#252733]' : 'bg-[#F7F7F9] text-[#252733]'}`}>
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
      <span className="text-right text-sm font-bold tabular-nums text-[#252733]">{homeDisplay}</span>
      <span className="text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[#858A98]">{label}</span>
      <span className="text-sm font-bold tabular-nums text-[#252733]">{awayDisplay}</span>
      <div className="col-span-3 flex h-1.5 overflow-hidden rounded-full bg-[#E9EAF0]">
        <motion.div
          initial={reduceMotion ? false : { width: 0 }}
          animate={{ width: `${homePercent}%` }}
          transition={{ duration: reduceMotion ? 0 : 0.7, ease: 'easeOut' }}
          className="h-full bg-[#E30613]"
        />
        <motion.div
          initial={reduceMotion ? false : { width: 0 }}
          animate={{ width: `${awayPercent}%` }}
          transition={{ duration: reduceMotion ? 0 : 0.7, ease: 'easeOut', delay: reduceMotion ? 0 : 0.08 }}
          className="h-full bg-[#858A98]"
        />
      </div>
    </div>
  );
}

function eventIcon(event: MatchEvent) {
  const Icon = EVENT_ICON[event.type] ?? Sparkles;
  return <Icon className={`h-4 w-4 ${event.type === 'goal' ? 'text-[#E30613]' : 'text-[#858A98]'}`} aria-hidden="true" />;
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
  const outcomeColor = outcome === 'win' ? 'text-[#E30613]' : outcome === 'loss' ? 'text-[#858A98]' : 'text-[#252733]';
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
    <main className="relative min-h-screen overflow-hidden bg-[#F7F7F9] px-3 py-6 text-[#252733] sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-40 -top-32 h-96 w-96 rounded-full bg-[#FFF0F2] blur-[120px]" />
        <div className="absolute inset-x-0 top-0 h-64 bg-white/70" />
      </div>

      <div className="relative mx-auto max-w-6xl space-y-6 sm:space-y-8">
        <motion.header
          initial={reduceMotion ? false : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.45 }}
          className="flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#858A98]">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#E30613] text-white shadow-sm">FS</span>
            <span className="text-[#252733]">FutSENAI</span> <span className="hidden text-[#E9EAF0] sm:inline">/</span><span className="hidden sm:inline">Pós-partida PvP</span>
          </div>
          <div className="rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-green-700 sm:text-[10px]">
            Resultado oficial do servidor
          </div>
        </motion.header>

        <motion.section
          initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.55, delay: reduceMotion ? 0 : 0.08 }}
          className="card-surface relative overflow-hidden p-4 sm:p-8"
        >
          {outcome === 'win' && <div className="pointer-events-none absolute left-1/2 top-0 h-32 w-3/4 -translate-x-1/2 bg-[#FFF0F2] blur-[70px]" />}
          <div className="relative grid items-center gap-4 md:grid-cols-[1fr_auto_1fr] md:gap-8">
            <div className={`order-2 text-center md:order-1 ${mySide === 'home' ? 'md:text-right' : 'md:text-left'}`}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#858A98]">Desafiante · Casa</div>
              <div className="mt-1 break-words text-lg font-bold text-[#252733] sm:text-2xl">{homeName}</div>
              <div className="mt-1 text-xs text-[#858A98]">{homeSnapshot?.formation ?? result.config.homeFormation}</div>
            </div>
            <div className="order-1 text-center md:order-2">
              <div className={`mb-3 inline-flex items-center gap-2 text-[11px] font-black tracking-[0.22em] ${outcomeColor}`}>
                {outcome === 'win' ? <Trophy className="h-4 w-4" aria-hidden="true" /> : outcome === 'loss' ? <ShieldAlert className="h-4 w-4" aria-hidden="true" /> : <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />}
                {outcomeLabel}
              </div>
              <div className="flex items-center justify-center gap-3 sm:gap-5">
                <span className={`text-6xl font-bold leading-none tracking-tight tabular-nums sm:text-8xl ${mySide === 'home' && outcome === 'win' || mySide === 'away' && outcome === 'loss' ? 'text-[#E30613]' : 'text-[#252733]'}`}>
                  {result.homeScore}
                </span>
                <span className="text-3xl font-light text-[#E9EAF0] sm:text-5xl">:</span>
                <span className={`text-6xl font-bold leading-none tracking-tight tabular-nums sm:text-8xl ${mySide === 'away' && outcome === 'win' || mySide === 'home' && outcome === 'loss' ? 'text-[#E30613]' : 'text-[#252733]'}`}>
                  {result.awayScore}
                </span>
              </div>
              <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#858A98]">
                {result.durationMinutes || 90} minutos · apito final
              </div>
            </div>
            <div className={`order-3 text-center ${mySide === 'away' ? 'md:text-right' : 'md:text-left'}`}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#858A98]">Desafiado · Visitante</div>
              <div className="mt-1 break-words text-lg font-bold text-[#252733] sm:text-2xl">{awayName}</div>
              <div className="mt-1 text-xs text-[#858A98]">{awaySnapshot?.formation ?? result.config.awayFormation}</div>
            </div>
          </div>
        </motion.section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#E30613]">Performance da partida</div>
              <h2 className="mt-1 text-xl font-semibold text-[#252733] sm:text-2xl">Destaques individuais</h2>
            </div>
            <button
              onClick={() => setShowRatingFormula(value => !value)}
              className="text-right text-[10px] font-medium text-[#858A98] underline decoration-[#E9EAF0] underline-offset-4 hover:text-[#E30613]"
              aria-expanded={showRatingFormula}
            >
              Como calculamos as notas?
            </button>
          </div>
          {showRatingFormula && (
            <p className="rounded-xl border border-[#E9EAF0] bg-white p-3 text-xs leading-relaxed text-[#858A98]">
              Nota determinística: base 6,0; +1,4 por gol, +0,8 por assistência, +0,35 por defesa, +0,18 por desarme, +0,025 por passe completo e +0,1 por chute no alvo. Desconta 0,08 por passe incompleto, 0,15 por chute para fora, 0,2 por falta e 0,5 por cartão amarelo. Resultado limitado a 0–10 e arredondado a uma casa. O motor não registra perdas de posse nem assistência no fluxo atual.
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {mvp && (
              <article className="card-surface relative overflow-hidden border-l-4 border-l-[#f5c542] p-4 sm:p-5">
                <div className="absolute right-4 top-4 text-[#f5c542]/25"><Trophy className="h-12 w-12" aria-hidden="true" /></div>
                <div className="relative mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#252733]">
                  <Sparkles className="h-4 w-4 text-[#f5c542]" aria-hidden="true" /> MVP da partida
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
                  <div className="hidden max-w-[150px] text-sm leading-relaxed text-[#858A98] lg:block">
                    Melhor avaliação entre os jogadores com estatísticas registradas.
                    <div className="mt-2 font-medium text-[#252733]">{mvp.side === 'home' ? homeName : awayName}</div>
                  </div>
                </div>
              </article>
            )}
            {worst && (
              <article className="card-surface relative overflow-hidden border-l-4 border-l-[#E30613] p-4 sm:p-5">
                <div className="relative mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#252733]">
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
                  <div className="hidden max-w-[150px] text-sm leading-relaxed text-[#858A98] lg:block">
                    Menor nota entre os demais jogadores elegíveis. Avaliação baseada apenas nas ações registradas.
                    <div className="mt-2 font-medium text-[#252733]">{worst.side === 'home' ? homeName : awayName}</div>
                  </div>
                </div>
              </article>
            )}
          </div>
          {awards.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {awards.map(award => (
                <article key={award.id} className="card-surface flex min-w-0 items-center gap-3 p-3">
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
                    <div className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-[#858A98]">{award.title}</div>
                    <div className="mt-1 truncate text-xs font-semibold text-[#252733]">{award.player.player.name}</div>
                    <div className="mt-0.5 text-[10px] text-[#858A98]">{award.detail}</div>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="text-[10px] leading-relaxed text-[#858A98]">
            Desarmes registrados incluem interceptações e desarmes do motor. Dribles não são contabilizados em estatísticas individuais; por isso, não há prêmio de drible. Assistências também não são atualmente atribuídas pelo motor.
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="card-surface p-4 sm:p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#858A98]">Comparativo</div>
                <h2 className="mt-1 text-lg font-semibold text-[#252733]">Números da partida</h2>
              </div>
              <ArrowLeftRight className="h-5 w-5 text-[#858A98]" aria-hidden="true" />
            </div>
            <div className="mb-5 grid grid-cols-2 gap-3 text-xs font-bold">
              <div className="truncate text-[#E30613]">{homeName}<span className="ml-1 text-[9px] font-medium text-[#858A98]">· DESAFIANTE</span></div>
              <div className="truncate text-right text-[#252733]">{awayName}<span className="ml-1 text-[9px] font-medium text-[#858A98]">· DESAFIADO</span></div>
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

          <article className="card-surface p-4 sm:p-5">
            <div className="mb-5 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#E30613]" aria-hidden="true" />
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#858A98]">Pós-jogo</div>
                <h2 className="mt-1 text-lg font-semibold text-[#252733]">Recompensas da sua equipe</h2>
              </div>
            </div>
            <div className="rounded-xl border border-green-200 bg-green-50 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-green-700">
                <Check className="h-4 w-4" aria-hidden="true" />
                {rewardsSyncStatus === 'synced' ? 'Dados sincronizados com o servidor' : rewardsSyncStatus === 'syncing' ? 'Sincronizando dados confirmados…' : 'Não foi possível confirmar a sincronização'}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[#858A98]">
                O resultado oficial aplica XP e estatísticas às cartas titulares pela transação do servidor. Esta interface não concede recompensas novamente.
              </p>
            </div>
            <div className="mt-4 space-y-2">
              {rewardedCards.map(snapshotCard => {
                const exactImage = cardDetailsById[snapshotCard.uid]?.image;
                return (
                  <div key={snapshotCard.uid} className="flex items-center justify-between gap-3 rounded-lg border border-[#E9EAF0] bg-white px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div
                        className="flex h-11 w-8 shrink-0 items-center justify-center overflow-hidden rounded border border-[#E9EAF0] bg-[#F7F7F9]"
                        title={!exactImage || unavailableRewardImages.has(snapshotCard.uid) ? 'Arte da instância indisponível' : undefined}
                      >
                        {exactImage && !unavailableRewardImages.has(snapshotCard.uid)
                          ? <img
                            src={exactImage}
                            alt={`Arte da carta de ${snapshotCard.name}`}
                            className="h-full w-full object-cover object-top"
                            onError={() => setUnavailableRewardImages(current => new Set(current).add(snapshotCard.uid))}
                          />
                          : <UserRound className="h-4 w-4 text-[#858A98]/50" aria-hidden="true" />}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-[#252733]">{snapshotCard.name}</div>
                        <div className="font-mono text-[8px] text-[#858A98]">{snapshotCard.uid}</div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[9px] font-semibold uppercase tracking-wider text-[#858A98]">XP atual</div>
                      <div className="text-xs font-bold tabular-nums text-[#252733]">{cardDetailsById[snapshotCard.uid]?.xp ?? '—'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
              <div className="rounded-lg bg-[#F7F7F9] p-2 text-[#858A98]">
                <span className="block font-semibold uppercase tracking-wider text-[#252733]">Moedas</span>
                Não há recompensa em moedas registrada no PvP.
              </div>
              <div className="rounded-lg bg-[#F7F7F9] p-2 text-[#858A98]">
                <span className="block font-semibold uppercase tracking-wider text-[#252733]">Nível da conta</span>
                O PvP atualiza XP das cartas, não o nível global.
              </div>
            </div>
            <p className="mt-3 text-[9px] leading-relaxed text-[#858A98]">
              O backend não retorna um recibo com o XP ganho nesta partida. Os valores acima são o XP total atual das mesmas instâncias, após sincronização; não representam o acréscimo desta partida.
            </p>
          </article>
        </section>

        <section id="match-details" className="card-surface scroll-mt-6 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#858A98]">Replay oficial</div>
              <h2 className="mt-1 text-lg font-semibold text-[#252733]">Linha do tempo</h2>
            </div>
            <div className="text-[10px] text-[#858A98]">{events.length} eventos registrados</div>
          </div>
          <div className="relative max-h-[440px] space-y-1 overflow-y-auto pr-1">
            <div className="absolute bottom-3 left-[17px] top-3 w-px bg-[#E9EAF0]" aria-hidden="true" />
            {events.map((event, index) => {
              const isGoal = event.type === 'goal';
              const name = getEventPlayerName(event, result);
              return (
                <motion.div
                  key={`${event.minute}-${event.type}-${event.playerId ?? 'none'}-${index}`}
                  initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.2, delay: reduceMotion ? 0 : Math.min(index * 0.012, 0.25) }}
                  className={`relative grid grid-cols-[2.25rem_2.5rem_1fr] items-start gap-2 rounded-xl p-2.5 ${isGoal ? 'border border-[#E30613]/20 bg-[#FFF0F2]' : 'border border-transparent hover:bg-[#F7F7F9]'}`}
                >
                  <span className={`pt-0.5 text-right font-mono text-[10px] font-bold tabular-nums ${isGoal ? 'text-[#E30613]' : 'text-[#858A98]'}`}>{event.minute}'</span>
                  <span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ${isGoal ? 'bg-white' : 'bg-[#F7F7F9]'}`}>
                    {eventIcon(event)}
                  </span>
                  <div className="min-w-0">
                    {name && <div className={`truncate text-[10px] font-semibold ${isGoal ? 'text-[#252733]' : 'text-[#858A98]'}`}>{name}</div>}
                    <div className={`text-xs leading-relaxed ${isGoal ? 'font-semibold text-[#252733]' : 'text-[#858A98]'}`}>{event.description}</div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        <footer className="flex flex-col-reverse gap-3 border-t border-[#E9EAF0] pt-5 sm:flex-row sm:justify-between">
          <button onClick={onMenu} className="rounded-xl border border-[#E9EAF0] bg-white px-5 py-3 text-sm font-medium text-[#252733] transition hover:bg-[#F7F7F9]">
            Voltar ao menu
          </button>
          <div className="flex flex-col gap-3 sm:flex-row">
            <a href="#match-details" className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E9EAF0] bg-white px-5 py-3 text-sm font-medium text-[#252733] transition hover:bg-[#F7F7F9]">
              <ArrowDown className="h-4 w-4" aria-hidden="true" /> Detalhes da partida
            </a>
            <button
              onClick={onRematch}
              disabled={rematchLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#E30613] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
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
