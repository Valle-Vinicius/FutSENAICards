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
    <div className="space-y-3">
      {rows.map(row => {
        const aWins = row.a > row.b;
        const bWins = row.b > row.a;
        const barWidthA = `${Math.min(100, Math.max(0, row.a)) / 99 * 100}%`;
        const barWidthB = `${Math.min(100, Math.max(0, row.b)) / 99 * 100}%`;
        return (
          <div key={row.key} className="space-y-1">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <span className={`text-lg font-bold ${aWins ? 'text-[#E30613]' : 'text-[#252733]'}`}>{row.a}</span>
              <span className="text-center text-xs font-medium text-[#858A98]">{row.label}</span>
              <span className={`text-right text-lg font-bold ${bWins ? 'text-[#E30613]' : 'text-[#252733]'}`}>{row.b}</span>
            </div>
            <div className="grid grid-cols-2 gap-3" aria-hidden="true">
              <div className="flex h-2 justify-end overflow-hidden rounded-full bg-[#E9EAF0]">
                <div className="h-full rounded-full" style={{ width: barWidthA, backgroundColor: aWins ? '#E30613' : '#858A98' }} />
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#E9EAF0]">
                <div className="h-full rounded-full" style={{ width: barWidthB, backgroundColor: bWins ? '#E30613' : '#858A98' }} />
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
  const aPickerButton = useRef<HTMLButtonElement>(null);
  const bPickerButton = useRef<HTMLButtonElement>(null);
  const pickerTrigger = useRef<HTMLButtonElement | null>(null);
  const pickerSearch = useRef<HTMLInputElement>(null);

  const closePicker = useCallback(() => {
    setPickerFor(null);
    setQ('');
    setPos('');
    setRar('');
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
  }, [cards, q, pos, rar, sort]);

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
    <main className="mx-auto w-full max-w-4xl space-y-5 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-[#252733] md:text-3xl">Comparar jogadores</h1>
        {a && b && (
          <button
            type="button"
            onClick={() => { setAUid(b.uid); setBUid(a.uid); }}
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeftRight className="h-4 w-4" /> Inverter
          </button>
        )}
      </header>

      <section className="grid grid-cols-2 items-start gap-3 md:grid-cols-[minmax(144px,1fr)_minmax(300px,2fr)_minmax(144px,1fr)]">
        {(['a', 'b'] as const).map(side => {
          const card = side === 'a' ? a : b;
          const triggerRef = side === 'a' ? aPickerButton : bPickerButton;
          return (
            <div key={side} className={`flex min-w-0 flex-col items-center gap-2 ${side === 'a' ? 'md:col-start-1 md:row-start-1' : 'col-start-2 md:col-start-3 md:row-start-1'}`}>
              <h2 className="text-sm font-semibold text-[#858A98]">Jogador {side.toUpperCase()}</h2>
              <div className="relative min-w-0">
                {card ? (
                  <>
                    <Card card={card} size="sm" />
                    <button
                      type="button"
                      aria-label={`Remover ${card.name}`}
                      onClick={() => clearSide(side)}
                      className="absolute -right-2 -top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#858A98] shadow hover:text-[#E30613]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <div className="flex aspect-[7/10] w-36 max-w-full items-center justify-center rounded-2xl border-2 border-dashed border-[#E9EAF0] text-sm text-[#858A98]">
                    Nenhum jogador
                  </div>
                )}
              </div>
              <button
                ref={triggerRef}
                type="button"
                onClick={() => openPicker(side)}
                className="btn btn-secondary btn-sm w-36 justify-center"
              >
                {card ? 'Trocar' : 'Selecionar'}
              </button>
            </div>
          );
        })}

        {a && b && (
          <section className="card-surface col-span-2 space-y-3 p-4 md:col-span-1 md:col-start-2 md:row-start-1">
            <h2 className="text-center text-base font-semibold text-[#252733]">Atributos em comparação</h2>
            {mixedGoalkeeperMatch && (
              <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-900">
                Goleiros e jogadores de linha só têm 3 atributos em comum.
              </p>
            )}
            <AttributeRows rows={attributes} />
          </section>
        )}
      </section>

      {a && b && (
        <>
          <section role="status" className="card-surface p-4 text-center">
            <p className="font-semibold text-[#252733]">
              {aWins === bWins
                ? aWins === 0
                  ? `Empate: os ${attributes.length} atributos estão iguais.`
                  : <>Empate em atributos: <CardName card={a} showRarity={showRarity} /> e <CardName card={b} showRarity={showRarity} /> vencem em {aWins} de {attributes.length} cada.</>
                : <><CardName card={aWins > bWins ? a : b} showRarity={showRarity} /> vence em {Math.max(aWins, bWins)} de {attributes.length} atributos.</>}
            </p>
            <p className="mt-1 text-sm text-[#858A98]">
              {higherOverall
                ? <><CardName card={higherOverall} showRarity={showRarity} /> tem o maior overall ({higherOverall.overall}).</>
                : `Os dois têm o mesmo overall (${a.overall}).`}
            </p>
          </section>
          <section className="card-surface mx-auto max-w-prose p-4">
            <h2 className="mb-2 font-semibold text-[#252733]">Análise</h2>
            <ul className="space-y-1 text-sm text-[#252733]">
              {analysis.map((sentence, index) => <li key={index}>{sentence}</li>)}
            </ul>
          </section>
        </>
      )}

      {visibleHistory.length > 0 && (
        <section className="card-surface p-4">
          <h2 className="mb-2 font-semibold text-[#252733]">Comparações recentes</h2>
          <div className="flex flex-wrap gap-2">
            {visibleHistory.map(entry => (
              <button
                key={`${entry.aUid}:${entry.bUid}:${entry.at}`}
                type="button"
                onClick={() => restoreHistory(entry.aUid, entry.bUid)}
                className="btn btn-secondary btn-sm"
              >
                {entry.left.name} × {entry.right.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {!a && !b && (
        <div className="text-center text-sm text-[#858A98]">
          Selecione dois jogadores para comparar seus atributos.
        </div>
      )}

      {pickerFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closePicker}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="compare-picker-title"
            className="card-surface max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto p-4"
            onClick={event => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="compare-picker-title" className="font-semibold text-[#252733]">
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
                onChange={event => setQ(event.target.value)}
                placeholder="Buscar por nome ou clube..."
                aria-label="Buscar jogador"
                className="min-w-[160px] flex-1 rounded-xl border border-[#E9EAF0] bg-white px-3 py-2 text-sm"
              />
              <select value={pos} onChange={event => setPos(event.target.value)} aria-label="Filtrar posição" className="rounded-xl border border-[#E9EAF0] bg-white px-3 py-2 text-sm">
                <option value="">Todas as posições</option>
                {[...new Set(cards.map(card => card.position))].map(position => (
                  <option key={position} value={position}>{position}</option>
                ))}
              </select>
              <select value={rar} onChange={event => setRar(event.target.value)} aria-label="Filtrar raridade" className="rounded-xl border border-[#E9EAF0] bg-white px-3 py-2 text-sm">
                <option value="">Todas as raridades</option>
                {RARITY_ORDER.map(rarity => (
                  <option key={rarity} value={rarity}>{RARITY_META[rarity].label}</option>
                ))}
              </select>
              <select value={sort} onChange={event => setSort(event.target.value as typeof sort)} aria-label="Ordenar cartas" className="rounded-xl border border-[#E9EAF0] bg-white px-3 py-2 text-sm">
                <option value="overall">Overall</option>
                <option value="name">Nome</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {filtered.map(card => {
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
            {filtered.length === 0 && <div className="py-6 text-center text-[#858A98]">Nenhuma carta encontrada.</div>}
          </section>
        </div>
      )}
    </main>
  );
}
