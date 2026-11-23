import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Coins, PackageOpen, Search, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useGame } from '../store/useGame';
import { toast } from '../store/toast';
import Card from '../components/Card';
import ConfirmModal from '../components/ConfirmModal';
import { supabase } from '../lib/supabase';
import { UUID_RE } from '../lib/game';
import { getSBCCompletionHistory, type SBCCompletionRecord } from '../lib/services/sbc';
import { RARITY_META, RARITY_ORDER, type PlayerCard, type Position, type Rarity, type SBC as SBCDefinition } from '../types';
import './SBC.css';
import bronzeArt from '../imagens/pacotes/bronze.png';
import silverArt from '../imagens/pacotes/prata.png';
import goldArt from '../imagens/pacotes/ouro.png';
import premiumArt from '../imagens/pacotes/premium.png';
import rarePlayersArt from '../imagens/pacotes/jogadoresraros.png';
import legendsArt from '../imagens/pacotes/lendas.png';
import goalkeepersArt from '../imagens/pacotes/goleiros.png';
import choiceArt from '../imagens/pacotes/escolhaespecial.png';
import offSaleArt from '../imagens/pacotes/offsale.png';

const CARDS_PER_PAGE = 48;
const INITIAL_TODAY_UTC = new Date().toISOString().slice(0, 10);
const FUTSAL_REQUIREMENTS: Position[] = ['GK', 'Fixo', 'Ala', 'Ala', 'Pivo'];
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
const POSITION_OPTIONS: { value: Position; label: string }[] = [
  { value: 'GK', label: 'Goleiro' },
  { value: 'Fixo', label: 'Fixo' },
  { value: 'Ala', label: 'Ala' },
  { value: 'Pivo', label: 'Pivô' },
];

function positionLabel(position: string) {
  if (position === 'GK') return 'Goleiro';
  if (position === 'Pivo') return 'Pivô';
  return position;
}

function requiredPositions(sbc: SBCDefinition): string[] | null {
  if (sbc.id === 'sbc2') return FUTSAL_REQUIREMENTS;
  const position = sbc.requirements.position;
  if (position && position !== 'any') return Array.from({ length: sbc.requirements.count }, () => position);
  return null;
}

function getRequirementIssues(sbc: SBCDefinition, selectedCards: PlayerCard[], selectedIds: string[]) {
  const issues: string[] = [];
  const requirements = sbc.requirements;

  if (selectedIds.length !== requirements.count) {
    issues.push(`Selecione exatamente ${requirements.count} cartas.`);
  }
  if (new Set(selectedIds).size !== selectedIds.length) {
    issues.push('As cartas selecionadas precisam ser diferentes.');
  }
  if (selectedCards.length !== selectedIds.length) {
    issues.push('Uma ou mais cartas não estão mais no inventário.');
  }
  if (requirements.minOverall && selectedCards.some(card => card.overall < requirements.minOverall!)) {
    issues.push(`Todas as cartas precisam ter overall ${requirements.minOverall} ou superior.`);
  }
  if (requirements.rarity && selectedCards.some(card => card.rarity !== requirements.rarity)) {
    issues.push(`Todas as cartas precisam ter raridade ${RARITY_META[requirements.rarity as Rarity]?.label ?? requirements.rarity}.`);
  }
  if (requirements.position && requirements.position !== 'any' && selectedCards.some(card => card.position !== requirements.position)) {
    issues.push(`Todas as cartas precisam ser da posição ${positionLabel(requirements.position)}.`);
  }
  if (requirements.sameClub && new Set(selectedCards.map(card => card.club)).size > 1) {
    issues.push('Todas as cartas precisam ser do mesmo clube.');
  }

  const positions = requiredPositions(sbc);
  if (positions && selectedCards.length === requirements.count) {
    const requiredCounts = positions.reduce<Record<string, number>>((counts, position) => {
      counts[position] = (counts[position] ?? 0) + 1;
      return counts;
    }, {});
    const selectedCounts = selectedCards.reduce<Record<string, number>>((counts, card) => {
      counts[card.position] = (counts[card.position] ?? 0) + 1;
      return counts;
    }, {});
    const meetsPositions = Object.entries(requiredCounts).every(([position, count]) =>
      selectedCounts[position] === count,
    ) && Object.entries(selectedCounts).every(([position, count]) =>
      requiredCounts[position] === count,
    );
    if (!meetsPositions) {
      issues.push('A seleção não atende à distribuição de posições exigida.');
    }
  }

  return [...new Set(issues)];
}

