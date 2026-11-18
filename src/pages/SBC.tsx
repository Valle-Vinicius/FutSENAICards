import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useGame } from '../store/useGame';
import { toast } from '../store/toast';
import Card from '../components/Card';

const CARDS_PER_PAGE = 48;

export default function SBC() {
  const sbcs = useGame(s => s.sbcs);
  const cards = useGame(s => s.cards);
  const completeSBC = useGame(s => s.completeSBC);
  const [activeSbcId, setActiveSbcId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [completingSbcId, setCompletingSbcId] = useState<string | null>(null);

  const activeSbc = sbcs.find(sbc => sbc.id === activeSbcId) ?? sbcs[0];
  const chosen = activeSbc ? selected[activeSbc.id] || [] : [];
  const filteredCards = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const eligibleCards = cards.filter(card => card.rarity !== 'icon' && card.rarity !== 'secret' && !card.favorite);
    if (!query) return eligibleCards;
    return eligibleCards.filter(card =>
      card.name.toLocaleLowerCase().includes(query)
      || card.club.toLocaleLowerCase().includes(query)
      || card.position.toLocaleLowerCase().includes(query),
    );
  }, [cards, search]);
  const pageCount = Math.max(1, Math.ceil(filteredCards.length / CARDS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleCards = filteredCards.slice(
    currentPage * CARDS_PER_PAGE,
    (currentPage + 1) * CARDS_PER_PAGE,
  );

  const toggle = (sbcId: string, uid: string) => {
    setSelected(prev => {
      const cur = prev[sbcId] || [];
      const next = cur.includes(uid) ? cur.filter(u => u !== uid) : [...cur, uid];
      return { ...prev, [sbcId]: next };
    });
  };

  const handleComplete = async (sbcId: string) => {
    if (completingSbcId) return;
    const uids = selected[sbcId] || [];
    setCompletingSbcId(sbcId);
    try {
      const ok = await completeSBC(sbcId, uids);
      if (ok) { toast.success('Desafio concluído! Recompensa concedida.'); setSelected(prev => ({ ...prev, [sbcId]: [] })); }
      setPage(0);
    } finally {
      setCompletingSbcId(null);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-4">
      <h1 className="text-2xl md:text-3xl font-semibold text-[var(--text)]">Desafios de elenco (SBC)</h1>
      {sbcs.length === 0 ? (
        <div className="card-surface p-6 text-sm text-[var(--muted)]">Nenhum desafio disponível no momento.</div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Desafios disponíveis">
            {sbcs.map(sbc => {
              const isActive = sbc.id === activeSbc?.id;
              const selectedCount = selected[sbc.id]?.length ?? 0;
              return (
                <button
                  key={sbc.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    setActiveSbcId(sbc.id);
                    setSearch('');
                    setPage(0);
                  }}
                  className={`min-w-40 rounded-xl border px-4 py-3 text-left transition ${
                    isActive
                      ? 'border-[var(--red)] bg-[var(--soft)] text-[var(--text)]'
                      : 'border-[var(--border)] bg-white text-[var(--muted)] hover:bg-[var(--bg)]'
                  }`}
                >
                  <span className="block text-sm font-semibold">{sbc.title}</span>
                  <span className="mt-1 block text-xs">{selectedCount} selecionadas</span>
                </button>
              );
            })}
          </div>

          {activeSbc && (
            <section className="card-surface space-y-4 p-4 md:p-6" role="tabpanel">
              <div>
                <h2 className="font-semibold text-[var(--text)]">{activeSbc.title}</h2>
                <p className="text-xs text-[var(--muted)]">{activeSbc.description}</p>
                <p className="mt-1 text-xs text-[var(--text)]">
                  Recompensa: {activeSbc.reward.type} {String(activeSbc.reward.value)} · Requisitos: {activeSbc.requirements.count} cartas
                  {activeSbc.requirements.minOverall ? ` (min OVR ${activeSbc.requirements.minOverall})` : ''}
                  {activeSbc.requirements.sameClub ? ' (mesmo clube)' : ''}
                  {activeSbc.id === 'sbc2' || activeSbc.id === 'sbc3' ? ' · Limite: 3 conclusões por dia' : ''}
                </p>
              </div>

              <label className="flex max-w-xl items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-[var(--muted)] focus-within:border-[var(--red)]">
                <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={event => {
                    setSearch(event.target.value);
                    setPage(0);
                  }}
                  placeholder="Buscar por jogador, clube ou posição"
                  aria-label="Buscar cartas"
                  className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
                />
                <span className="shrink-0 text-xs">{filteredCards.length} cartas · ícones, secretas e favoritas não podem ser entregues</span>
              </label>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                {visibleCards.map(card => {
                  const isSelected = chosen.includes(card.uid);
                  return (
                    <div
                      key={card.uid}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      aria-label={`${isSelected ? 'Remover' : 'Selecionar'} ${card.name}, overall ${card.overall}`}
                      onClick={() => toggle(activeSbc.id, card.uid)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          toggle(activeSbc.id, card.uid);
                        }
                      }}
                      className={`min-w-0 cursor-pointer rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--red)] ${
                        isSelected ? 'ring-2 ring-[var(--red)]' : ''
                      }`}
                    >
                      <Card card={card} size="fluid" />
                    </div>
                  );
                })}
                {visibleCards.length === 0 && (
                  <p className="col-span-full py-8 text-center text-sm text-[var(--muted)]">Nenhuma carta encontrada.</p>
                )}
              </div>

              <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-[var(--muted)]">
                  {chosen.length} selecionadas · Mostrando {filteredCards.length === 0 ? 0 : currentPage * CARDS_PER_PAGE + 1}–{Math.min((currentPage + 1) * CARDS_PER_PAGE, filteredCards.length)} de {filteredCards.length}
                </div>
                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setPage(currentPage - 1)}
                    disabled={currentPage === 0}
                    className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Anterior
                  </button>
                  <span className="text-xs text-[var(--muted)]">{currentPage + 1}/{pageCount}</span>
                  <button
                    type="button"
                    onClick={() => setPage(currentPage + 1)}
                    disabled={currentPage >= pageCount - 1}
                    className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] disabled:opacity-40"
                  >
                    Próxima <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleComplete(activeSbc.id)}
                    disabled={completingSbcId !== null || chosen.length !== activeSbc.requirements.count}
                    className="rounded-xl bg-[var(--red)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                  >
                    {completingSbcId === activeSbc.id ? 'Concluindo...' : 'Confirmar entrega'}
                  </button>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
