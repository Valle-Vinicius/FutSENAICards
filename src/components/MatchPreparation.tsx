import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CircleDot, Shield, Target, Users, Zap, ArrowRight, Scale, ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Tactic } from '../engine/match';
import { basePositions } from '../engine/match';
import { getPlayerImage } from '../data/players';
import { FORMATIONS_FUTSAL } from '../lib/game';
import { tacticPreviews } from '../data/tacticPreviews';
import type { PlayerCard, Position, SavedSquad, Squad } from '../types';

const TACTICS: Tactic[] = ['balanced', 'possession', 'highpress', 'counter', 'compact'];
const TACTIC_LABEL: Record<Tactic, string> = {
  balanced: 'Equilibrado',
  possession: 'Posse de bola',
  highpress: 'Pressão alta',
  counter: 'Contra-ataque',
  compact: 'Defesa compacta',
};
const TACTIC_ICON: Record<Tactic, LucideIcon> = {
  balanced: Scale,
  possession: CircleDot,
  highpress: Zap,
  counter: ArrowRight,
  compact: Shield,
};
const DIFFICULTIES = [
  { value: 'easy', label: 'Fácil' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard', label: 'Difícil' },
] as const;

type Difficulty = typeof DIFFICULTIES[number]['value'];
type Source = { area: 'starter' | 'bench'; index: number };
type MatchPrepPlayer = Pick<PlayerCard, 'uid' | 'name' | 'position' | 'overall'> & Partial<Pick<PlayerCard, 'image' | 'photo'>>;

interface MatchPreparationProps {
  lineup: Squad;
  cards: MatchPrepPlayer[];
  savedSquads: SavedSquad[];
  selectedSquadId: string | null;
  onSelectSquad: (id: string | null) => void;
  onLineupChange: (lineup: Squad) => void;
  difficulty: Difficulty;
  onDifficultyChange: (difficulty: Difficulty) => void;
  tactic: Tactic;
  onTacticChange: (tactic: Tactic) => void;
  homeOverall: number | null;
  opponentName: string;
  opponentOverall: number | null;
  showDifficulty: boolean;
  canStart: boolean;
  opponentError: string | null;
  onStart: () => void;
  editable?: boolean;
  showSquadSelector?: boolean;
  tacticDisabled?: boolean;
  actionLabel?: string;
  secondaryAction?: { label: string; disabled?: boolean; onClick: () => void };
  homeTeamName?: string;
  statusMessage?: string;
  emptyReservesMessage?: string;
  opposingPlayers?: MatchPrepPlayer[];
  opposingTeamName?: string;
  title?: string;
  errorAction?: { label: string; onClick: () => void };
}

export default function MatchPreparation({
  lineup,
  cards,
  savedSquads,
  selectedSquadId,
  onSelectSquad,
  onLineupChange,
  difficulty,
  onDifficultyChange,
  tactic,
  onTacticChange,
  homeOverall,
  opponentName,
  opponentOverall,
  showDifficulty,
  canStart,
  opponentError,
  onStart,
  editable = true,
  showSquadSelector = true,
  tacticDisabled = false,
  actionLabel = 'INICIAR PARTIDA',
  secondaryAction,
  homeTeamName = 'SEU TIME',
  statusMessage,
  emptyReservesMessage = 'Nenhuma reserva nesta escalação.',
  opposingPlayers,
  opposingTeamName,
  title = 'Preparação tática',
  errorAction,
}: MatchPreparationProps) {
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [pendingSwap, setPendingSwap] = useState<{ source: Source; target: Source; message: string } | null>(null);
  const cardsByUid = useMemo(() => new Map(cards.map(card => [card.uid, card])), [cards]);
  const filledStarters = lineup.starters.filter(slot => slot.uid).length;
  const preview = tacticPreviews[tactic];
  const tacticName = preview.title;

  const getUid = (source: Source, currentLineup = lineup) =>
    source.area === 'starter'
      ? currentLineup.starters[source.index]?.uid ?? null
      : currentLineup.bench[source.index] ?? null;

  const setUid = (nextLineup: Squad, source: Source, uid: string | null) => {
    if (source.area === 'starter') {
      nextLineup.starters[source.index] = { ...nextLineup.starters[source.index], uid };
    } else {
      nextLineup.bench[source.index] = uid;
    }
  };

  const completeSwap = (source: Source, target: Source) => {
    const sourceUid = getUid(source);
    const targetUid = getUid(target);
    if (!sourceUid || source.area === target.area && source.index === target.index) {
      setSelectedSource(null);
      return;
    }

    const nextLineup: Squad = {
      ...lineup,
      starters: lineup.starters.map(slot => ({ ...slot })),
      bench: [...lineup.bench],
    };
    setUid(nextLineup, source, targetUid);
    setUid(nextLineup, target, sourceUid);
    onLineupChange(nextLineup);
    setSelectedSource(null);
  };

  const positionsMismatch = (source: Source, target: Source) => {
    if (target.area !== 'starter') return false;
    const sourceUid = getUid(source);
    const targetUid = getUid(target);
    const sourceCard = sourceUid ? cardsByUid.get(sourceUid) : undefined;
    const targetCard = targetUid ? cardsByUid.get(targetUid) : undefined;
    const targetPosition = lineup.starters[target.index]?.position;
    if (!sourceCard || !targetPosition || sourceCard.position !== targetPosition) return true;
    if (source.area !== 'starter' || !targetCard) return false;
    const sourcePosition = lineup.starters[source.index]?.position;
    return !!sourcePosition && targetCard.position !== sourcePosition;
  };

  const pressSlot = (target: Source) => {
    if (!editable) return;
    if (!selectedSource) {
      if (getUid(target)) setSelectedSource(target);
      return;
    }
    if (selectedSource.area === target.area && selectedSource.index === target.index) {
      setSelectedSource(null);
      return;
    }
    if (positionsMismatch(selectedSource, target)) {
      const incomingUid = getUid(selectedSource);
      const incoming = incomingUid ? cardsByUid.get(incomingUid) : undefined;
      const slot = target.area === 'starter' ? lineup.starters[target.index] : undefined;
      setPendingSwap({
        source: selectedSource,
        target,
        message: `${incoming?.name ?? 'Este jogador'} (${incoming?.position ?? 'posição atual'}) ocupará a vaga de ${slot?.position ?? 'titular'}. Deseja continuar?`,
      });
      return;
    }
    completeSwap(selectedSource, target);
  };

  const changeFormation = (formation: string) => {
    if (!editable) return;
    const positions = FORMATIONS_FUTSAL[formation];
    if (!positions || formation === lineup.formation) return;

    const usedUids = new Set<string>();
    const starters = positions.map(position => {
      const matching = lineup.starters.find(slot => slot.position === position && slot.uid && !usedUids.has(slot.uid));
      if (matching?.uid) usedUids.add(matching.uid);
      return { position: position as Position, uid: matching?.uid ?? null };
    });
    const bench = [...lineup.bench];
    for (const slot of lineup.starters) {
      if (!slot.uid || usedUids.has(slot.uid)) continue;
      const emptyIndex = bench.findIndex(uid => uid === null);
      if (emptyIndex >= 0) bench[emptyIndex] = slot.uid;
      else bench.push(slot.uid);
    }
    onLineupChange({ ...lineup, formation, starters, bench });
    setSelectedSource(null);
  };

  const lineupEntries = lineup.starters.map((slot, index) => ({
    slot,
    card: slot.uid ? cardsByUid.get(slot.uid) : undefined,
    index,
  }));
  const filledEntries = lineupEntries.filter(entry => entry.card);
  const goalkeeperEntry = filledEntries.find(entry => entry.card?.position === 'GK') ?? filledEntries[0];
  const orderedEntries = goalkeeperEntry
    ? [goalkeeperEntry, ...filledEntries.filter(entry => entry !== goalkeeperEntry)]
    : [];
  const formationPositions = basePositions(lineup.formation, 'home');
  const courtSlots = lineup.starters.map((slot, index) => {
    const point = formationPositions[index] ?? { x: 50, y: 50 };
    const displayedEntry = orderedEntries[index];
    return {
      slot,
      card: displayedEntry?.card,
      sourceIndex: displayedEntry?.index ?? index,
      index,
      x: point.y,
      y: 100 - point.x,
    };
  });

  const sourceSelected = (source: Source) =>
    selectedSource?.area === source.area && selectedSource.index === source.index;

  return (
    <div className="match-prep-screen">
      <header className="match-prep-header">
        <div>
          <span className="match-prep-eyebrow">DIA DE JOGO</span>
          <h1>{title}</h1>
        </div>
        <div className="match-prep-versus" aria-label="Confronto">
          <div className="match-prep-versus__team match-prep-versus__team--home">
            <span>{homeTeamName}</span>
            <strong>{homeOverall ?? '—'}</strong>
            <small>OVERALL</small>
          </div>
          <span className="match-prep-versus__divider" aria-hidden="true">VS</span>
          <div className="match-prep-versus__team">
            <span>{opponentName}</span>
            <strong>{opponentOverall ?? '—'}</strong>
            <small>OVERALL</small>
          </div>
          {homeOverall !== null && opponentOverall !== null && (
            <span className={`match-prep-difference ${homeOverall >= opponentOverall ? 'is-positive' : 'is-negative'}`}>
              {homeOverall >= opponentOverall ? '+' : ''}{homeOverall - opponentOverall}
            </span>
          )}
        </div>
      </header>

      <div className="match-prep-grid">
        <section className="match-prep-panel match-prep-settings" aria-label="Configurações da partida">
          <div className="match-prep-panel__heading">
            <span>01</span>
            <div><h2>Estratégia</h2><p>Defina a formação e o plano de jogo.</p></div>
          </div>

          {showSquadSelector && (
            <label className="match-prep-field">
              <span>ESCALAÇÃO</span>
              <span className="match-prep-select-wrap">
                <select
                  aria-label="Escolher escalação"
                  value={selectedSquadId ?? ''}
                  onChange={event => {
                    setSelectedSource(null);
                    setPendingSwap(null);
                    onSelectSquad(event.target.value || null);
                  }}
                >
                  <option value="">Escalação atual</option>
                  {savedSquads.map(saved => (
                    <option key={saved.id} value={saved.id}>{saved.name} · {saved.formation}</option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" />
              </span>
            </label>
          )}

          <div className="match-prep-field">
            <span>FORMAÇÃO</span>
            {editable ? (
              <span className="match-prep-select-wrap">
                <select aria-label="Formação" value={lineup.formation} onChange={event => changeFormation(event.target.value)}>
                  {Object.keys(FORMATIONS_FUTSAL).map(formation => <option key={formation} value={formation}>{formation}</option>)}
                </select>
                <ChevronDown aria-hidden="true" />
              </span>
            ) : <strong className="match-prep-static-value">{lineup.formation}</strong>}
          </div>

          {showDifficulty && (
            <fieldset className="match-prep-field">
              <legend>DIFICULDADE</legend>
              <div className="match-prep-segmented" role="group" aria-label="Dificuldade da IA">
                {DIFFICULTIES.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={difficulty === option.value}
                    onClick={() => onDifficultyChange(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="match-prep-field match-prep-tactics">
            <legend>TÁTICA</legend>
            <div className="match-prep-tactic-list" role="radiogroup" aria-label="Tática">
              {TACTICS.map(option => {
                const Icon = TACTIC_ICON[option];
                return (
                  <label key={option} className={`match-prep-tactic ${tactic === option ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="match-prep-tactic"
                      value={option}
                      checked={tactic === option}
                      disabled={tacticDisabled}
                      onChange={() => onTacticChange(option)}
                    />
                    <Icon aria-hidden="true" />
                    <span>{TACTIC_LABEL[option]}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="match-prep-tactic-copy" aria-live="polite">
            <strong>{tacticName}</strong>
            <p>{preview.description}</p>
            <div className="match-prep-tactic-points">
              <span><ArrowUpRight aria-hidden="true" /> {preview.melhora[0]}</span>
              <span><ArrowUpRight aria-hidden="true" /> {preview.melhora[1]}</span>
              <span><ArrowDownRight aria-hidden="true" /> {preview.piora[0]}</span>
              <span><ArrowDownRight aria-hidden="true" /> {preview.piora[1]}</span>
            </div>
          </div>

          {statusMessage && <p className="match-prep-status">{statusMessage}</p>}
          {!canStart && editable && <p className="match-prep-error">Complete os 5 titulares para iniciar a partida.</p>}
          {opponentError && (
            <div className="match-prep-error">
              <p>{opponentError}</p>
              {errorAction && <button type="button" onClick={errorAction.onClick}>{errorAction.label}</button>}
            </div>
          )}
          {secondaryAction && (
            <button type="button" className="match-prep-secondary-action" onClick={secondaryAction.onClick} disabled={secondaryAction.disabled}>
              {secondaryAction.label}
            </button>
          )}
        </section>

        <section className="match-prep-court-panel" aria-label="Quadra tática">
          <div className="match-prep-court-heading">
            <div className="match-prep-panel__heading">
              <span>02</span>
              <div><h2>Quadra tática</h2><p>{lineup.formation} · selecione dois atletas para trocar.</p></div>
            </div>
            <span className="match-prep-court-badge"><Users aria-hidden="true" /> {filledStarters}/5</span>
          </div>

          <div className="match-prep-court" role="group" aria-label="Quadra de futsal com os titulares">
            <svg className="match-prep-court__lines" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="match-court-floor" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#245f45" />
                  <stop offset="1" stopColor="#123b2b" />
                </linearGradient>
                <pattern id="match-court-grain" width="12" height="12" patternUnits="userSpaceOnUse">
                  <path d="M0 3H12M0 9H12" stroke="#fff" strokeOpacity=".035" strokeWidth=".5" />
                </pattern>
              </defs>
              <rect x="1" y="1" width="98" height="148" rx="8" fill="url(#match-court-floor)" />
              <rect x="1" y="1" width="98" height="148" rx="8" fill="url(#match-court-grain)" />
              <rect x="5" y="5" width="90" height="140" rx="5" fill="none" stroke="#e9f4ec" strokeOpacity=".68" strokeWidth=".6" />
              <line x1="5" y1="75" x2="95" y2="75" stroke="#e9f4ec" strokeOpacity=".68" strokeWidth=".6" />
              <circle cx="50" cy="75" r="13" fill="none" stroke="#e9f4ec" strokeOpacity=".68" strokeWidth=".6" />
              <circle cx="50" cy="75" r=".9" fill="#e9f4ec" fillOpacity=".8" />
              <path d="M25 5v8h50V5M25 145v-8h50v8" fill="none" stroke="#e9f4ec" strokeOpacity=".68" strokeWidth=".6" />
              <path d="M38 5a12 12 0 0 0 24 0M38 145a12 12 0 0 1 24 0" fill="none" stroke="#e9f4ec" strokeOpacity=".68" strokeWidth=".6" />
            </svg>
            {courtSlots.map(({ slot, card, sourceIndex, index, x, y }) => {
              const source = { area: 'starter' as const, index: sourceIndex };
              return (
                <button
                  type="button"
                  key={`${slot.position}-${index}`}
                  className={`match-prep-player-marker ${card ? '' : 'is-empty'} ${sourceSelected(source) ? 'is-selected' : ''}`}
                  style={{ left: `${x}%`, top: `${y}%` }}
                  onClick={() => pressSlot(source)}
                  disabled={!editable}
                  aria-label={card ? `Titular ${slot.position}: ${card.name}, OVR ${card.overall}` : `Vaga livre: ${slot.position}`}
                >
                  {card ? (
                    <>
                      <span className="match-prep-player-marker__photo">
                        {(card.photo || card.image || getPlayerImage(card.name)) && (
                          <img src={card.photo || card.image || getPlayerImage(card.name)} alt="" />
                        )}
                        <span className="match-prep-player-marker__position">{card.position}</span>
                      </span>
                      <span className="match-prep-player-marker__ovr">{card.overall}</span>
                      <span className="match-prep-player-marker__name">{card.name}</span>
                    </>
                  ) : (
                    <span className="match-prep-player-marker__vacancy">+<small>{slot.position}</small></span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="match-prep-panel match-prep-roster" aria-label="Seu elenco">
          <div className="match-prep-panel__heading">
            <span>03</span>
            <div><h2>Seu elenco</h2><p>Atletas da escalação escolhida.</p></div>
          </div>
          <div className="match-prep-roster__section">
            <h3>TITULARES <strong>{filledStarters}/{lineup.starters.length}</strong></h3>
            <div className="match-prep-roster__list">
              {lineup.starters.map((slot, index) => {
                const card = slot.uid ? cardsByUid.get(slot.uid) : undefined;
                const source = { area: 'starter' as const, index };
                return (
                  <button
                    type="button"
                    key={`${slot.position}-${index}`}
                    className={`match-prep-roster-row ${sourceSelected(source) ? 'is-selected' : ''} ${card ? '' : 'is-empty'}`}
                    onClick={() => pressSlot(source)}
                    disabled={!editable}
                    aria-label={card ? `Titular ${slot.position}: ${card.name}, OVR ${card.overall}` : `Vaga livre: ${slot.position}`}
                  >
                    <span className="match-prep-roster-row__image">
                      {card && (card.photo || card.image || getPlayerImage(card.name))
                        ? <img src={card.photo || card.image || getPlayerImage(card.name)} alt="" />
                        : <span>{slot.position}</span>}
                    </span>
                    <span className="match-prep-roster-row__copy">
                      <strong>{card?.name ?? `Vaga de ${slot.position}`}</strong>
                      <small>{card ? `${slot.position} · TITULAR` : 'Selecione uma reserva'}</small>
                    </span>
                    <span className="match-prep-roster-row__overall">{card?.overall ?? '—'}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="match-prep-roster__section match-prep-reserves">
            <h3>BANCO DE RESERVAS <strong>{lineup.bench.filter(Boolean).length}</strong></h3>
            {lineup.bench.some(Boolean) ? (
              <div className="match-prep-roster__list">
                {lineup.bench.map((uid, index) => {
                  if (!uid) return null;
                  const card = cardsByUid.get(uid);
                  if (!card) return null;
                  const source = { area: 'bench' as const, index };
                  return (
                    <button
                      type="button"
                      key={uid}
                      className={`match-prep-roster-row ${sourceSelected(source) ? 'is-selected' : ''}`}
                      onClick={() => pressSlot(source)}
                      aria-label={`Reserva: ${card.name}, OVR ${card.overall}`}
                    >
                      <span className="match-prep-roster-row__image">
                        {(card.photo || card.image || getPlayerImage(card.name))
                          ? <img src={card.photo || card.image || getPlayerImage(card.name)} alt="" />
                          : <span>{card.position}</span>}
                      </span>
                      <span className="match-prep-roster-row__copy">
                        <strong>{card.name}</strong>
                        <small>{card.position} · RESERVA</small>
                      </span>
                      <span className="match-prep-roster-row__overall">{card.overall}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="match-prep-empty-reserves">{emptyReservesMessage}</p>
            )}
          </div>

          {opposingPlayers && (
            <div className="match-prep-roster__section">
              <h3>{opposingTeamName ?? 'ADVERSÁRIO'} <strong>{opposingPlayers.length}</strong></h3>
              <div className="match-prep-roster__list">
                {opposingPlayers.map(player => (
                  <div key={player.uid} className="match-prep-roster-row">
                    <span className="match-prep-roster-row__image">
                      {(player.photo || player.image || getPlayerImage(player.name))
                        ? <img src={player.photo || player.image || getPlayerImage(player.name)} alt="" />
                        : <span>{player.position}</span>}
                    </span>
                    <span className="match-prep-roster-row__copy">
                      <strong>{player.name}</strong>
                      <small>{player.position} · ADVERSÁRIO</small>
                    </span>
                    <span className="match-prep-roster-row__overall">{player.overall}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {editable && <div className="match-prep-roster__hint"><Target aria-hidden="true" /> Clique em um titular e depois em uma reserva ou vaga para trocar.</div>}
        </section>

        <button type="button" className="match-prep-start" onClick={onStart} disabled={!canStart}>
          {actionLabel} <ArrowRight aria-hidden="true" />
        </button>
      </div>

      {pendingSwap && (
        <div className="match-prep-confirm" role="alertdialog" aria-modal="true" aria-labelledby="match-prep-confirm-title">
          <div className="match-prep-confirm__backdrop" onClick={() => setPendingSwap(null)} />
          <div className="match-prep-confirm__dialog">
            <h2 id="match-prep-confirm-title">Confirmar troca de posição</h2>
            <p>{pendingSwap.message}</p>
            <div>
              <button type="button" onClick={() => setPendingSwap(null)}>Cancelar</button>
              <button
                type="button"
                onClick={() => {
                  completeSwap(pendingSwap.source, pendingSwap.target);
                  setPendingSwap(null);
                }}
              >
                Confirmar troca
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
