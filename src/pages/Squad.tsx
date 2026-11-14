import { useDeferredValue, useMemo, useState, type DragEvent as ReactDragEvent } from 'react';
import { AlertTriangle, Plus, Search, Star, X } from 'lucide-react';
import Card from '../components/Card';
import { useGame, squadOverall } from '../store/useGame';
import { toast } from '../store/toast';
import { DEFAULT_FUTSAL_FORMATION, FORMATIONS_FUTSAL, normalizeFutsalFormation } from '../lib/game';
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

function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

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
  const deferredSearch = useDeferredValue(search);

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
    });
  }, [available, deferredSearch, positionFilter]);
  const visibleCards = filteredAvailable.slice(0, visibleCardCount);
  const mySaved = savedSquads.filter(saved => saved.sport === sport);
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

  const handleSlotClick = (index: number, bench: boolean, benchIndex?: number) => {
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
    if (sourceCard && targetSlot && sourceCard.position !== targetSlot.position
      && !window.confirm(`${sourceCard.name} é ${sourceCard.position}, mas o slot é ${targetSlot.position}. Deseja continuar?`)) {
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
    <div className="space-y-4 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#252733] md:text-3xl">Montar elenco</h1>
          <p className="mt-1 text-sm text-[#858A98]">{formation} · arraste ou toque para escalar</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={saveName}
            onChange={event => setSaveName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') handleSave(); }}
            placeholder="Nome da escalação"
            aria-label="Nome da escalação"
            className="min-w-[170px] rounded-xl border border-[#E9EAF0] bg-white px-3 py-2 text-sm"
          />
          <button onClick={handleSave} className="btn btn-primary btn-sm">Salvar</button>
          <button onClick={() => setSavedOpen(value => !value)} aria-expanded={savedOpen} className="btn btn-secondary btn-sm">
            Escalações salvas ({mySaved.length})
          </button>
        </div>
      </header>

      {savedOpen && (
        <section className="card-surface space-y-3 p-4">
          <h2 className="font-semibold text-[#252733]">Escalações salvas</h2>
          {mySaved.length === 0 && <p className="text-sm text-[#858A98]">Nenhuma escalação salva.</p>}
          <div className="space-y-2">
            {mySaved.map(saved => (
              <div key={saved.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E9EAF0] p-2">
                <div className="text-sm text-[#252733]">
                  {saved.isPrimary && <Star className="mr-1 inline h-3 w-3 text-[#E30613]" />}
                  {saved.name} <span className="text-xs text-[#858A98]">({normalizeFutsalFormation(saved.formation)})</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleLoad(saved)} className="btn btn-secondary btn-sm">Carregar</button>
                  <button onClick={() => void handleDuplicate(saved)} disabled={duplicatingId !== null} className="btn btn-secondary btn-sm">
                    {duplicatingId === saved.id ? 'Duplicando...' : 'Duplicar'}
                  </button>
                  <button onClick={() => { setPrimary(saved.id); toast.success(`"${saved.name}" definida como principal.`); }} className="btn btn-secondary btn-sm">Principal</button>
                  <button onClick={() => { if (window.confirm(`Excluir "${saved.name}"?`)) { deleteSquad(saved.id); toast.success('Escalação excluída.'); } }} className="btn btn-danger btn-sm">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card-surface flex flex-wrap items-center gap-4 p-4">
        <div className="min-w-[130px]">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#858A98]">Overall do elenco</div>
          <div className="text-4xl font-bold leading-tight text-[#E30613]">{overall}</div>
        </div>
        <div className="rounded-xl bg-[#F7F7F9] px-4 py-3 text-sm font-semibold text-[#252733]">
          {filledCount}/{squad.starters.length} titulares
        </div>
        {outOfPositionNames.length > 0 && (
          <div role="status" className="flex min-w-0 flex-1 items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span><strong>{outOfPositionNames.length} fora de posição:</strong> {outOfPositionNames.join(', ')}</span>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-[#858A98]">
          Formação:
          <select value={formation} onChange={event => handleFormation(event.target.value)} className="rounded-xl border border-[#E9EAF0] bg-white px-3 py-2 text-sm text-[#252733]">
            {formations.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-[#858A98]">
          Critério:
          <select value={criteria} onChange={event => setCriteria(event.target.value as typeof criteria)} className="rounded-xl border border-[#E9EAF0] bg-white px-3 py-2 text-sm text-[#252733]">
            <option value="overall">Maior overall</option>
            <option value="balance">Melhor equilíbrio</option>
            <option value="position">Melhor adequação</option>
          </select>
        </label>
        <button onClick={() => void autoBuild()} disabled={autoBuildSaving} className="btn btn-primary btn-sm">
          {autoBuildSaving ? 'Salvando elenco...' : 'Montar melhor time'}
        </button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="card-surface space-y-3 p-3 md:p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-[#252733]">Quadra</h2>
            <span className="text-xs text-[#858A98]">Toque em um titular e depois em outro para trocar</span>
          </div>
          <div className="relative mx-auto aspect-[4/5] w-full max-w-[620px] overflow-hidden rounded-2xl border-4 border-emerald-800/70 bg-gradient-to-b from-emerald-500 to-emerald-700 shadow-inner">
            <div className="pointer-events-none absolute inset-3 rounded-xl border-2 border-white/55" />
            <div className="pointer-events-none absolute left-3 right-3 top-1/2 border-t-2 border-white/55" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/55" />
            <div className="pointer-events-none absolute left-[30%] right-[30%] top-3 h-[10%] rounded-b-xl border-2 border-t-0 border-white/55" />
            <div className="pointer-events-none absolute bottom-3 left-[30%] right-[30%] h-[10%] rounded-t-xl border-2 border-b-0 border-white/55" />
            <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 text-[9px] font-bold tracking-[0.3em] text-white/55">FUTSAL</div>
            {squad.starters.map((slot, index) => {
              const card = slot.uid ? cardsByUid.get(slot.uid) : null;
              const selected = selectedSource?.type === 'starter' && selectedSource.index === index;
              const point = coordinates[index] ?? { x: 50, y: 50 };
              return (
                <div
                  key={`${slot.position}-${index}`}
                  className="absolute z-10 w-[19%] sm:w-[17%]"
                  style={{ left: `${point.x}%`, top: `${point.y}%`, transform: 'translate(-50%, -50%)' }}
                  onDragOver={event => event.preventDefault()}
                  onDrop={event => handleDrop(event, index, false)}
                >
                  {card ? (
                    <>
                      <div
                        draggable
                        onDragStart={event => handleDragStart({ type: 'starter', index }, event)}
                        className={`relative rounded-2xl ${selected ? 'ring-2 ring-[#E30613] ring-offset-2' : ''}`}
                      >
                        <Card card={card} size="fluid" onClick={() => handleSlotClick(index, false)} />
                        <button
                          type="button"
                          aria-label={`Remover ${card.name} da escalação titular`}
                          onClick={event => { event.stopPropagation(); removeStarter(index); }}
                          className="absolute -right-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-white text-red-600 shadow"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Slot ${POSITION_LABELS[slot.position]} vazio`}
                      onClick={() => handleSlotClick(index, false)}
                      className={`flex aspect-[1.65/1] w-full items-center justify-center gap-1 rounded-xl border-2 border-dashed bg-white/80 text-xs font-bold text-emerald-950 shadow-sm ${selectedSource ? 'border-white' : 'border-white/60'}`}
                    >
                      <Plus className="h-4 w-4" /> {POSITION_LABELS[slot.position]}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#252733]">Reservas</h3>
              <span className="text-xs text-[#858A98]">Toque para selecionar ou arraste uma carta</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {squad.bench.map((uid, index) => {
                const card = uid ? cardsByUid.get(uid) : null;
                const selected = selectedSource?.type === 'bench' && selectedSource.index === index;
                return (
                  <div
                    key={`bench-${index}`}
                    className="relative min-w-0"
                    onDragOver={event => event.preventDefault()}
                    onDrop={event => handleDrop(event, 0, true, index)}
                  >
                    {card ? (
                      <>
                        <div
                          draggable
                          onDragStart={event => handleDragStart({ type: 'bench', index }, event)}
                          className={`relative rounded-2xl ${selected ? 'ring-2 ring-[#E30613] ring-offset-2' : ''}`}
                        >
                          <Card card={card} size="fluid" onClick={() => handleSlotClick(0, true, index)} />
                          <button
                            type="button"
                            aria-label={`Remover ${card.name} das reservas`}
                            onClick={event => { event.stopPropagation(); removeBench(index); }}
                            className="absolute -right-1.5 -top-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-white text-red-600 shadow"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Reserva ${index + 1} vazia`}
                        onClick={() => handleSlotClick(0, true, index)}
                        className="flex aspect-[1.65/1] w-full items-center justify-center rounded-xl border-2 border-dashed border-[#E9EAF0] bg-white text-[#858A98]"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="card-surface flex h-[62vh] min-h-[420px] flex-col p-3 md:p-4 lg:h-[calc(100vh-285px)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-[#252733]">Inventário disponível ({available.length})</h2>
            <span className="text-xs text-[#858A98]">{filteredAvailable.length} resultados</span>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#858A98]" />
            <input
              type="search"
              value={search}
              onChange={event => { setSearch(event.target.value); setVisibleCardCount(36); }}
              placeholder="Buscar por nome, clube ou raridade..."
              aria-label="Buscar cartas do elenco"
              className="w-full rounded-xl border border-[#E9EAF0] bg-white py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Filtrar cartas por posição">
            {(['GK', 'Fixo', 'Ala', 'Pivo'] as Position[]).map(position => (
              <button
                key={position}
                type="button"
                aria-pressed={positionFilter === position}
                onClick={() => { setPositionFilter(current => current === position ? null : position); setVisibleCardCount(36); }}
                className={`btn btn-sm ${positionFilter === position ? 'btn-primary' : 'btn-secondary'}`}
              >
                {POSITION_LABELS[position]}
              </button>
            ))}
            {positionFilter && <button onClick={() => setPositionFilter(null)} className="btn btn-ghost btn-sm">Limpar posição</button>}
          </div>
          {listings.some(listing => listing.status === 'active') && (
            <p className="mb-2 text-xs text-amber-800">Cartas anunciadas no mercado ficam indisponíveis até o anúncio ser cancelado ou encerrado.</p>
          )}
          {selectedSource && (
            <p className="mb-2 rounded-lg bg-[#FFF0F2] px-2 py-1 text-xs text-[#252733]">
              Carta selecionada. Toque em um slot para escalar; toque em outro titular para trocar.
            </p>
          )}
          <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-auto sm:grid-cols-3">
            {visibleCards.map(card => (
              <div
                key={card.uid}
                data-testid="inventory-card"
                draggable
                onDragStart={event => handleDragStart({ type: 'inventory', uid: card.uid }, event)}
                className={`min-w-0 rounded-2xl ${selectedSource?.type === 'inventory' && selectedSource.uid === card.uid ? 'ring-2 ring-[#E30613] ring-offset-2' : ''}`}
              >
                <Card
                  card={card}
                  size="fluid"
                  onClick={() => setSelectedSource(current =>
                    current?.type === 'inventory' && current.uid === card.uid ? null : { type: 'inventory', uid: card.uid },
                  )}
                />
              </div>
            ))}
          </div>
          {filteredAvailable.length === 0 && <div className="pt-3 text-sm text-[#858A98]">Nenhuma carta disponível com esses filtros.</div>}
          {visibleCards.length < filteredAvailable.length && (
            <button type="button" onClick={() => setVisibleCardCount(count => count + 36)} className="btn btn-secondary btn-sm mt-2 w-full">
              Carregar mais cartas ({filteredAvailable.length - visibleCards.length} restantes)
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
