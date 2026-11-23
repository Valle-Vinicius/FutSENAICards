import { useDeferredValue, useMemo, useState, type DragEvent as ReactDragEvent } from 'react';
import { AlertTriangle, Eye, Plus, Search, Sparkles, Star, X } from 'lucide-react';
import Card from '../components/Card';
import ConfirmModal from '../components/ConfirmModal';
import { useCardViewer } from '../hooks/useCardViewer';
import { useGame, squadOverall } from '../store/useGame';
import { toast } from '../store/toast';
import { DEFAULT_FUTSAL_FORMATION, FORMATIONS_FUTSAL, normalizeFutsalFormation } from '../lib/game';
import { normalizeSearch } from '../lib/text';
import { RARITY_META } from '../types';
import type { Position, SavedSquad } from '../types';

const POSITION_LABELS: Record<Position, string> = { GK: 'GOL', Fixo: 'FIXO', Ala: 'ALA', Pivo: 'PIVÔ' };
const COURT_COORDINATES: Record<string, { x: number; y: number }[]> = {
  '1-2-1': [
    { x: 50, y: 88 },
    { x: 50, y: 66 },
    { x: 25, y: 47 },
    { x: 75, y: 47 },
    { x: 50, y: 27 },
  ],
  '2-2': [
    { x: 50, y: 88 },
    { x: 30, y: 65 },
    { x: 70, y: 65 },
    { x: 30, y: 35 },
    { x: 70, y: 35 },
  ],
};

type SelectedSource =
  | { type: 'inventory'; uid: string }
  | { type: 'starter'; index: number }
  | { type: 'bench'; index: number };

