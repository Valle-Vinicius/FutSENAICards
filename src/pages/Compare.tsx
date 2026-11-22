import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowLeftRight, X } from 'lucide-react';
import type { ReactNode } from 'react';
import Card from '../components/Card';
import { RARITY_META, RARITY_ORDER, type PlayerCard } from '../types';
import { normalizeSearch } from '../lib/text';
import { useGame } from '../store/useGame';

const LINE_ATTRIBUTES = [
  { key: 'pace', label: 'Velocidade' },
  { key: 'shooting', label: 'Chute' },
  { key: 'passing', label: 'Passe' },
  { key: 'dribbling', label: 'Drible' },
  { key: 'defending', label: 'Defesa' },
  { key: 'physical', label: 'Físico' },
] as const;
const GOALKEEPER_ATTRIBUTES = [
  { key: 'reflexes', label: 'Reflexos' },
  { key: 'positioning', label: 'Posicionamento' },
  { key: 'handling', label: 'Manuseio' },
  { key: 'pace', label: 'Velocidade' },
  { key: 'defending', label: 'Defesa' },
  { key: 'physical', label: 'Físico' },
] as const;
const SHARED_ATTRIBUTES = [
  { key: 'pace', label: 'Velocidade' },
  { key: 'defending', label: 'Defesa' },
  { key: 'physical', label: 'Físico' },
] as const;

type AttributeKey = typeof LINE_ATTRIBUTES[number]['key']
  | typeof GOALKEEPER_ATTRIBUTES[number]['key'];
type ComparisonAttribute = { key: AttributeKey; label: string; a: number; b: number };
type CompareSide = 'a' | 'b';
const PICKER_PAGE_SIZE = 30;

function CardName({ card, showRarity }: { card: PlayerCard; showRarity: boolean }) {
  const rarity = RARITY_META[card.rarity];
  const hasColor = showRarity && card.rarity !== 'icon';
  return (
    <span
      className={`${showRarity ? 'font-semibold' : ''} ${showRarity && card.rarity === 'icon' ? 'rgb-text' : ''}`}
      style={hasColor ? { color: card.rarity === 'secret' ? '#30343D' : rarity.color } : undefined}
    >
      {card.name}{showRarity ? ` (${rarity.label})` : ''}
    </span>
  );
}

function isGoalkeeper(card: PlayerCard) {
  return card.position === 'GK';
}

function attributeValue(card: PlayerCard, key: AttributeKey) {
  const value = card[key];
  return typeof value === 'number' ? value : 0;
}

function compareAttributes(a: PlayerCard, b: PlayerCard): ComparisonAttribute[] {
  const attributes = isGoalkeeper(a) !== isGoalkeeper(b)
    ? SHARED_ATTRIBUTES
    : isGoalkeeper(a) ? GOALKEEPER_ATTRIBUTES : LINE_ATTRIBUTES;
  return attributes.map(({ key, label }) => ({
    key,
    label,
    a: attributeValue(a, key),
    b: attributeValue(b, key),
  }));
}

