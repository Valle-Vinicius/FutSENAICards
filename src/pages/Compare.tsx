import { useState, useMemo } from 'react';
import { useGame } from '../store/useGame';
import Card from '../components/Card';

const isGK = (p: string) => p === 'GK';

export default function Compare() {
  const cards = useGame(s => s.cards);
  const addHistory = useGame(s => s.addCompareHistory);
  const [aUid, setAUid] = useState<string | null>(null);
  const [bUid, setBUid] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<'a' | 'b' | null>(null);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('');
  const [rar, setRar] = useState('');
  const [sort, setSort] = useState('overall');

  const a = cards.find(c => c.uid === aUid) || null;
  const b = cards.find(c => c.uid === bUid) || null;

  const filtered = useMemo(() => {
    let list = cards.filter(c => {
      if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (pos && c.position !== pos) return false;
      if (rar && c.rarity !== rar) return false;
      return true;
    });
    list = list.sort((x,y) => sort === 'name' ? x.name.localeCompare(y.name) : y.overall - x.overall);
    return list;
  }, [cards, q, pos, rar, sort]);

  const pick = (uid: string) => {
    if (pickerFor === 'a') setAUid(uid);
    else if (pickerFor === 'b') setBUid(uid);
    setPickerFor(null);
    setQ(''); setPos(''); setRar('');
    if (pickerFor === 'a' && bUid) addHistory(uid, bUid);
    if (pickerFor === 'b' && aUid) addHistory(aUid, uid);
  };

  const swap = () => { const t = aUid; setAUid(bUid); setBUid(t); };
  const clear = () => { setAUid(null); setBUid(null); };

  const samePos = a && b && a.position === b.position;

  const lineAttrs = (c: any) => isGK(c.position)
    ? [{ k:'REF', v: c.reflexes ?? 0 }, { k:'POS', v: c.positioning ?? 0 }, { k:'HAN', v: c.handling ?? 0 }, { k:'PAC', v: c.pace }, { k:'DEF', v: c.defending }, { k:'FIS', v: c.physical }]
    : [{ k:'PAC', v: c.pace }, { k:'SHO', v: c.shooting }, { k:'PAS', v: c.passing }, { k:'DRI', v: c.dribbling }, { k:'DEF', v: c.defending }, { k:'PHY', v: c.physical }];

  const attrsA = a ? lineAttrs(a) : [];
  const attrsB = b ? lineAttrs(b) : [];

  // analysis
  const analysisLines: string[] = [];
  if (a && b) {
    if (a.overall > b.overall) analysisLines.push(`${a.name} possui maior overall (${a.overall} vs ${b.overall}).`);
    else if (b.overall > a.overall) analysisLines.push(`${b.name} possui maior overall (${b.overall} vs ${a.overall}).`);
    else analysisLines.push(`Ambos têm o mesmo overall (${a.overall}).`);
    // per attribute strengths
    attrsA.forEach((at, i) => {
      const va = at.v, vb = attrsB[i].v;
      if (va > vb) analysisLines.push(`${a.name} se destaca em ${at.k} (+${va - vb}).`);
      else if (vb > va) analysisLines.push(`${b.name} se destaca em ${at.k} (+${vb - va}).`);
    });
    // position suitability
    if (a.position === b.position) {
      analysisLines.push(`Ambos atuam na mesma posição (${a.position}), permitindo comparação direta.`);
    } else {
      analysisLines.push(`${a.name} é ${a.position}; ${b.name} é ${b.position}. Adequação depende da necessidade tática.`);
    }
    const strongA = attrsA.filter((at,i) => at.v > attrsB[i].v).map(x=>x.k);
    const strongB = attrsB.filter((at,i) => at.v > attrsA[i].v).map(x=>x.k);
    if (strongA.length) analysisLines.push(`Pontos fortes de ${a.name}: ${strongA.join(', ')}.`);
    if (strongB.length) analysisLines.push(`Pontos fortes de ${b.name}: ${strongB.join(', ')}.`);
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl md:text-3xl font-semibold text-[#252733]">Comparar jogadores</h1>
        <div className="flex gap-2">
          <button onClick={swap} disabled={!a || !b} className="px-3 py-1.5 rounded-xl bg-white border border-[#E9EAF0] text-[#252733] text-sm font-medium disabled:opacity-40">Inverter</button>
          <button onClick={clear} disabled={!a && !b} className="px-3 py-1.5 rounded-xl bg-white border border-[#E9EAF0] text-[#252733] text-sm font-medium disabled:opacity-40">Limpar</button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {(['a','b'] as const).map(side => {
          const c = side === 'a' ? a : b;
          return (
            <div key={side} className="card-surface p-4 flex flex-col items-center gap-3">
              <div className="text-sm font-semibold text-[#858A98]">Jogador {side.toUpperCase()}</div>
              {c ? (
                <>
                  <Card card={c} size="md" />
                  <button onClick={() => setPickerFor(side)} className="px-3 py-1.5 rounded-xl bg-white border border-[#E9EAF0] text-[#252733] text-sm font-medium">Substituir</button>
                  <button onClick={() => side === 'a' ? setAUid(null) : setBUid(null)} className="px-3 py-1.5 rounded-xl text-[#858A98] text-xs">Remover</button>
                </>
              ) : (
                <>
                  <div className="w-44 h-60 rounded-2xl border-2 border-dashed border-[#E9EAF0] flex items-center justify-center text-[#858A98] text-sm">
                    Nenhum jogador
                  </div>
                  <button onClick={() => setPickerFor(side)} className="px-4 py-2 rounded-xl bg-[#E30613] text-white text-sm font-medium">Selecionar jogador</button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {a && b && (
        <>
          <div className="card-surface p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-[#252733]">Comparação de atributos</h2>
              <div className="text-sm text-[#858A98]">
                Diferença de overall: <span className="font-bold text-[#E30613]">{Math.abs(a.overall - b.overall)}</span>
                {samePos && <span className="ml-2 text-xs">(mesma posição)</span>}
              </div>
            </div>
            <div className="space-y-3">
              {attrsA.map((at, i) => {
                const va = at.v, vb = attrsB[i].v;
                const leftBetter = va > vb, rightBetter = vb > va;
                return (
                  <div key={at.k}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-[#252733]">{a.name}: {va}</span>
                      <span className="text-[#858A98]">{at.k}</span>
                      <span className="font-medium text-[#252733]">{b.name}: {vb}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-[#E9EAF0] rounded-full overflow-hidden flex justify-end">
                        <div className="h-full rounded-full" style={{ width: `${(va/99)*100}%`, background: leftBetter ? '#E30613' : '#858A98' }} />
                      </div>
                      <div className="text-[10px] text-[#858A98] w-8 text-center">{va - vb > 0 ? `+${va-vb}` : va-vb}</div>
                      <div className="flex-1 h-2 bg-[#E9EAF0] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(vb/99)*100}%`, background: rightBetter ? '#E30613' : '#858A98' }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card-surface p-4">
            <h2 className="text-lg font-semibold text-[#252733] mb-2">Análise da comparação</h2>
            <ul className="space-y-1 text-sm text-[#252733]">
              {analysisLines.map((l, i) => <li key={i}>• {l}</li>)}
            </ul>
            <p className="text-xs text-[#858A98] mt-3">
              A análise é calculada a partir dos atributos reais. Nenhum jogador é absolutamente melhor em todas as situações.
            </p>
          </div>
        </>
      )}

      {!a && !b && (
        <div className="card-surface p-6 text-center text-[#858A98]">
          Selecione dois jogadores para comparar seus atributos.
        </div>
      )}

      {/* Picker modal */}
      {pickerFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setPickerFor(null)}>
          <div className="card-surface w-full max-w-2xl max-h-[80vh] overflow-auto p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-[#252733]">Selecionar jogador {pickerFor.toUpperCase()}</h3>
              <button onClick={() => setPickerFor(null)} className="text-[#858A98]">✕</button>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar..." className="flex-1 min-w-[140px] bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm" />
              <select value={pos} onChange={e=>setPos(e.target.value)} className="bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm">
                <option value="">Posição</option>
                {[...new Set(cards.map(c=>c.position))].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={rar} onChange={e=>setRar(e.target.value)} className="bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm">
                <option value="">Raridade</option>
                {['common','uncommon','rare','epic','legendary','icon'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={sort} onChange={e=>setSort(e.target.value)} className="bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm">
                <option value="overall">Overall</option>
                <option value="name">Nome</option>
              </select>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map(c => (
                <div key={c.uid} onClick={() => pick(c.uid)} className="cursor-pointer hover:scale-105 transition">
                  <Card card={c} size="sm" />
                </div>
              ))}
            </div>
            {filtered.length === 0 && <div className="text-center text-[#858A98] py-6">Nenhuma carta.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