function completionDay(createdAt: string) {
  const timestamp = new Date(createdAt);
  return Number.isNaN(timestamp.getTime()) ? '' : timestamp.toISOString().slice(0, 10);
}

export default function SBC() {
  const sbcs = useGame(state => state.sbcs);
  const cards = useGame(state => state.cards);
  const listings = useGame(state => state.listings);
  const squads = useGame(state => state.squads);
  const savedSquads = useGame(state => state.savedSquads);
  const packConfigs = useGame(state => state.packConfigs);
  const completeSBC = useGame(state => state.completeSBC);
  const [activeSbcId, setActiveSbcId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<Position | 'all'>('all');
  const [rarityFilter, setRarityFilter] = useState<Rarity | 'all'>('all');
  const [minimumOverall, setMinimumOverall] = useState('0');
  const [clubFilter, setClubFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [completingSbcId, setCompletingSbcId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [completionHistory, setCompletionHistory] = useState<SBCCompletionRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(!!supabase);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [completedNotice, setCompletedNotice] = useState<string | null>(null);
  const [todayUtc, setTodayUtc] = useState(INITIAL_TODAY_UTC);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const currentDay = new Date().toISOString().slice(0, 10);
      setTodayUtc(previousDay => previousDay === currentDay ? previousDay : currentDay);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    const loadHistory = async () => {
      try {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        if (!data.session?.user.id) throw new Error('Entre na sua conta para consultar o histórico dos desafios.');
        const history = await getSBCCompletionHistory(data.session.user.id);
        if (active) setCompletionHistory(history);
      } catch (error) {
        if (active) {
          const message = error instanceof Error ? error.message : 'Não foi possível consultar o histórico dos desafios.';
          console.error('[sbc] completion history failed:', error);
          setHistoryError(message);
          toast.error(message);
        }
      } finally {
        if (active) setHistoryLoading(false);
      }
    };
    void loadHistory();
    return () => { active = false; };
  }, []);

  const activeSbc = sbcs.find(sbc => sbc.id === activeSbcId) ?? sbcs[0];
  const chosen = activeSbc ? selected[activeSbc.id] ?? [] : [];
  const cardsByUid = useMemo(() => new Map(cards.map(card => [card.uid, card])), [cards]);
  const chosenCards = chosen.map(uid => cardsByUid.get(uid)).filter((card): card is PlayerCard => !!card);
  const activeListings = useMemo(
    () => new Set(listings.filter(listing => listing.status === 'active').map(listing => listing.cardUid)),
    [listings],
  );
  const squadCardUids = useMemo(() => {
    const activeUids = [
      ...squads.futsal.starters.map(slot => slot.uid),
      ...squads.futsal.bench,
    ];
    const savedUids = savedSquads.flatMap(squad => [...squad.starters, ...squad.bench]);
    return new Set([...activeUids, ...savedUids].filter((uid): uid is string => !!uid));
  }, [squads.futsal, savedSquads]);
  const clubs = useMemo(
    () => [...new Set(cards.map(card => card.club).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [cards],
  );

  const getCompletionsToday = (sbcId: string) => completionHistory.filter(
    record => record.sbcId === sbcId && completionDay(record.createdAt) === todayUtc,
  ).length;
  const hasCompletedOneTime = (sbc: SBCDefinition) =>
    !sbc.repeatable && completionHistory.some(record => record.sbcId === sbc.id);
  const reachedDailyLimit = (sbc: SBCDefinition) =>
    !!supabase && (sbc.id === 'sbc2' || sbc.id === 'sbc3') && getCompletionsToday(sbc.id) >= 3;

  const getBaseCardRestriction = (card: PlayerCard): string | null => {
    if (card.rarity === 'icon' || card.rarity === 'secret' || card.favorite) {
      return 'Cartas Ícone, secretas e favoritas não podem ser entregues.';
    }
    if (activeListings.has(card.uid)) return 'Cancele o anúncio ativo desta carta antes de usá-la.';
    if (squadCardUids.has(card.uid)) return 'Remova esta carta dos elencos ativos e salvos antes de entregá-la.';
    if (supabase && !UUID_RE.test(card.uid)) return 'Esta carta ainda não está sincronizada com sua conta.';
    return null;
  };

  const getCardRestriction = (card: PlayerCard, sbc: SBCDefinition, selectedCards: PlayerCard[]): string | null => {
    const baseRestriction = getBaseCardRestriction(card);
    if (baseRestriction) return baseRestriction;
    if (hasCompletedOneTime(sbc)) return 'Este desafio já foi concluído e não pode ser repetido.';
    if (reachedDailyLimit(sbc)) return 'Limite diário de 3 conclusões atingido para este desafio.';
    if (selectedCards.length >= sbc.requirements.count) return `Todas as ${sbc.requirements.count} vagas já estão preenchidas.`;
    if (sbc.requirements.minOverall && card.overall < sbc.requirements.minOverall) {
      return `Este desafio exige overall ${sbc.requirements.minOverall} ou superior.`;
    }
    if (sbc.requirements.rarity && card.rarity !== sbc.requirements.rarity) {
      return `Este desafio exige cartas ${RARITY_META[sbc.requirements.rarity as Rarity]?.label ?? sbc.requirements.rarity}.`;
    }
    const positions = requiredPositions(sbc);
    if (positions) {
      const selectedPositionCount = selectedCards.filter(selectedCard => selectedCard.position === card.position).length;
      const requiredPositionCount = positions.filter(position => position === card.position).length;
      if (!requiredPositionCount) return `Este desafio exige: ${positions.map(positionLabel).join(', ')}.`;
      if (selectedPositionCount >= requiredPositionCount) {
        return `As vagas de ${positionLabel(card.position)} já foram preenchidas.`;
      }
    }
    if (sbc.requirements.position && sbc.requirements.position !== 'any' && card.position !== sbc.requirements.position) {
      return `Este desafio exige cartas da posição ${positionLabel(sbc.requirements.position)}.`;
    }
    if (sbc.requirements.sameClub && selectedCards.some(selectedCard => selectedCard.club !== card.club)) {
      return 'Todas as cartas selecionadas precisam ser do mesmo clube.';
    }
    return null;
  };

  const getSelectionIssues = (sbc: SBCDefinition, ids: string[], selectedCards: PlayerCard[]) => {
    const issues = getRequirementIssues(sbc, selectedCards, ids);
    for (const card of selectedCards) {
      const restriction = getBaseCardRestriction(card);
      if (restriction) issues.push(restriction);
    }
    return [...new Set(issues)];
  };

  const getSbcStatus = (sbc: SBCDefinition) => {
    const ids = selected[sbc.id] ?? [];
    const selectedCards = ids.map(uid => cardsByUid.get(uid)).filter((card): card is PlayerCard => !!card);
    if (historyLoading) return 'Verificando';
    if (historyError) return 'Indisponível';
    if (hasCompletedOneTime(sbc)) return 'Concluído';
    if (reachedDailyLimit(sbc)) return 'Limite diário';
    const issues = getSelectionIssues(sbc, ids, selectedCards);
    if (ids.length === sbc.requirements.count && issues.length === 0) return 'Pronto';
    return ids.length > 0 ? 'Em montagem' : 'Disponível';
  };

  const searchQuery = search.trim().toLocaleLowerCase();
  const numericMinimum = Number.parseInt(minimumOverall, 10);
  const minimumOverallValue = Number.isFinite(numericMinimum) ? Math.min(99, Math.max(0, numericMinimum)) : 0;
  const filteredCards = useMemo(() => cards.filter(card => {
    if (positionFilter !== 'all' && card.position !== positionFilter) return false;
    if (rarityFilter !== 'all' && card.rarity !== rarityFilter) return false;
    if (clubFilter !== 'all' && card.club !== clubFilter) return false;
    if (card.overall < minimumOverallValue) return false;
    if (!searchQuery) return true;
    const rarityName = RARITY_META[card.rarity]?.label ?? card.rarity;
    return [card.name, card.club, card.position, rarityName]
      .some(value => value.toLocaleLowerCase().includes(searchQuery));
  }), [cards, positionFilter, rarityFilter, clubFilter, minimumOverallValue, searchQuery]);
  const pageCount = Math.max(1, Math.ceil(filteredCards.length / CARDS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleCards = filteredCards.slice(
    currentPage * CARDS_PER_PAGE,
    (currentPage + 1) * CARDS_PER_PAGE,
  );

  const toggle = (sbc: SBCDefinition, uid: string) => {
    const current = selected[sbc.id] ?? [];
    if (current.includes(uid)) {
      setSelected(previous => ({ ...previous, [sbc.id]: current.filter(id => id !== uid) }));
      return;
    }
    const card = cardsByUid.get(uid);
    if (!card) {
      toast.error('Esta carta não está mais no inventário.');
      return;
    }
    const existingCards = current.map(id => cardsByUid.get(id)).filter((item): item is PlayerCard => !!item);
    const restriction = getCardRestriction(card, sbc, existingCards);
    if (restriction) {
      toast.error(restriction);
      return;
    }
    setSelected(previous => ({ ...previous, [sbc.id]: [...current, uid] }));
  };

  const handleComplete = async () => {
    if (!activeSbc || completingSbcId || !canDeliver) return;
    const sbcId = activeSbc.id;
    const cardUids = [...chosen];
    setCompletingSbcId(sbcId);
    try {
      const completed = await completeSBC(sbcId, cardUids);
      if (!completed) return;
      const record = { sbcId, createdAt: new Date().toISOString() };
      setCompletionHistory(previous => [...previous, record]);
      setCompletedNotice(sbcId);
      setSelected(previous => ({ ...previous, [sbcId]: [] }));
      setPage(0);
      toast.success('Desafio concluído! Recompensa concedida.');
    } catch (error) {
      console.error('[sbc] completion request failed:', error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível concluir o desafio.');
    } finally {
      setCompletingSbcId(null);
    }
  };

  if (sbcs.length === 0) {
    return (
      <div className="sbc-page">
        <header className="sbc-page__header">
          <span>FUTSENAI · MODO DE ELENCO</span>
          <h1>DESAFIOS DE ELENCO</h1>
          <p>Monte seu elenco, complete os requisitos e conquiste recompensas.</p>
        </header>
        <div className="sbc-empty-state">Nenhum desafio disponível no momento.</div>
      </div>
    );
  }

  const completedOnce = hasCompletedOneTime(activeSbc);
  const dailyLimitReached = reachedDailyLimit(activeSbc);
  const selectionIssues = getSelectionIssues(activeSbc, chosen, chosenCards);
  const canDeliver = !!activeSbc
    && !historyLoading
    && !historyError
    && !completedOnce
    && !dailyLimitReached
    && completingSbcId === null
    && selectionIssues.length === 0;
  const requiredSlots = requiredPositions(activeSbc);
  const slotCards: (PlayerCard | null)[] = Array.from({ length: activeSbc.requirements.count }, () => null);
  chosenCards.forEach(card => {
    const matchingSlot = requiredSlots
      ? requiredSlots.findIndex((position, index) => position === card.position && slotCards[index] === null)
      : slotCards.findIndex(slot => slot === null);
    const fallbackSlot = matchingSlot < 0 ? slotCards.findIndex(slot => slot === null) : matchingSlot;
    if (fallbackSlot >= 0) slotCards[fallbackSlot] = card;
  });
  const rewardPackId = activeSbc.reward.type === 'pack' ? String(activeSbc.reward.value) : null;
  const rewardPack = rewardPackId ? packConfigs.find(pack => pack.id === rewardPackId) : undefined;
  const rewardName = rewardPack?.name
    ?? (activeSbc.reward.type === 'coins'
      ? `${Number(activeSbc.reward.value).toLocaleString('pt-BR')} moedas`
      : String(activeSbc.reward.value));
  const rewardDescription = rewardPack?.description
    ?? (activeSbc.reward.type === 'coins' ? 'Moedas creditadas ao concluir o desafio.' : 'Recompensa definida para este desafio.');
  const completionMessage = chosenCards
    .map(card => `${card.name} · OVR ${card.overall} · ${RARITY_META[card.rarity]?.label ?? card.rarity}`)
    .join('  |  ');
  const minOverallMet = !!activeSbc.requirements.minOverall
    && chosenCards.length === activeSbc.requirements.count
    && chosenCards.every(card => card.overall >= activeSbc.requirements.minOverall!);
  const clubRequirementMet = !!activeSbc.requirements.sameClub
    && chosenCards.length === activeSbc.requirements.count
    && new Set(chosenCards.map(card => card.club)).size === 1;
  const positionRequirementMet = !!requiredSlots
    && chosenCards.length === activeSbc.requirements.count
    && getRequirementIssues(activeSbc, chosenCards, chosen).every(issue => !issue.includes('posições'));
  const rarityRequirementMet = !!activeSbc.requirements.rarity
    && chosenCards.length === activeSbc.requirements.count
    && chosenCards.every(card => card.rarity === activeSbc.requirements.rarity);
  const filledProgress = Math.min(100, (chosen.length / activeSbc.requirements.count) * 100);
  const completionCountToday = getCompletionsToday(activeSbc.id);
  const completionThisSession = completedNotice === activeSbc.id;
  const oneTimeCompletion = !activeSbc.repeatable && completedOnce;

  return (
    <div className="sbc-page">
      <header className="sbc-page__header">
        <div>
          <span>FUTSENAI · MODO DE ELENCO</span>
          <h1>DESAFIOS DE ELENCO</h1>
          <p>Monte seu elenco, complete os requisitos e conquiste recompensas.</p>
        </div>
        <div className="sbc-page__header-mark" aria-hidden="true">
          <span>SBC</span>
          <ShieldCheck />
        </div>
      </header>

      <section className="sbc-categories" aria-label="Categorias de desafios">
        <div className="sbc-section-kicker"><span>01</span> DESAFIOS DISPONÍVEIS</div>
        <div className="sbc-category-list" role="tablist" aria-label="Desafios disponíveis">
          {sbcs.map(sbc => {
            const isActive = sbc.id === activeSbc.id;
            const ids = selected[sbc.id] ?? [];
            const status = getSbcStatus(sbc);
            const progress = Math.min(100, (ids.length / sbc.requirements.count) * 100);
            const tabReward = sbc.reward.type === 'pack'
              ? packConfigs.find(pack => pack.id === String(sbc.reward.value))?.name ?? String(sbc.reward.value)
              : `${Number(sbc.reward.value).toLocaleString('pt-BR')} moedas`;
            return (
              <button
                key={sbc.id}
                id={`sbc-tab-${sbc.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`sbc-panel-${sbc.id}`}
                aria-label={`${sbc.title}, ${ids.length} de ${sbc.requirements.count} cartas, ${status}, recompensa ${tabReward}`}
                onClick={() => {
                  setActiveSbcId(sbc.id);
                  setSearch('');
                  setPositionFilter('all');
                  setRarityFilter('all');
                  setMinimumOverall('0');
                  setClubFilter('all');
                  setPage(0);
                }}
                className={`sbc-category ${isActive ? 'is-active' : ''}`}
              >
                <span className="sbc-category__topline">
                  <span>{sbc.title}</span>
                  {status === 'Concluído' ? <CheckCircle2 aria-label="Concluído" /> : <Sparkles aria-hidden="true" />}
                </span>
                <span className="sbc-category__progress">{ids.length}<span>/{sbc.requirements.count} cartas</span></span>
                <span className="sbc-category__bar"><i style={{ width: `${progress}%` }} /></span>
                <span className="sbc-category__bottomline">
                  <span>{status}</span>
                  <span>{tabReward}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section
        id={`sbc-panel-${activeSbc.id}`}
        className="sbc-challenge-panel"
        role="tabpanel"
        aria-labelledby={`sbc-tab-${activeSbc.id}`}
      >
        <div className="sbc-challenge-panel__copy">
          <div className="sbc-section-kicker"><span>02</span> DESAFIO ATIVO</div>
          <h2>{activeSbc.title}</h2>
          <p>{activeSbc.description}</p>
          <div className="sbc-challenge-panel__meta">
            <span>{activeSbc.repeatable ? 'REPETÍVEL' : 'ÚNICA CONCLUSÃO'}</span>
            {(activeSbc.id === 'sbc2' || activeSbc.id === 'sbc3') && <span>LIMITE: 3 CONCLUSÕES POR DIA</span>}
          </div>
        </div>

        <div className="sbc-reward-card">
          <div className="sbc-reward-card__art">
            {rewardPackId && PACK_ART[rewardPackId]
              ? <img src={PACK_ART[rewardPackId]} alt={`Arte da recompensa ${rewardName}`} />
              : activeSbc.reward.type === 'coins'
                ? <Coins aria-hidden="true" />
                : <PackageOpen aria-hidden="true" />}
          </div>
          <div className="sbc-reward-card__copy">
            <span>RECOMPENSA</span>
            <strong>{rewardName}</strong>
            <p>{rewardDescription}</p>
          </div>
        </div>

        <div className="sbc-challenge-panel__progress">
          <div><span>PROGRESSO DO DESAFIO</span><strong>{chosen.length}<small>/{activeSbc.requirements.count}</small></strong></div>
          <div className="sbc-progress-track"><i style={{ width: `${filledProgress}%` }} /></div>
        </div>

        {historyLoading && <div className="sbc-history-notice" role="status">Verificando seu histórico de conclusões...</div>}
        {historyError && <div className="sbc-history-notice is-error" role="alert">{historyError}</div>}
        {oneTimeCompletion && (
          <div className="sbc-success-banner" role="status">
            <CheckCircle2 aria-hidden="true" />
            <span>Desafio concluído anteriormente. A conclusão única já está registrada.</span>
          </div>
        )}
        {completionThisSession && (
          <div className="sbc-success-banner sbc-success-banner--animated" role="status">
            <CheckCircle2 aria-hidden="true" />
            <span>Desafio concluído! A recompensa foi processada pelo sistema.</span>
          </div>
        )}
      </section>

      <div className="sbc-workspace">
        <section className="sbc-selection-panel" aria-label="Sua seleção">
          <div className="sbc-panel-heading">
            <div>
              <div className="sbc-section-kicker"><span>03</span> MONTAGEM</div>
              <h2>SUA SELEÇÃO</h2>
              <p>Escolha cartas do seu inventário para preencher os espaços.</p>
            </div>
            <span className={`sbc-selection-count ${canDeliver ? 'is-ready' : ''}`}>
              {chosen.length}<small>/{activeSbc.requirements.count}</small>
            </span>
          </div>

          <div className={`sbc-slot-grid ${activeSbc.requirements.count > 4 ? 'has-five-slots' : ''}`}>
            {slotCards.map((card, index) => {
              const requiredPosition = requiredSlots?.[index];
              return (
                <div key={`${activeSbc.id}-slot-${index}`} className={`sbc-slot ${card ? 'is-filled' : ''}`}>
                  <div className="sbc-slot__label">
                    <span>{requiredPosition ? positionLabel(requiredPosition) : `CARTA ${index + 1}`}</span>
                    <small>{card ? 'SELECIONADA' : 'ESPAÇO LIVRE'}</small>
                  </div>
                  {card ? (
                    <>
                      <div className="sbc-slot__art"><Card card={card} size="fluid" animateHover={false} /></div>
                      <div className="sbc-slot__details">
                        <strong>{card.name}</strong>
                        <span>OVR {card.overall} · {RARITY_META[card.rarity]?.label ?? card.rarity}</span>
                      </div>
                      <button
                        type="button"
                        className="sbc-slot__remove"
                        aria-label={`Remover ${card.name} da seleção`}
                        onClick={() => toggle(activeSbc, card.uid)}
                      >
                        <X aria-hidden="true" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="sbc-slot__empty"
                      onClick={() => document.getElementById('sbc-inventory-search')?.focus()}
                      aria-label={`Espaço vazio ${index + 1}${requiredPosition ? `, requer ${positionLabel(requiredPosition)}` : ''}`}
                    >
                      <span className="sbc-slot__empty-icon">+</span>
                      <span>{requiredPosition ? `Requer ${positionLabel(requiredPosition)}` : 'Adicionar carta'}</span>
                      {activeSbc.requirements.minOverall && <small>OVR ≥ {activeSbc.requirements.minOverall}</small>}
                      {activeSbc.requirements.rarity && <small>{RARITY_META[activeSbc.requirements.rarity as Rarity]?.label ?? activeSbc.requirements.rarity}</small>}
                      {activeSbc.requirements.sameClub && <small>Mesmo clube</small>}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="sbc-selection-footer">
            <span><ShieldCheck aria-hidden="true" /> Cartas selecionadas são verificadas antes da entrega.</span>
            {activeSbc.requirements.sameClub && chosenCards.length > 0 && (
              <span className={new Set(chosenCards.map(card => card.club)).size === 1 ? 'is-met' : 'is-missing'}>
                Clube: {new Set(chosenCards.map(card => card.club)).size === 1 ? chosenCards[0].club : 'selecione cartas do mesmo clube'}
              </span>
            )}
          </div>
        </section>

        <aside className="sbc-requirements-panel" aria-label="Requisitos e progresso">
          <div className="sbc-panel-heading">
            <div>
              <div className="sbc-section-kicker"><span>04</span> OBJETIVOS</div>
              <h2>REQUISITOS</h2>
            </div>
            {canDeliver ? <CheckCircle2 className="sbc-requirements-panel__ready" aria-label="Requisitos cumpridos" /> : <AlertCircle className="sbc-requirements-panel__pending" aria-label="Requisitos pendentes" />}
          </div>

          <RequirementRow
            label="Cartas necessárias"
            value={`${chosen.length} / ${activeSbc.requirements.count}`}
            complete={chosen.length === activeSbc.requirements.count}
            detail="Quantidade exata para concluir"
          />
          {activeSbc.requirements.minOverall && (
            <RequirementRow
              label="Overall mínimo"
              value={`OVR ${activeSbc.requirements.minOverall}`}
              complete={minOverallMet}
              invalid={chosenCards.some(card => card.overall < activeSbc.requirements.minOverall!)}
              detail={chosenCards.length ? `${chosenCards.filter(card => card.overall >= activeSbc.requirements.minOverall!).length}/${chosenCards.length} cartas atendem` : 'Ainda sem cartas selecionadas'}
            />
          )}
          {activeSbc.requirements.rarity && (
            <RequirementRow
              label="Raridade exigida"
              value={RARITY_META[activeSbc.requirements.rarity as Rarity]?.label ?? activeSbc.requirements.rarity}
              complete={rarityRequirementMet}
              invalid={chosenCards.some(card => card.rarity !== activeSbc.requirements.rarity)}
              detail="Todas as cartas devem corresponder"
            />
          )}
          {requiredSlots && (
            <RequirementRow
              label="Posições exigidas"
              value={positionRequirementMet ? `${activeSbc.requirements.count}/${activeSbc.requirements.count}` : 'Pendente'}
              complete={positionRequirementMet}
              invalid={chosenCards.length === activeSbc.requirements.count && !positionRequirementMet}
              detail={requiredSlots.map(positionLabel).join(' · ')}
            />
          )}
          {activeSbc.requirements.sameClub && (
            <RequirementRow
              label="Mesmo clube"
              value={clubRequirementMet ? chosenCards[0]?.club ?? 'Cumprido' : 'Ainda não cumprido'}
              complete={clubRequirementMet}
              invalid={new Set(chosenCards.map(card => card.club)).size > 1}
              detail={chosenCards.length ? `${new Set(chosenCards.map(card => card.club)).size} clube(s) selecionado(s)` : 'Todas as cartas devem ser do mesmo clube'}
            />
          )}

          <div className="sbc-validation-list" aria-live="polite">
            {selectionIssues.length > 0
              ? selectionIssues.slice(0, 3).map(issue => <span key={issue}><AlertCircle aria-hidden="true" />{issue}</span>)
              : canDeliver
                ? <span className="is-met"><CheckCircle2 aria-hidden="true" />Todos os requisitos foram cumpridos.</span>
                : <span><AlertCircle aria-hidden="true" />Complete os requisitos para liberar a entrega.</span>}
            {dailyLimitReached && <span><AlertCircle aria-hidden="true" />Limite diário de conclusões atingido.</span>}
            {completedOnce && <span><CheckCircle2 aria-hidden="true" />Este desafio não pode ser repetido.</span>}
            {historyError && <span><AlertCircle aria-hidden="true" />O histórico não foi confirmado; entrega bloqueada.</span>}
          </div>
          {(activeSbc.id === 'sbc2' || activeSbc.id === 'sbc3') && (
            <div className="sbc-daily-count">Conclusões hoje: {completionCountToday}/3</div>
          )}
        </aside>
      </div>

      <section className="sbc-inventory" aria-label="Minhas cartas">
        <div className="sbc-inventory__heading">
          <div>
            <div className="sbc-section-kicker"><span>05</span> INVENTÁRIO</div>
            <h2>MINHAS CARTAS</h2>
            <p>Cartas incompatíveis continuam visíveis com o motivo da restrição.</p>
          </div>
          <div className="sbc-inventory__count">
            {filteredCards.length} {filteredCards.length === 1 ? 'CARTA' : 'CARTAS'}
          </div>
        </div>

        <div className="sbc-inventory-filters">
          <label className="sbc-search">
            <Search aria-hidden="true" />
            <input
              id="sbc-inventory-search"
              type="search"
              value={search}
              onChange={event => {
                setSearch(event.target.value);
                setPage(0);
              }}
              placeholder="Buscar por jogador, clube, posição ou raridade"
              aria-label="Buscar cartas"
            />
          </label>
          <label>
            <span>POSIÇÃO</span>
            <select
              aria-label="Filtrar por posição"
              value={positionFilter}
              onChange={event => {
                setPositionFilter(event.target.value as Position | 'all');
                setPage(0);
              }}
            >
              <option value="all">Todas</option>
              {POSITION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span>RARIDADE</span>
            <select
              aria-label="Filtrar por raridade"
              value={rarityFilter}
              onChange={event => {
                setRarityFilter(event.target.value as Rarity | 'all');
                setPage(0);
              }}
            >
              <option value="all">Todas</option>
              {RARITY_ORDER.map(rarity => <option key={rarity} value={rarity}>{RARITY_META[rarity].label}</option>)}
            </select>
          </label>
          <label>
            <span>OVERALL MÍNIMO</span>
            <input
              type="number"
              min="0"
              max="99"
              value={minimumOverall}
              onChange={event => {
                setMinimumOverall(event.target.value);
                setPage(0);
              }}
              aria-label="Filtrar por overall mínimo"
            />
          </label>
          <label>
            <span>CLUBE</span>
            <select
              aria-label="Filtrar por clube"
              value={clubFilter}
              onChange={event => {
                setClubFilter(event.target.value);
                setPage(0);
              }}
            >
              <option value="all">Todos</option>
              {clubs.map(club => <option key={club} value={club}>{club}</option>)}
            </select>
          </label>
        </div>

        <div className="sbc-inventory-grid">
          {visibleCards.map(card => {
            const isSelected = chosen.includes(card.uid);
            const existingCards = chosenCards.filter(selectedCard => selectedCard.uid !== card.uid);
            const restriction = activeSbc ? getCardRestriction(card, activeSbc, existingCards) : null;
            return (
              <div
                key={card.uid}
                className={`sbc-inventory-card ${isSelected ? 'is-selected' : ''} ${restriction && !isSelected ? 'is-unavailable' : ''}`}
              >
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${isSelected ? 'Remover' : restriction ? 'Indisponível' : 'Selecionar'} ${card.name}, overall ${card.overall}${restriction && !isSelected ? `: ${restriction}` : ''}`}
                  title={restriction && !isSelected ? restriction : `${card.name} · OVR ${card.overall}`}
                  disabled={!isSelected && !!restriction}
                  onClick={() => activeSbc && toggle(activeSbc, card.uid)}
                >
                  <Card card={card} size="fluid" animateHover={false} />
                  {isSelected && <span className="sbc-inventory-card__selected"><CheckCircle2 aria-hidden="true" /> NA SELEÇÃO</span>}
                  {!isSelected && restriction && <span className="sbc-inventory-card__lock">INDISPONÍVEL</span>}
                  {!isSelected && !restriction && <span className="sbc-inventory-card__add">ADICIONAR</span>}
                </button>
                {restriction && !isSelected && <span className="sbc-inventory-card__reason">{restriction}</span>}
              </div>
            );
          })}
          {visibleCards.length === 0 && (
            <div className="sbc-inventory-empty">
              <Search aria-hidden="true" />
              <span>Nenhuma carta corresponde aos filtros atuais.</span>
            </div>
          )}
        </div>

        <div className="sbc-inventory__footer">
          <span>
            {chosen.length} de {activeSbc.requirements.count} selecionadas
            <small> · Mostrando {filteredCards.length === 0 ? 0 : currentPage * CARDS_PER_PAGE + 1}–{Math.min((currentPage + 1) * CARDS_PER_PAGE, filteredCards.length)} de {filteredCards.length}</small>
          </span>
          <div className="sbc-pagination">
            <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0} aria-label="Página anterior">
              <ChevronLeft aria-hidden="true" /> Anterior
            </button>
            <span>{currentPage + 1}/{pageCount}</span>
            <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount - 1} aria-label="Próxima página">
              Próxima <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      <div className={`sbc-submit-bar ${canDeliver ? 'is-ready' : ''}`}>
        <div>
          {canDeliver ? <CheckCircle2 aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
          <span>
            <strong>{canDeliver ? 'Desafio pronto para entrega' : 'Desafio ainda incompleto'}</strong>
            <small>{canDeliver ? 'Confira as cartas selecionadas antes de confirmar.' : selectionIssues[0] ?? 'Selecione cartas compatíveis para continuar.'}</small>
          </span>
        </div>
        <button type="button" onClick={() => setConfirmOpen(true)} disabled={!canDeliver}>
          ENTREGAR DESAFIO <span aria-hidden="true">→</span>
        </button>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Confirmar entrega do desafio?"
        message={`As cartas abaixo serão consumidas permanentemente: ${completionMessage}.`}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void handleComplete();
        }}
        confirmLabel={completingSbcId === activeSbc.id ? 'Concluindo...' : 'Entregar desafio'}
        confirmVariant="danger"
        confirmDisabled={completingSbcId !== null}
      />
    </div>
  );
}

function RequirementRow({
  label,
  value,
  detail,
  complete,
  invalid = false,
}: {
  label: string;
  value: string;
  detail: string;
  complete: boolean;
  invalid?: boolean;
}) {
  return (
    <div className={`sbc-requirement ${complete ? 'is-complete' : ''} ${invalid ? 'is-invalid' : ''}`}>
      <span className="sbc-requirement__icon">
        {complete ? <CheckCircle2 aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
      </span>
      <span className="sbc-requirement__copy">
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <span className="sbc-requirement__value">{value}</span>
    </div>
  );
}