export default function Squad() {
  const sport = 'futsal' as const;
  const squads = useGame(s => s.squads);
  const cards = useGame(s => s.cards);
  const savedSquads = useGame(s => s.savedSquads);
  const listings = useGame(s => s.listings);
  const assign = useGame(s => s.assignSlot);
  const clear = useGame(s => s.clearSlot);
  const setFormation = useGame(s => s.setFormation);
  const flushSquadSave = useGame(s => s.flushSquadSave);
  const saveSquad = useGame(s => s.saveSquad);
  const duplicateSavedSquad = useGame(s => s.duplicateSavedSquad);
  const deleteSquad = useGame(s => s.deleteSquad);
  const loadSquad = useGame(s => s.loadSquad);
  const setPrimary = useGame(s => s.setPrimarySquad);
  const [selectedSource, setSelectedSource] = useState<SelectedSource | null>(null);
  const [criteria, setCriteria] = useState<'overall' | 'balance' | 'position'>('overall');
  const [saveName, setSaveName] = useState('');
  const [autoBuildSaving, setAutoBuildSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<Position | null>(null);
  const [visibleCardCount, setVisibleCardCount] = useState(36);
  const [savedOpen, setSavedOpen] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [pendingPositionSwap, setPendingPositionSwap] = useState<{ index: number; bench: boolean; benchIndex?: number; message: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SavedSquad | null>(null);
  const deferredSearch = useDeferredValue(search);
  const { openCard: openCardViewer, viewer: cardViewer } = useCardViewer();

  const formations = Object.keys(FORMATIONS_FUTSAL);
  const squad = squads[sport];
  const formation = normalizeFutsalFormation(squad.formation || DEFAULT_FUTSAL_FORMATION);
  const coordinates = COURT_COORDINATES[formation] ?? COURT_COORDINATES[DEFAULT_FUTSAL_FORMATION];
  const cardsByUid = useMemo(() => new Map(cards.map(card => [card.uid, card])), [cards]);
  const activeListingUids = useMemo(
    () => new Set(listings.filter(listing => listing.status === 'active').map(listing => listing.cardUid)),
    [listings],
  );
  const usedUids = useMemo(
    () => new Set([...squad.starters.map(slot => slot.uid), ...squad.bench].filter(Boolean) as string[]),
    [squad.starters, squad.bench],
  );
  const available = useMemo(
    () => cards.filter(card => !usedUids.has(card.uid) && !activeListingUids.has(card.uid)),
    [cards, usedUids, activeListingUids],
  );
  const filteredAvailable = useMemo(() => {
    const query = normalizeSearch(deferredSearch.trim());
    return available.filter(card => {
      if (positionFilter && card.position !== positionFilter) return false;
      if (!query) return true;
      const positionLabel = card.position === 'GK'
        ? 'goleiro'
        : card.position === 'Pivo'
          ? 'pivô'
          : card.position;
      return [
        card.name,
        card.club,
        card.position,
        positionLabel,
        card.rarity,
        RARITY_META[card.rarity]?.label,
      ].some(value => normalizeSearch(String(value ?? '')).includes(query));
    }).sort((left, right) => right.overall - left.overall);
  }, [available, deferredSearch, positionFilter]);
  const visibleCards = filteredAvailable.slice(0, visibleCardCount);
  const mySaved = savedSquads.filter(saved => saved.sport === sport);
  const activeSavedSquad = mySaved.find(saved =>
    normalizeFutsalFormation(saved.formation) === formation
    && saved.starters.length === squad.starters.length
    && saved.starters.every((uid, index) => uid === squad.starters[index]?.uid)
    && saved.bench.filter(Boolean).join('|') === squad.bench.filter(Boolean).join('|'),
  );
  const overall = squadOverall(squad, cards);
  const filledCount = squad.starters.filter(slot => slot.uid).length;
  const outOfPositionNames = squad.starters.flatMap(slot => {
    const card = slot.uid ? cardsByUid.get(slot.uid) : null;
    return card && card.position !== slot.position ? [card.name] : [];
  });

  const getSourceUid = (source: SelectedSource): string | null => {
    if (source.type === 'inventory') return source.uid;
    if (source.type === 'starter') return squad.starters[source.index]?.uid ?? null;
    return squad.bench[source.index] ?? null;
  };
  const selectedCard = selectedSource ? cardsByUid.get(getSourceUid(selectedSource) ?? '') : null;

  const handleSlotClick = (index: number, bench: boolean, benchIndex?: number, allowOutOfPosition = false) => {
    if (bench && benchIndex === undefined) return;
    const source = selectedSource;
    const targetUid = bench ? squad.bench[benchIndex!] : squad.starters[index]?.uid ?? null;

    if (!source) {
      if (targetUid) setSelectedSource(bench ? { type: 'bench', index: benchIndex! } : { type: 'starter', index });
      return;
    }

    const sourceUid = getSourceUid(source);
    if (!sourceUid) {
      setSelectedSource(null);
      return;
    }
    if ((source.type === 'starter' && !bench && source.index === index)
      || (source.type === 'bench' && bench && source.index === benchIndex)) {
      setSelectedSource(null);
      return;
    }
    if (activeListingUids.has(sourceUid) || (targetUid && activeListingUids.has(targetUid))) {
      toast.error('Cartas anunciadas no mercado não podem ser escaladas. Cancele o anúncio primeiro.');
      setSelectedSource(null);
      return;
    }

    const sourceCard = cardsByUid.get(sourceUid);
    const targetSlot = !bench ? squad.starters[index] : null;
    if (sourceCard && targetSlot && sourceCard.position !== targetSlot.position && !allowOutOfPosition) {
      setPendingPositionSwap({
        index,
        bench,
        benchIndex,
        message: `${sourceCard.name} é ${sourceCard.position}, mas o slot é ${targetSlot.position}. Deseja continuar?`,
      });
      return;
    }

    assign(sport, index, sourceUid, bench, benchIndex);
    if (source.type !== 'inventory') {
      if (source.type === 'starter') assign(sport, source.index, targetUid, false);
      else assign(sport, 0, targetUid, true, source.index);
    }
    setSelectedSource(null);
  };

  const removeStarter = (index: number) => {
    clear(sport, index, false);
    if (selectedSource?.type === 'starter' && selectedSource.index === index) setSelectedSource(null);
  };
  const removeBench = (index: number) => {
    clear(sport, 0, true, index);
    if (selectedSource?.type === 'bench' && selectedSource.index === index) setSelectedSource(null);
  };
  const handleDragStart = (source: SelectedSource, event: ReactDragEvent<HTMLElement>) => {
    setSelectedSource(source);
    const uid = getSourceUid(source);
    if (uid) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', uid);
    }
  };
  const handleDrop = (event: ReactDragEvent, index: number, bench: boolean, benchIndex?: number) => {
    event.preventDefault();
    if (selectedSource) handleSlotClick(index, bench, benchIndex);
  };

  const handleSave = () => {
    const name = saveName.trim();
    if (!name) {
      toast.error('Informe um nome para a escalação.');
      return;
    }
    saveSquad(name, sport);
    setSaveName('');
    toast.success('Escalação salva.');
  };

  const handleLoad = (saved: SavedSquad) => {
    loadSquad(saved.id);
    setSelectedSource(null);
    toast.success(`Escalação "${saved.name}" carregada.`);
  };

  const handleDuplicate = async (saved: SavedSquad) => {
    if (duplicatingId) return;
    setDuplicatingId(saved.id);
    try {
      const id = await duplicateSavedSquad(saved.id);
      if (id) toast.success(`Cópia de "${saved.name}" criada.`);
    } finally {
      setDuplicatingId(null);
    }
  };

  const autoBuild = async () => {
    if (autoBuildSaving) return;
    setAutoBuildSaving(true);
    try {
      const candidateCards = cards.filter(card => !activeListingUids.has(card.uid));
      const assigned = new Set<string>();
      for (let index = 0; index < squad.starters.length; index++) {
        const slot = squad.starters[index];
        let best: { uid: string; score: number } | null = null;
        for (const card of candidateCards) {
          if (assigned.has(card.uid)) continue;
          const positionMatch = card.position === slot.position;
          const balance = card.pace + card.shooting + card.passing + card.dribbling + card.defending + card.physical;
          const score = (positionMatch ? 1000 : 0)
            + (criteria === 'overall' ? card.overall : criteria === 'balance' ? Math.round(balance / 6) : positionMatch ? 500 : 0)
            + Math.round(card.overall / 10);
          if (!best || score > best.score) best = { uid: card.uid, score };
        }
        if (best) {
          assign(sport, index, best.uid, false);
          assigned.add(best.uid);
        } else {
          clear(sport, index, false);
        }
      }
      const saved = await flushSquadSave(sport);
      if (saved) toast.success('Time montado e salvo.');
      else toast.error('Time montado, mas não foi possível salvar.');
    } catch (error) {
      console.error('[squad] auto-build failed:', error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível montar o elenco.');
    } finally {
      setAutoBuildSaving(false);
    }
  };

  const handleFormation = (nextFormation: string) => {
    setFormation(sport, nextFormation);
    setSelectedSource(null);
  };

  return (
    <div className="squad-page">
      <div className="squad-page__inner">
        <header className="squad-masthead">
          <div className="squad-masthead__copy">
            <p className="squad-eyebrow"><span aria-hidden="true" /> FUTSENAI · CENTRO TÁTICO</p>
            <h1>Montar elenco</h1>
            <p>Monte sua equipe e escolha os melhores atletas para cada posição.</p>
          </div>
          <div className="squad-save">
            <label htmlFor="squad-save-name">Salvar escalação</label>
            <div className="squad-save__controls">
              <input
                id="squad-save-name"
                value={saveName}
                onChange={event => setSaveName(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') handleSave(); }}
                placeholder="Nome do elenco"
                aria-label="Nome da escalação"
                className="squad-control"
              />
              <button onClick={handleSave} className="squad-save__button"><span>Salvar time</span></button>
              <button type="button" onClick={() => setSavedOpen(value => !value)} aria-expanded={savedOpen} className="squad-saved-toggle">
                <Star aria-hidden="true" /> Escalações <span>{mySaved.length}</span>
              </button>
            </div>
          </div>
        </header>

        {savedOpen && (
          <section className="squad-saved-list" aria-labelledby="squad-saved-title">
            <div className="squad-section-heading">
              <div><p className="squad-eyebrow">SEUS TIMES</p><h2 id="squad-saved-title">Escalações salvas</h2></div>
              <span>{mySaved.length} salvas</span>
            </div>
            {mySaved.length === 0 && <p className="squad-empty-message">Nenhuma escalação salva.</p>}
            <div className="squad-saved-list__items">
              {mySaved.map(saved => (
                <div key={saved.id} className="squad-saved-item">
                  <div className="squad-saved-item__name">
                    {saved.isPrimary && <Star aria-label="Escalação principal" />}
                    <strong>{saved.name}</strong>
                    <span>{normalizeFutsalFormation(saved.formation)}</span>
                  </div>
                  <div className="squad-saved-item__actions">
                    <button onClick={() => handleLoad(saved)} className="btn btn-secondary btn-sm">Carregar</button>
                    <button onClick={() => void handleDuplicate(saved)} disabled={duplicatingId !== null} className="btn btn-secondary btn-sm">
                      {duplicatingId === saved.id ? 'Duplicando...' : 'Duplicar'}
                    </button>
                    <button onClick={() => { setPrimary(saved.id); toast.success(`"${saved.name}" definida como principal.`); }} className="btn btn-secondary btn-sm">Principal</button>
                    <button onClick={() => setPendingDelete(saved)} className="btn btn-danger btn-sm">Excluir</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="squad-command" aria-label="Controles táticos">
          <div className="squad-command__team">
            <span className="squad-command__crest" aria-hidden="true">F</span>
            <div>
              <span className="squad-command__label">ELENCO EM CAMPO</span>
              <strong>{activeSavedSquad?.name ?? 'Elenco atual'}</strong>
            </div>
          </div>
          <div className="squad-tactics">
            <label className="squad-tactic">
              <span>Formação</span>
              <select aria-label="Formação:" value={formation} onChange={event => handleFormation(event.target.value)} className="squad-control squad-control--select">
                {formations.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="squad-tactic">
              <span>Critério</span>
              <select aria-label="Critério:" value={criteria} onChange={event => setCriteria(event.target.value as typeof criteria)} className="squad-control squad-control--select">
                <option value="overall">Maior overall</option>
                <option value="balance">Melhor equilíbrio</option>
                <option value="position">Melhor adequação</option>
              </select>
            </label>
            <div className="squad-tactic__metric"><span>Overall</span><strong>{overall}</strong></div>
            <div className="squad-tactic__metric"><span>Titulares</span><strong>{filledCount}<small>/{squad.starters.length}</small></strong></div>
          </div>
          <button onClick={() => void autoBuild()} disabled={autoBuildSaving} className="squad-auto-build">
            <Sparkles aria-hidden="true" className="squad-auto-build__icon" />
            {autoBuildSaving ? 'Salvando elenco...' : 'Montar melhor time'}
          </button>
        </section>

        {outOfPositionNames.length > 0 && (
          <div role="status" className="squad-position-warning">
            <AlertTriangle aria-hidden="true" />
            <span><strong>{outOfPositionNames.length} fora de posição:</strong> {outOfPositionNames.join(', ')}</span>
          </div>
        )}

        <div className="squad-workspace">
          <section className="squad-field-panel" aria-labelledby="squad-court-title">
            <div className="squad-section-heading">
              <div><p className="squad-eyebrow">TITULARES · {formation}</p><h2 id="squad-court-title">Quadra</h2></div>
              <span>Toque para selecionar · arraste para trocar</span>
            </div>
            <div className="squad-court-shell">
              <div className={`squad-court${selectedSource ? ' squad-court--targeting' : ''}`} role="group" aria-label={`Quadra tática, formação ${formation}`}>
                <div className="squad-court__boundary" aria-hidden="true" />
                <div className="squad-court__halfway" aria-hidden="true" />
                <div className="squad-court__circle" aria-hidden="true" />
                <div className="squad-court__spot" aria-hidden="true" />
                <div className="squad-court__goal squad-court__goal--top" aria-hidden="true" />
                <div className="squad-court__goal squad-court__goal--bottom" aria-hidden="true" />
                <div className="squad-court__stamp" aria-hidden="true">FUTSENAI · FUTSAL</div>
                {squad.starters.map((slot, index) => {
                  const card = slot.uid ? cardsByUid.get(slot.uid) : null;
                  const selected = selectedSource?.type === 'starter' && selectedSource.index === index;
                  const point = coordinates[index] ?? { x: 50, y: 50 };
                  const isDropTarget = Boolean(selectedSource && !selected);
                  const positionMatches = Boolean(selectedCard && selectedCard.position === slot.position);
                  return (
                    <div
                      key={`${slot.position}-${index}`}
                      className={`squad-starter-slot${selected ? ' squad-starter-slot--selected' : ''}${isDropTarget ? ' squad-starter-slot--target' : ''}${isDropTarget && positionMatches ? ' squad-starter-slot--match' : ''}`}
                      data-position={POSITION_LABELS[slot.position]}
                      data-filled={Boolean(card)}
                      style={{ left: `${point.x}%`, top: `${point.y}%` }}
                      onDragOver={event => event.preventDefault()}
                      onDrop={event => handleDrop(event, index, false)}
                    >
                      {card ? (
                        <div
                          key={card.uid}
                          draggable
                          onDragStart={event => handleDragStart({ type: 'starter', index }, event)}
                          className="squad-starter-card"
                        >
                          <Card card={card} size="fluid" onClick={() => handleSlotClick(index, false)} />
                          <button
                            type="button"
                            aria-label={`Visualizar ${card.name} em 3D`}
                            title="Visualizar carta"
                            onClick={event => { event.stopPropagation(); openCardViewer(card); }}
                            className="squad-card__view"
                          ><Eye aria-hidden="true" /></button>
                          <button
                            type="button"
                            aria-label={`Remover ${card.name} da escalação titular`}
                            onClick={event => { event.stopPropagation(); removeStarter(index); }}
                            className="squad-starter-card__remove"
                          >
                            <X aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Slot ${POSITION_LABELS[slot.position]} vazio`}
                          onClick={() => handleSlotClick(index, false)}
                          className="squad-starter-empty"
                        >
                          <Plus aria-hidden="true" /><span>{POSITION_LABELS[slot.position]}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <section className="squad-bench" aria-labelledby="squad-bench-title">
              <div className="squad-section-heading squad-section-heading--small">
                <div><p className="squad-eyebrow">OPÇÕES DE JOGO</p><h3 id="squad-bench-title">Banco de reservas</h3></div>
                <span>Toque para selecionar ou arraste</span>
              </div>
              <div className="squad-bench__grid">
                {squad.bench.map((uid, index) => {
                  const card = uid ? cardsByUid.get(uid) : null;
                  const selected = selectedSource?.type === 'bench' && selectedSource.index === index;
                  return (
                    <div
                      key={`bench-${index}`}
                      className={`squad-bench-slot${selected ? ' squad-bench-slot--selected' : ''}${selectedSource && !selected ? ' squad-bench-slot--target' : ''}`}
                      onDragOver={event => event.preventDefault()}
                      onDrop={event => handleDrop(event, 0, true, index)}
                    >
                      {card ? (
                        <div
                          draggable
                          onDragStart={event => handleDragStart({ type: 'bench', index }, event)}
                          className="squad-bench-card"
                        >
                          <Card card={card} size="fluid" onClick={() => handleSlotClick(0, true, index)} />
                          <button
                            type="button"
                            aria-label={`Visualizar ${card.name} em 3D`}
                            title="Visualizar carta"
                            onClick={event => { event.stopPropagation(); openCardViewer(card); }}
                            className="squad-card__view"
                          ><Eye aria-hidden="true" /></button>
                          <button
                            type="button"
                            aria-label={`Remover ${card.name} das reservas`}
                            onClick={event => { event.stopPropagation(); removeBench(index); }}
                            className="squad-starter-card__remove"
                          ><X aria-hidden="true" /></button>
                        </div>
                      ) : (
                        <button type="button" aria-label={`Reserva ${index + 1} vazia`} onClick={() => handleSlotClick(0, true, index)} className="squad-bench-empty">
                          <Plus aria-hidden="true" /><span>Reserva {index + 1}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </section>

          <section className="squad-inventory" aria-labelledby="squad-inventory-title">
            <header className="squad-inventory__header">
              <div>
                <p className="squad-eyebrow">BANCO DE ATLETAS</p>
                <h2 id="squad-inventory-title">Inventário disponível</h2>
                <span className="squad-inventory__count">{available.length.toLocaleString('pt-BR')} atletas</span>
              </div>
              <span className="squad-inventory__results">{filteredAvailable.length.toLocaleString('pt-BR')} resultados</span>
            </header>
            <label className="squad-search">
              <Search aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={event => { setSearch(event.target.value); setVisibleCardCount(36); }}
                placeholder="Buscar jogador, clube ou raridade..."
                aria-label="Buscar cartas do elenco"
              />
            </label>
            <div className="squad-position-filters" role="group" aria-label="Filtrar cartas por posição">
              <button type="button" aria-pressed={positionFilter === null} onClick={() => { setPositionFilter(null); setVisibleCardCount(36); }} className={positionFilter === null ? 'squad-filter squad-filter--active' : 'squad-filter'}>Todos</button>
              {(['GK', 'Fixo', 'Ala', 'Pivo'] as Position[]).map(position => (
                <button
                  key={position}
                  type="button"
                  aria-pressed={positionFilter === position}
                  onClick={() => { setPositionFilter(current => current === position ? null : position); setVisibleCardCount(36); }}
                  className={positionFilter === position ? 'squad-filter squad-filter--active' : 'squad-filter'}
                >
                  {POSITION_LABELS[position]}
                </button>
              ))}
            </div>
            {listings.some(listing => listing.status === 'active') && (
              <p className="squad-inventory__notice">Cartas anunciadas no mercado ficam indisponíveis até o anúncio ser cancelado ou encerrado.</p>
            )}
            {selectedSource && (
              <div className="squad-selection-hint" role="status">
                <span>{selectedCard ? `${selectedCard.name} selecionado` : 'Jogador selecionado'} · toque numa posição para escalar ou trocar.</span>
                <button type="button" onClick={() => setSelectedSource(null)}>Cancelar</button>
              </div>
            )}
            <div className="squad-inventory__cards" aria-live="polite">
              {visibleCards.map(card => (
                <div
                  key={card.uid}
                  data-testid="inventory-card"
                  data-selected={selectedSource?.type === 'inventory' && selectedSource.uid === card.uid}
                  draggable
                  onDragStart={event => handleDragStart({ type: 'inventory', uid: card.uid }, event)}
                  className="squad-inventory-card"
                >
                  <Card
                    card={card}
                    size="fluid"
                    animateHover
                    onClick={() => setSelectedSource(current =>
                      current?.type === 'inventory' && current.uid === card.uid ? null : { type: 'inventory', uid: card.uid },
                    )}
                  />
                  <button
                    type="button"
                    aria-label={`Visualizar ${card.name} em 3D`}
                    title="Visualizar carta"
                    onClick={event => { event.stopPropagation(); openCardViewer(card); }}
                    className="squad-card__view"
                  ><Eye aria-hidden="true" /></button>
                </div>
              ))}
            </div>
            {filteredAvailable.length === 0 &&             <div className="squad-empty-message">Nenhuma carta disponível com esses filtros.</div>}
            {visibleCards.length < filteredAvailable.length && (
              <button type="button" onClick={() => setVisibleCardCount(count => count + 36)} className="squad-load-more">
              Carregar mais cartas ({filteredAvailable.length - visibleCards.length} restantes)
              </button>
            )}
          </section>
        </div>
      </div>
      <ConfirmModal
        open={pendingPositionSwap !== null}
        title="Carta fora de posição"
        message={pendingPositionSwap?.message ?? ''}
        onCancel={() => setPendingPositionSwap(null)}
        onConfirm={() => {
          if (!pendingPositionSwap) return;
          const pending = pendingPositionSwap;
          setPendingPositionSwap(null);
          handleSlotClick(pending.index, pending.bench, pending.benchIndex, true);
        }}
        confirmLabel="Continuar"
      />
      <ConfirmModal
        open={pendingDelete !== null}
        title="Excluir escalação"
        message={pendingDelete ? `Tem certeza que deseja excluir "${pendingDelete.name}"?` : ''}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteSquad(pendingDelete.id);
          toast.success('Escalação excluída.');
          setPendingDelete(null);
        }}
        confirmVariant="danger"
        confirmLabel="Excluir"
      />
      {cardViewer}
    </div>
  );
}
