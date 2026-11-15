import { Fragment, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowLeftRight, ArrowUp, Lock } from 'lucide-react';
import { useGame } from '../store/useGame';
import { toast } from '../store/toast';
import Card from '../components/Card';
import ConfirmModal from '../components/ConfirmModal';
import type { PlayerCard, Rarity } from '../types';
import { RARITY_META, RARITY_ORDER } from '../types';
import { allTemplates } from '../data/players';
import { totalUpgrades } from '../lib/game';
import { supabase } from '../lib/supabase';
import { DUPLICATE_CONVERSION_REWARD } from '../data/economy';

const PAGE_SIZE = 24;

type CardGroup = { key: string; cards: PlayerCard[] };

export default function Collection() {
  const cards = useGame(s => s.cards);
  const squads = useGame(s => s.squads);
  const savedSquads = useGame(s => s.savedSquads);
  const listings = useGame(s => s.listings);
  const markSeen = useGame(s => s.markSeen);
  const convertDuplicates = useGame(s => s.convertDuplicates);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('');
  const [rar, setRar] = useState('');
  const [club, setClub] = useState('');
  const [sort, setSort] = useState('overall');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [album, setAlbum] = useState(false);
  const [groupDuplicates, setGroupDuplicates] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [confirmConversion, setConfirmConversion] = useState(false);
  const [converting, setConverting] = useState(false);
  const [conversionRewards, setConversionRewards] = useState(() => supabase ? null : DUPLICATE_CONVERSION_REWARD);
  const [conversionRewardsError, setConversionRewardsError] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase.from('economy_config').select('rarity, duplicate_conversion_coins');
        if (!active) return;
        if (error) {
          console.error('[economy] failed to load duplicate conversion values:', error);
          setConversionRewardsError(true);
          return;
        }
        const rewards: Partial<Record<Rarity, number>> = {};
        if (data?.length !== 5) {
          console.error('[economy] expected five duplicate conversion values from the server');
          setConversionRewardsError(true);
          return;
        }
        data.forEach(row => {
          if (row.rarity in DUPLICATE_CONVERSION_REWARD) {
            rewards[row.rarity as Rarity] = row.duplicate_conversion_coins;
          }
        });
        if (!Object.keys(DUPLICATE_CONVERSION_REWARD).every(rarity => rewards[rarity as Rarity] !== undefined)) {
          console.error('[economy] duplicate conversion values are incomplete');
          setConversionRewardsError(true);
          return;
        }
        setConversionRewards(rewards);
      } catch (error) {
        if (!active) return;
        console.error('[economy] failed to load duplicate conversion values:', error);
        setConversionRewardsError(true);
      }
    })();
    return () => { active = false; };
  }, []);

  const deferredQ = useDeferredValue(q);
  const deferredPos = useDeferredValue(pos);
  const deferredRar = useDeferredValue(rar);
  const deferredClub = useDeferredValue(club);

  const rankOf = (rarity: Rarity) => RARITY_ORDER.indexOf(rarity);
  const filtered = useMemo(() => {
    const query = deferredQ.trim().toLowerCase();
    return [...cards].filter(card => {
      if (query && !card.name.toLowerCase().includes(query)) return false;
      if (deferredPos && card.position !== deferredPos) return false;
      if (deferredRar && card.rarity !== deferredRar) return false;
      if (deferredClub && card.club !== deferredClub) return false;
      return true;
    }).sort((a, b) => {
      let result = 0;
      if (sort === 'overall') result = b.overall - a.overall || rankOf(b.rarity) - rankOf(a.rarity) || a.name.localeCompare(b.name);
      else if (sort === 'rarity') result = rankOf(b.rarity) - rankOf(a.rarity) || b.overall - a.overall || a.name.localeCompare(b.name);
      else if (sort === 'name') result = a.name.localeCompare(b.name) || b.overall - a.overall;
      else result = b.obtainedAt - a.obtainedAt;
      return sortDirection === 'asc' ? -result : result;
    });
  }, [cards, deferredQ, deferredPos, deferredRar, deferredClub, sort, sortDirection]);

  const unique = useMemo(() => new Set(cards.map(card => card.name)).size, [cards]);
  const clubs = useMemo(() => [...new Set(cards.map(card => card.club).filter(Boolean))].sort(), [cards]);
  const bestByName = useMemo(() => {
    const best = new Map<string, PlayerCard>();
    for (const card of cards) {
      const current = best.get(card.name);
      if (!current || rankOf(card.rarity) > rankOf(current.rarity)
        || (rankOf(card.rarity) === rankOf(current.rarity) && card.overall > current.overall)) {
        best.set(card.name, card);
      }
    }
    return best;
  }, [cards]);

  const groups = useMemo<CardGroup[]>(() => {
    if (!groupDuplicates) return filtered.map(card => ({ key: card.uid, cards: [card] }));
    const byPlayerAndRarity = new Map<string, PlayerCard[]>();
    for (const card of filtered) {
      const key = `${card.playerId || card.name}::${card.rarity}`;
      const group = byPlayerAndRarity.get(key) ?? [];
      group.push(card);
      byPlayerAndRarity.set(key, group);
    }
    return [...byPlayerAndRarity].map(([key, group]) => ({ key, cards: group }));
  }, [filtered, groupDuplicates]);

  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageGroups = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return groups.slice(start, start + PAGE_SIZE);
  }, [groups, currentPage]);
  const visibleCards = useMemo(() => pageGroups.flatMap(group =>
    groupDuplicates && expandedGroups.has(group.key) ? group.cards : [group.cards[0]],
  ), [pageGroups, groupDuplicates, expandedGroups]);
  const unseenUids = useMemo(() => album ? [] : visibleCards.filter(card => card.isNew).map(card => card.uid), [album, visibleCards]);

  useEffect(() => {
    if (unseenUids.length === 0) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const scheduleSeen = () => {
      if (timeout !== undefined) clearTimeout(timeout);
      if (document.visibilityState === 'visible') {
        timeout = setTimeout(() => markSeen(unseenUids), 3000);
      }
    };
    scheduleSeen();
    document.addEventListener('visibilitychange', scheduleSeen);
    return () => {
      if (timeout !== undefined) clearTimeout(timeout);
      document.removeEventListener('visibilitychange', scheduleSeen);
    };
  }, [unseenUids, markSeen]);

  const lockedUids = useMemo(() => {
    const locked = new Set<string>();
    Object.values(squads).forEach(squad => {
      squad.starters.forEach(slot => { if (slot.uid) locked.add(slot.uid); });
      squad.bench.forEach(uid => { if (uid) locked.add(uid); });
    });
    savedSquads.forEach(squad => {
      squad.starters.forEach(uid => { if (uid) locked.add(uid); });
      squad.bench.forEach(uid => { if (uid) locked.add(uid); });
    });
    listings.filter(listing => listing.status === 'active').forEach(listing => locked.add(listing.cardUid));
    return locked;
  }, [squads, savedSquads, listings]);

  const conversionPreview = useMemo(() => {
    const byName = new Map<string, PlayerCard[]>();
    for (const card of cards) {
      const group = byName.get(card.name) ?? [];
      group.push(card);
      byName.set(card.name, group);
    }
    let count = 0;
    let coins = 0;
    byName.forEach(group => {
      const sorted = [...group].sort((a, b) =>
        Number(b.favorite) - Number(a.favorite)
        || rankOf(b.rarity) - rankOf(a.rarity)
        || b.overall - a.overall
        || totalUpgrades(b) + (b.xp ?? 0) / 1000 - totalUpgrades(a) - (a.xp ?? 0) / 1000,
      );
      const eligibleCards = sorted.slice(1).filter(card =>
        card.rarity !== 'icon' && card.rarity !== 'secret' && !card.favorite && !lockedUids.has(card.uid),
      );
      count += eligibleCards.length;
      coins += eligibleCards.reduce((sum, card) => sum + (conversionRewards?.[card.rarity] ?? 0), 0);
    });
    return { count, coins };
  }, [cards, lockedUids, conversionRewards]);

  const openCard = (card: PlayerCard) => {
    if (card.isNew) markSeen([card.uid]);
    navigate(`/card/${card.uid}`);
  };
  const hasActiveFilters = Boolean(q || pos || rar || club);
  const clearFilters = () => { setQ(''); setPos(''); setRar(''); setClub(''); setPage(1); };
  const chooseSort = (value: string) => {
    setSort(value);
    setSortDirection(value === 'name' ? 'asc' : 'desc');
    setPage(1);
  };
  const toggleGroup = (key: string) => {
    setExpandedGroups(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const handleConvertDuplicates = async () => {
    if (converting) return;
    setConverting(true);
    try {
      const result = await convertDuplicates();
      if (result === null) return;
      setConfirmConversion(false);
      if (result.count > 0) {
        toast.success(`${result.count} cartas convertidas por ${result.coins.toLocaleString('pt-BR')} moedas. Cartas usadas em apostas ou partidas foram preservadas.`);
      } else {
        toast.info('Nenhuma duplicata elegível. Favoritas, cartas em elencos, anúncios, apostas e histórico de partidas são preservados.');
      }
    } finally {
      setConverting(false);
    }
  };

  const selectClass = 'bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm text-[#252733]';
  const conversionMessage = conversionRewardsError
    ? 'Não foi possível carregar os valores atuais. A prévia está indisponível; o servidor continua validando o total pago.'
    : !conversionRewards
      ? 'Carregando os valores atuais de conversão do servidor...'
    : conversionPreview.count > 0
      ? `Prévia: até ${conversionPreview.count} ${conversionPreview.count === 1 ? 'carta elegível' : 'cartas elegíveis'}, com estimativa de ${conversionPreview.coins.toLocaleString('pt-BR')} moedas. Cartas favoritas, em elencos e anúncios ativos são excluídas. O servidor também preserva cartas ligadas a partidas e apostas; por isso, o total final pode ser menor.`
    : 'Nenhuma duplicata parece elegível no inventário atual. Cartas favoritas, em elencos, anúncios, partidas e apostas são preservadas. O servidor revalida tudo antes de converter.';

  return (
    <div className="min-h-screen space-y-4 bg-[var(--bg)] p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-[#252733] md:text-3xl">Minhas cartas</h1>
        <p className="text-xs text-[#858A98]">
          {cards.length} cartas · {unique} únicas · {cards.length - unique} duplicadas
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setAlbum(value => !value)} className={`btn btn-sm ${album ? 'btn-primary' : 'btn-secondary'}`}>
          {album ? 'Ver coleção' : 'Ver álbum'}
        </button>
        {!album && (
          <button
            type="button"
            aria-pressed={groupDuplicates}
            onClick={() => { setGroupDuplicates(value => !value); setPage(1); }}
            className="btn btn-secondary btn-sm"
          >
            Agrupar repetidas: {groupDuplicates ? 'ligado' : 'desligado'}
          </button>
        )}
        <button onClick={() => setConfirmConversion(true)} className="btn btn-danger btn-sm">
          Converter duplicatas
        </button>
      </div>

      <div className="card-surface space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={event => { setQ(event.target.value); setPage(1); }} placeholder="Buscar por nome..." className={`min-w-[160px] flex-1 ${selectClass}`} />
          <select value={pos} onChange={event => { setPos(event.target.value); setPage(1); }} className={selectClass} aria-label="Filtrar por posição">
            <option value="">Posição</option>
            {['GK', 'Fixo', 'Ala', 'Pivo'].map(position => <option key={position} value={position}>{position}</option>)}
          </select>
          <select value={club} onChange={event => { setClub(event.target.value); setPage(1); }} className={selectClass} aria-label="Filtrar por clube">
            <option value="">Clube</option>
            {clubs.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          {hasActiveFilters && <button onClick={clearFilters} className="btn btn-secondary btn-sm">Limpar filtros</button>}
        </div>

        <div className="flex flex-wrap items-center gap-2" aria-label="Filtrar por raridade">
          {RARITY_ORDER.map(rarity => {
            const selected = rar === rarity;
            return (
              <button
                key={rarity}
                type="button"
                aria-pressed={selected}
                onClick={() => { setRar(current => current === rarity ? '' : rarity); setPage(1); }}
                className={`btn btn-sm ${selected ? 'border-2' : 'btn-secondary'}`}
                style={selected ? {
                  backgroundColor: `${RARITY_META[rarity].color}22`,
                  borderColor: RARITY_META[rarity].color,
                  color: 'var(--text)',
                } : { borderColor: `${RARITY_META[rarity].color}88` }}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RARITY_META[rarity].color }} />
                {RARITY_META[rarity].label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-[#858A98]">
          <label htmlFor="collection-sort">Ordenar por</label>
          <select id="collection-sort" value={sort} onChange={event => chooseSort(event.target.value)} className={selectClass}>
            <option value="overall">Overall</option>
            <option value="rarity">Raridade</option>
            <option value="name">Nome</option>
            <option value="date">Data</option>
          </select>
          <button
            type="button"
            aria-label={sortDirection === 'asc' ? 'Ordenação crescente' : 'Ordenação decrescente'}
            onClick={() => { setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc'); setPage(1); }}
            className="btn btn-secondary btn-sm"
          >
            {sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {album ? (
        <div className="[grid-template-columns:repeat(auto-fill,minmax(160px,1fr))] grid gap-4">
          {allTemplates().map(template => {
            const owned = bestByName.get(template.name);
            return owned ? (
              <div key={template.name} className="min-w-0 space-y-2">
                <Card card={owned} size="fluid" onClick={() => openCard(owned)} />
                <button
                  type="button"
                  onClick={() => navigate(`/compare?a=${encodeURIComponent(owned.uid)}`)}
                  className="btn btn-secondary btn-sm w-full justify-center"
                >
                  <ArrowLeftRight className="h-4 w-4" /> Comparar
                </button>
              </div>
            ) : (
              <div key={template.name} className="flex aspect-[7/10] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#E9EAF0] bg-white/60 text-xs text-[#858A98]">
                <Lock className="h-6 w-6 opacity-30" />
                <div className="mt-1 px-2 text-center">{template.name}</div>
              </div>
            );
          })}
        </div>
      ) : groups.length === 0 ? (
        <div className="py-12 text-center text-[#858A98]">Nenhuma carta encontrada.</div>
      ) : (
        <>
          <div className="[grid-template-columns:repeat(auto-fill,minmax(160px,1fr))] grid gap-4">
            {pageGroups.map(group => {
              const card = group.cards[0];
              const expanded = expandedGroups.has(group.key);
              return (
                <Fragment key={group.key}>
                  <div className="min-w-0 space-y-2">
                    <div className="relative">
                      <Card card={card} size="fluid" onClick={() => openCard(card)} isNew={card.isNew} />
                      {groupDuplicates && group.cards.length > 1 && (
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-label={`${expanded ? 'Ocultar' : 'Mostrar'} ${group.cards.length - 1} ${group.cards.length === 2 ? 'cópia' : 'cópias'} de ${card.name}`}
                          onClick={() => toggleGroup(group.key)}
                          className="absolute right-2 top-20 z-30 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#252733] shadow"
                        >
                          ×{group.cards.length}
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/compare?a=${encodeURIComponent(card.uid)}`)}
                      className="btn btn-secondary btn-sm w-full justify-center"
                    >
                      <ArrowLeftRight className="h-4 w-4" /> Comparar
                    </button>
                  </div>
                  {expanded && group.cards.length > 1 && (
                    <div className="[grid-template-columns:repeat(auto-fill,minmax(160px,1fr))] col-span-full grid gap-4 rounded-xl border border-dashed border-[#E9EAF0] bg-white/50 p-3">
                      {group.cards.slice(1).map(copy => (
                        <div key={copy.uid} className="min-w-0 space-y-2">
                          <Card card={copy} size="fluid" onClick={() => openCard(copy)} isNew={copy.isNew} />
                          <button
                            type="button"
                            onClick={() => navigate(`/compare?a=${encodeURIComponent(copy.uid)}`)}
                            className="btn btn-secondary btn-sm w-full justify-center"
                          >
                            <ArrowLeftRight className="h-4 w-4" /> Comparar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-1">
              <button onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="btn btn-secondary btn-sm" aria-label="Página anterior">‹</button>
              {(() => {
                const pages: (number | string)[] = [];
                if (totalPages <= 7) {
                  for (let index = 1; index <= totalPages; index++) pages.push(index);
                } else {
                  pages.push(1);
                  if (currentPage > 3) pages.push('...');
                  for (let index = Math.max(2, currentPage - 1); index <= Math.min(totalPages - 1, currentPage + 1); index++) pages.push(index);
                  if (currentPage < totalPages - 2) pages.push('...');
                  pages.push(totalPages);
                }
                return pages.map((item, index) => typeof item === 'number' ? (
                  <button
                    key={index}
                    onClick={() => setPage(item)}
                    aria-current={item === currentPage ? 'page' : undefined}
                    className={`btn btn-sm ${item === currentPage ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {item}
                  </button>
                ) : <span key={index} className="px-1 text-[#858A98]">…</span>);
              })()}
              <button onClick={() => setPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages} className="btn btn-secondary btn-sm" aria-label="Próxima página">›</button>
            </div>
          )}
        </>
      )}

      <ConfirmModal
        open={confirmConversion}
        title="Converter duplicatas?"
        message={conversionMessage}
        onConfirm={() => void handleConvertDuplicates()}
        onCancel={() => { if (!converting) setConfirmConversion(false); }}
        confirmLabel={converting ? 'Convertendo...' : 'Converter'}
        confirmVariant="danger"
        confirmDisabled={converting}
      />
    </div>
  );
}