function AttributeRows({ rows }: { rows: ComparisonAttribute[] }) {
  return (
    <div className="compare-attribute-rows">
      {rows.map(row => {
        const aWins = row.a > row.b;
        const bWins = row.b > row.a;
        const barWidthA = `${Math.min(100, Math.max(0, row.a)) / 99 * 100}%`;
        const barWidthB = `${Math.min(100, Math.max(0, row.b)) / 99 * 100}%`;
        return (
          <div key={row.key} className={`compare-attribute${aWins || bWins ? '' : ' compare-attribute--draw'}`}>
            <div className="compare-attribute__values">
              <span className={aWins ? 'compare-attribute__value compare-attribute__value--winner' : 'compare-attribute__value'}>{row.a}</span>
              <span className="compare-attribute__label">{row.label}</span>
              <span className={bWins ? 'compare-attribute__value compare-attribute__value--winner compare-attribute__value--right' : 'compare-attribute__value compare-attribute__value--right'}>{row.b}</span>
            </div>
            <div className="compare-attribute__bars" aria-hidden="true">
              <div className="compare-attribute__track compare-attribute__track--left">
                <span className={aWins ? 'compare-attribute__fill compare-attribute__fill--winner' : 'compare-attribute__fill'} style={{ width: barWidthA }} />
              </div>
              <div className="compare-attribute__track">
                <span className={bWins ? 'compare-attribute__fill compare-attribute__fill--winner' : 'compare-attribute__fill'} style={{ width: barWidthB }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Compare() {
  const location = useLocation();
  const cards = useGame(s => s.cards);
  const compareHistory = useGame(s => s.compareHistory);
  const addHistory = useGame(s => s.addCompareHistory);
  const [aUid, setAUid] = useState<string | null>(() => new URLSearchParams(location.search).get('a'));
  const [bUid, setBUid] = useState<string | null>(() => {
    const params = new URLSearchParams(location.search);
    const requestedAUid = params.get('a');
    const requestedBUid = params.get('b');
    return requestedAUid === requestedBUid ? null : requestedBUid;
  });
  const [pickerFor, setPickerFor] = useState<CompareSide | null>(null);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('');
  const [rar, setRar] = useState('');
  const [sort, setSort] = useState<'overall' | 'name'>('overall');
  const [visiblePickerCardCount, setVisiblePickerCardCount] = useState(PICKER_PAGE_SIZE);
  const aPickerButton = useRef<HTMLButtonElement>(null);
  const bPickerButton = useRef<HTMLButtonElement>(null);
  const pickerTrigger = useRef<HTMLButtonElement | null>(null);
  const pickerSearch = useRef<HTMLInputElement>(null);

  const closePicker = useCallback(() => {
    setPickerFor(null);
    setQ('');
    setPos('');
    setRar('');
    setVisiblePickerCardCount(PICKER_PAGE_SIZE);
    window.setTimeout(() => pickerTrigger.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!pickerFor) return;
    const focusSearch = window.setTimeout(() => pickerSearch.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePicker();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusSearch);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pickerFor, closePicker]);

  const a = cards.find(card => card.uid === aUid) || null;
  const b = cards.find(card => card.uid === bUid) || null;
  const showRarity = Boolean(a && b && a.rarity !== b.rarity
    && (a.playerId === b.playerId || normalizeSearch(a.name) === normalizeSearch(b.name)));
  const differentPositions = Boolean(a && b && a.position !== b.position);
  const mixedGoalkeeperMatch = Boolean(a && b && isGoalkeeper(a) !== isGoalkeeper(b));
  const attributes = a && b ? compareAttributes(a, b) : [];
  const aWins = attributes.filter(attribute => attribute.a > attribute.b).length;
  const bWins = attributes.filter(attribute => attribute.b > attribute.a).length;
  const higherOverall = a && b
    ? a.overall > b.overall ? a : b.overall > a.overall ? b : null
    : null;

  useEffect(() => {
    if (a && b) addHistory(a.uid, b.uid);
  }, [a, b, addHistory]);

  const filtered = useMemo(() => {
    if (!pickerFor) return [];
    const query = normalizeSearch(q.trim());
    return cards.filter(card => {
      if (pos && card.position !== pos) return false;
      if (rar && card.rarity !== rar) return false;
      if (!query) return true;
      return [card.name, card.club, card.position, RARITY_META[card.rarity]?.label]
        .some(value => normalizeSearch(String(value ?? '')).includes(query));
    }).sort((left, right) => sort === 'name'
      ? left.name.localeCompare(right.name)
      : right.overall - left.overall);
  }, [cards, pickerFor, q, pos, rar, sort]);
  const visiblePickerCards = filtered.slice(0, visiblePickerCardCount);

  const visibleHistory = compareHistory.flatMap(entry => {
    const left = cards.find(card => card.uid === entry.aUid);
    const right = cards.find(card => card.uid === entry.bUid);
    return left && right ? [{ ...entry, left, right }] : [];
  }).slice(0, 5);

  const openPicker = (side: CompareSide) => {
    pickerTrigger.current = side === 'a' ? aPickerButton.current : bPickerButton.current;
    setQ('');
    setPos('');
    setRar('');
    setVisiblePickerCardCount(PICKER_PAGE_SIZE);
    setPickerFor(side);
  };

  const pick = (uid: string) => {
    if (uid === (pickerFor === 'a' ? bUid : aUid)) return;
    const nextAUid = pickerFor === 'a' ? uid : aUid;
    const nextBUid = pickerFor === 'b' ? uid : bUid;
    setAUid(nextAUid);
    setBUid(nextBUid);
    closePicker();
  };

  const clearSide = (side: CompareSide) => {
    if (side === 'a') setAUid(null);
    else setBUid(null);
  };

  const restoreHistory = (leftUid: string, rightUid: string) => {
    setAUid(leftUid);
    setBUid(rightUid);
  };

  const analysis: ReactNode[] = [];
  if (a && b && attributes.length > 0) {
    if (higherOverall) {
      const lower = higherOverall.uid === a.uid ? b : a;
      const difference = Math.abs(a.overall - b.overall);
      analysis.push(
        <>
          <CardName card={higherOverall} showRarity={showRarity} /> tem overall {difference} {difference === 1 ? 'ponto' : 'pontos'} maior que <CardName card={lower} showRarity={showRarity} /> ({higherOverall.overall} contra {lower.overall}).
        </>,
      );
    } else {
      analysis.push(<>As duas cartas têm o mesmo overall: {a.overall}.</>);
    }

    const bestA = attributes.filter(attribute => attribute.a > attribute.b)
      .sort((left, right) => (right.a - right.b) - (left.a - left.b))[0];
    const bestB = attributes.filter(attribute => attribute.b > attribute.a)
      .sort((left, right) => (right.b - right.a) - (left.b - left.a))[0];
    if (bestA && bestB) {
      analysis.push(
        <>
          <CardName card={a} showRarity={showRarity} /> tem sua maior vantagem em {bestA.label} (+{bestA.a - bestA.b}); <CardName card={b} showRarity={showRarity} /> em {bestB.label} (+{bestB.b - bestB.a}).
        </>,
      );
    } else if (bestA) {
      analysis.push(<>A maior vantagem é de <CardName card={a} showRarity={showRarity} /> em {bestA.label} (+{bestA.a - bestA.b}).</>);
    } else if (bestB) {
      analysis.push(<>A maior vantagem é de <CardName card={b} showRarity={showRarity} /> em {bestB.label} (+{bestB.b - bestB.a}).</>);
    } else {
      analysis.push(<>Os atributos comparados estão empatados.</>);
    }

    if (mixedGoalkeeperMatch) {
      const goalkeeper = a.position === 'GK' ? a : b;
      const fieldPlayer = a.position === 'GK' ? b : a;
      analysis.push(
        <>
          <CardName card={goalkeeper} showRarity={showRarity} /> é goleiro e <CardName card={fieldPlayer} showRarity={showRarity} /> joga na linha; só são comparados VEL, DEF e FIS.
        </>,
      );
    } else if (differentPositions) {
      analysis.push(
        <>
          <CardName card={a} showRarity={showRarity} /> atua como {a.position} e <CardName card={b} showRarity={showRarity} /> como {b.position}; a escolha também depende da posição necessária.
        </>,
      );
    } else {
      analysis.push(<>As duas cartas atuam como {a.position}; a comparação usa os seis atributos da posição.</>);
    }
  }

  return (
    <main className="compare-page">
      <div className="compare-page__inner">
        <header className="compare-header">
          <div>
            <p className="compare-eyebrow"><span aria-hidden="true" /> FUTSENAI · DUELO DE ATLETAS</p>
            <h1>Comparar jogadores</h1>
            <p className="compare-header__intro">Compare atributos, desempenho e vantagens entre dois atletas.</p>
          </div>
          {a && b && (
            <button
              type="button"
              onClick={() => { setAUid(b.uid); setBUid(a.uid); }}
              className="compare-swap"
            >
              <ArrowLeftRight aria-hidden="true" /> Inverter confronto
            </button>
          )}
        </header>

        <section className="compare-duel" aria-label="Confronto entre jogadores">
          {(['a', 'b'] as const).map(side => {
            const card = side === 'a' ? a : b;
            const triggerRef = side === 'a' ? aPickerButton : bPickerButton;
            return (
              <article key={side} className={`compare-side compare-side--${side}`}>
                <p className="compare-side__label">JOGADOR {side.toUpperCase()}</p>
                <div className="compare-side__card">
                  {card ? (
                    <>
                      <div className="compare-card-frame">
                        <Card card={card} size="sm" />
                      </div>
                      <button
                        type="button"
                        aria-label={`Remover ${card.name}`}
                        onClick={() => clearSide(side)}
                        className="compare-side__clear"
                      >
                        <X aria-hidden="true" />
                      </button>
                    </>
                  ) : (
                    <div className="compare-side__empty">
                      <span aria-hidden="true">{side.toUpperCase()}</span>
                      <strong>Nenhum jogador</strong>
                      <small>Escolha um atleta para o confronto</small>
                    </div>
                  )}
                </div>
                {card && (
                  <div className="compare-side__identity">
                    <strong>{card.name}</strong>
                    <span>{card.position} <i aria-hidden="true">·</i> {card.overall} OVR <i aria-hidden="true">·</i> {RARITY_META[card.rarity].label}</span>
                  </div>
                )}
                <button
                  ref={triggerRef}
                  type="button"
                  onClick={() => openPicker(side)}
                  className="compare-side__select"
                >
                  {card ? 'Trocar jogador' : 'Selecionar jogador'}
                </button>
              </article>
            );
          })}
          <div className="compare-duel__versus" aria-label="contra">
            <span>VS</span>
          </div>
        </section>

        {a && b && (
          <>
            <section className="compare-attributes" aria-labelledby="compare-attributes-title">
              <p className="compare-eyebrow">DISPUTA ESTATÍSTICA</p>
              <h2 id="compare-attributes-title">Atributos em comparação</h2>
              {mixedGoalkeeperMatch && (
                <p role="status" className="compare-attributes__notice">
                  Goleiros e jogadores de linha só têm 3 atributos em comum.
                </p>
              )}
              <AttributeRows rows={attributes} />
            </section>

            <section role="status" className="compare-result">
              <div className="compare-result__lead">
                <p className="compare-eyebrow">VANTAGEM</p>
                <strong>
                  {aWins === bWins
                    ? 'Confronto equilibrado'
                    : <CardName card={aWins > bWins ? a : b} showRarity={showRarity} />}
                </strong>
                <p className="compare-result__sentence">
                  {aWins === bWins
                    ? aWins === 0
                      ? `Empate: os ${attributes.length} atributos estão iguais.`
                      : <>Empate em atributos: <CardName card={a} showRarity={showRarity} /> e <CardName card={b} showRarity={showRarity} /> vencem em {aWins} de {attributes.length} cada.</>
                    : <><CardName card={aWins > bWins ? a : b} showRarity={showRarity} /> vence em {Math.max(aWins, bWins)} de {attributes.length} atributos.</>}
                </p>
                <p className="compare-result__overall">
                  {higherOverall
                    ? <><CardName card={higherOverall} showRarity={showRarity} /> tem o maior overall ({higherOverall.overall}).</>
                    : `Os dois têm o mesmo overall (${a.overall}).`}
                </p>
              </div>
              <div className="compare-result__score" aria-label={`${aWins} vitórias para jogador A, ${bWins} vitórias para jogador B`}>
                <div className={aWins > bWins ? 'compare-result__score-side compare-result__score-side--winner' : 'compare-result__score-side'}>
                  <span>JOGADOR A</span><strong>{aWins}</strong><small>{aWins === 1 ? 'atributo' : 'atributos'}</small>
                </div>
                <div className="compare-result__draws">
                  <span>EMPATES</span><strong>{attributes.length - aWins - bWins}</strong>
                </div>
                <div className={bWins > aWins ? 'compare-result__score-side compare-result__score-side--winner' : 'compare-result__score-side'}>
                  <span>JOGADOR B</span><strong>{bWins}</strong><small>{bWins === 1 ? 'atributo' : 'atributos'}</small>
                </div>
              </div>
            </section>

            <section className="compare-analysis" aria-labelledby="compare-analysis-title">
              <p className="compare-eyebrow">LEITURA DO CONFRONTO</p>
              <h2 id="compare-analysis-title">Análise da comparação</h2>
              <ul>
                {analysis.map((sentence, index) => <li key={index}>{sentence}</li>)}
              </ul>
            </section>
          </>
        )}

        {visibleHistory.length > 0 && (
          <section className="compare-history" aria-labelledby="compare-history-title">
            <div className="compare-history__heading">
              <div><p className="compare-eyebrow">ÚLTIMOS DUELOS</p><h2 id="compare-history-title">Comparações recentes</h2></div>
              <span>{visibleHistory.length} recentes</span>
            </div>
            <div className="compare-history__list">
              {visibleHistory.map(entry => (
                <button
                  key={`${entry.aUid}:${entry.bUid}:${entry.at}`}
                  type="button"
                  onClick={() => restoreHistory(entry.aUid, entry.bUid)}
                  className="compare-history__item"
                >
                  <span>{entry.left.name}</span><b>×</b><span>{entry.right.name}</span>
                  <ArrowLeftRight aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        )}

        {!a && !b && (
          <p className="compare-empty-prompt">
            Selecione dois jogadores para comparar seus atributos.
          </p>
        )}

        {pickerFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closePicker}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="compare-picker-title"
              className="compare-picker card-surface max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto p-4"
            onClick={event => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="compare-picker-title" className="font-semibold text-[var(--text)]">
                Selecionar jogador {pickerFor.toUpperCase()}
              </h2>
              <button type="button" aria-label="Fechar seletor" onClick={closePicker} className="btn btn-ghost btn-sm">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              <input
                ref={pickerSearch}
                type="search"
                value={q}
                onChange={event => {
                  setVisiblePickerCardCount(PICKER_PAGE_SIZE);
                  setQ(event.target.value);
                }}
                placeholder="Buscar por nome ou clube..."
                aria-label="Buscar jogador"
                className="min-w-[160px] flex-1 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
              />
              <select value={pos} onChange={event => {
                setVisiblePickerCardCount(PICKER_PAGE_SIZE);
                setPos(event.target.value);
              }} aria-label="Filtrar posição" className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm">
                <option value="">Todas as posições</option>
                {[...new Set(cards.map(card => card.position))].map(position => (
                  <option key={position} value={position}>{position}</option>
                ))}
              </select>
              <select value={rar} onChange={event => {
                setVisiblePickerCardCount(PICKER_PAGE_SIZE);
                setRar(event.target.value);
              }} aria-label="Filtrar raridade" className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm">
                <option value="">Todas as raridades</option>
                {RARITY_ORDER.map(rarity => (
                  <option key={rarity} value={rarity}>{RARITY_META[rarity].label}</option>
                ))}
              </select>
              <select value={sort} onChange={event => {
                setVisiblePickerCardCount(PICKER_PAGE_SIZE);
                setSort(event.target.value as typeof sort);
              }} aria-label="Ordenar cartas" className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm">
                <option value="overall">Overall</option>
                <option value="name">Nome</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {visiblePickerCards.map(card => {
                const disabled = card.uid === (pickerFor === 'a' ? bUid : aUid);
                return (
                  <button
                    key={card.uid}
                    type="button"
                    disabled={disabled}
                    aria-label={`Selecionar ${card.name}${disabled ? ', já está do outro lado' : ''}`}
                    onClick={() => pick(card.uid)}
                    className="flex w-full min-w-0 justify-center rounded-2xl text-left transition enabled:hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Card card={card} size="sm" />
                  </button>
                );
              })}
            </div>
            {filtered.length === 0 && <div className="py-6 text-center text-[var(--muted)]">Nenhuma carta encontrada.</div>}
            {filtered.length > 0 && (
              <div className="compare-picker__pagination">
                <span>Exibindo {visiblePickerCards.length} de {filtered.length} cartas</span>
                {visiblePickerCards.length < filtered.length && (
                  <button
                    type="button"
                    onClick={() => setVisiblePickerCardCount(count => Math.min(count + PICKER_PAGE_SIZE, filtered.length))}
                  >
                    Carregar mais cartas
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      )}
      </div>
    </main>
  );
}
