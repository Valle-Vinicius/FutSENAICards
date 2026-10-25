import { useState } from 'react';
import { useGame } from '../store/useGame';
import Card from '../components/Card';
import { squadOverall } from '../store/useGame';
import { FORMATIONS_FUTSAL as FS } from '../lib/game';

const futsalFormations = Object.keys(FS);

export default function Squad() {
  const sport = 'futsal' as const;
  const squads = useGame(s => s.squads);
  const cards = useGame(s => s.cards);
  const savedSquads = useGame(s => s.savedSquads);
  const assign = useGame(s => s.assignSlot);
  const clear = useGame(s => s.clearSlot);
  const setFormation = useGame(s => s.setFormation);
  const saveSquad = useGame(s => s.saveSquad);
  const deleteSquad = useGame(s => s.deleteSquad);
  const loadSquad = useGame(s => s.loadSquad);
  const setPrimary = useGame(s => s.setPrimarySquad);
  const [selected, setSelected] = useState<string | null>(null);
  const [formation, setFormationState] = useState(squads[sport].formation);
  const [criteria, setCriteria] = useState<'overall'|'balance'|'position'>('overall');
  const [saveName, setSaveName] = useState('');
  const [msg, setMsg] = useState('');

  const formations = futsalFormations;
  const squad = squads[sport];
  const labels = { GK:'GOL', Fixo:'FIXO', Ala:'ALA', Pivo:'PIVÔ' };

  const handleFormation = (f: string) => {
    setFormationState(f);
    setFormation(sport, f);
  };

  const ovrs = squadOverall(squad, cards);

  const usedUids = new Set([...squad.starters.map(s=>s.uid), ...squad.bench].filter(Boolean) as string[]);
  const available = cards.filter(c => !usedUids.has(c.uid));

  const handleSlotClick = (index: number, bench: boolean, benchIndex?: number) => {
    if (bench) {
      if (selected) { assign(sport, index, selected, true, benchIndex); setSelected(null); }
      else if (benchIndex !== undefined && squad.bench[benchIndex]) { clear(sport, index, true, benchIndex); }
      return;
    }
    const slot = squad.starters[index];
    if (selected) {
      const card = cards.find(c => c.uid === selected);
      if (card && card.position !== slot.position) {
        if (!confirm('Posição inadequada. Deseja continuar?')) return;
      }
      assign(sport, index, selected, false);
      setSelected(null);
    } else if (slot.uid) {
      clear(sport, index, false);
    }
  };

  const autoBuild = () => {
    const allCards = [...cards];
    const slots = squad.starters.map(s => s.position);
    const assigned = new Set<string>();
    const newStartersUids: (string|null)[] = slots.map(() => null);
    for (let i = 0; i < slots.length; i++) {
      const pos = slots[i];
      let best: { uid: string; score: number } | null = null;
      for (const c of allCards) {
        if (assigned.has(c.uid)) continue;
        let score = 0;
        const posMatch = c.position === pos;
        if (posMatch) score += 1000;
        const balance = c.pace + c.shooting + c.passing + c.dribbling + c.defending + c.physical;
        if (criteria === 'overall') score += c.overall;
        else if (criteria === 'balance') score += Math.round(balance / 6);
        else score += posMatch ? 500 : 0;
        score += Math.round(c.overall / 10);
        if (!best || score > best.score) best = { uid: c.uid, score };
      }
      if (best) { newStartersUids[i] = best.uid; assigned.add(best.uid); }
    }
    newStartersUids.forEach((uid, i) => {
      if (uid) assign(sport, i, uid, false);
    });
    setMsg('Time montado automaticamente.');
    setTimeout(() => setMsg(''), 2000);
  };

  const handleSave = () => {
    if (!saveName.trim()) { alert('Informe um nome.'); return; }
    saveSquad(saveName.trim(), sport);
    setSaveName('');
    setMsg('Escalação salva.');
    setTimeout(() => setMsg(''), 2000);
  };

  const handleLoad = (id: string) => {
    loadSquad(id);
    const s = savedSquads.find(x => x.id === id);
    if (s) setFormationState(s.formation);
    setMsg('Escalação carregada.');
    setTimeout(() => setMsg(''), 2000);
  };

  const handleDuplicate = (s: any) => {
    saveSquad(s.name + ' (cópia)', s.sport);
  };

  const mySaved = savedSquads.filter(s => s.sport === sport);

  const filledCount = squad.starters.filter(s => s.uid).length;
  const attrs = squad.starters.map(s => {
    const c = s.uid ? cards.find(x => x.uid === s.uid) : null;
    return c ? (c.pace+c.shooting+c.passing+c.dribbling+c.defending+c.physical)/6 : 0;
  }).filter(v => v > 0);
  const avgAttr = attrs.length ? Math.round(attrs.reduce((a,b)=>a+b,0)/attrs.length) : 0;

  const outOfPosition = squad.starters.filter(s => {
    const c = s.uid ? cards.find(x => x.uid === s.uid) : null;
    return c && c.position !== s.position;
  }).length;

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (avgAttr >= 80) strengths.push('Média de atributos elevada.');
  if (outOfPosition === 0 && filledCount === squad.starters.length) strengths.push('Todos nas posições corretas.');
  if (filledCount < squad.starters.length) weaknesses.push('Elenco incompleto.');
  if (outOfPosition > 0) weaknesses.push(`${outOfPosition} jogador(es) fora de posição.`);
  if (avgAttr < 70 && filledCount > 0) weaknesses.push('Média de atributos baixa.');

  return (
    <div className="p-4 md:p-8 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl md:text-3xl font-semibold text-[#252733]">Montar elenco</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#858A98]">Formação:</span>
          <select value={formation} onChange={e => handleFormation(e.target.value)} className="bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm">
            {formations.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#858A98]">Critério:</span>
          <select value={criteria} onChange={e => setCriteria(e.target.value as any)} className="bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm">
            <option value="overall">Maior overall</option>
            <option value="balance">Melhor equilíbrio</option>
            <option value="position">Melhor adequação</option>
          </select>
          <button onClick={autoBuild} className="px-3 py-2 rounded-xl bg-[#E30613] text-white text-sm font-medium">Montar melhor time</button>
        </div>
        {msg && <span className="text-sm text-[#E30613]">{msg}</span>}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card-surface p-4">
          <div className="text-sm font-medium mb-3 text-[#858A98]">Campo</div>
          <div className="relative bg-gradient-to-b from-green-50 to-green-100 rounded-xl border-2 border-green-200 p-2">
            <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              {squad.starters.map((slot, i) => {
                const card = slot.uid ? cards.find(c => c.uid === slot.uid) : null;
                const outPos = card && card.position !== slot.position;
                return (
                <button key={i} onClick={() => handleSlotClick(i, false)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => { if (selected) handleSlotClick(i, false); }}
                  className={`rounded-xl border-2 flex flex-col items-center justify-center text-xs font-medium transition p-1 ${card ? (outPos ? 'border-yellow-400 bg-white' : 'border-[#E30613]/30 bg-white') : 'border-dashed border-[#E9EAF0] bg-white/60 hover:bg-white'}`}>
                    {card ? <Card card={card} size="md" /> : <span className="text-[#858A98]">{labels[slot.position] ?? slot.position}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xs text-[#858A98] mb-2">Reservas</div>
            <div className="flex gap-2 flex-wrap">
              {squad.bench.map((uid, i) => {
                const card = uid ? cards.find(c => c.uid === uid) : null;
                return (
                  <button key={i} onClick={() => handleSlotClick(0, true, i)}
                    className="w-32 h-44 rounded-xl border-2 border-dashed border-[#E9EAF0] bg-white flex items-center justify-center text-xs">
                    {card ? <Card card={card} size="sm" /> : <span className="text-[#858A98]">+</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card-surface p-4">
            <div className="text-sm font-medium mb-3 text-[#858A98]">Inventário disponível ({available.length})</div>
            <div className="text-xs text-[#858A98] mb-2">Selecione uma carta e clique em um slot.</div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[320px] overflow-auto">
              {available.map(c => (
                <div key={c.uid} onClick={() => setSelected(s => s === c.uid ? null : c.uid)}
                  draggable
                  onDragStart={() => setSelected(c.uid)}
                  className={`cursor-pointer rounded-xl ${selected === c.uid ? 'ring-2 ring-[#E30613]' : ''}`}>
                  <Card card={c} size="md" />
                </div>
              ))}
            </div>
            {available.length === 0 && <div className="text-[#858A98] text-sm">Nenhuma carta disponível.</div>}
          </div>

          <div className="card-surface p-4 space-y-2">
            <h3 className="font-semibold text-[#252733]">Análise do time</h3>
            <div className="text-sm text-[#252733]">Overall geral: <span className="font-bold text-[#E30613]">{ovrs}</span></div>
            <div className="text-sm text-[#252733]">Média de atributos: <span className="font-medium">{avgAttr}</span></div>
            <div className="text-sm text-[#252733]">Titulares: <span className="font-medium">{filledCount}/{squad.starters.length}</span></div>
            <div className="text-sm text-[#252733]">Fora de posição: <span className="font-medium">{outOfPosition}</span></div>
            {strengths.length > 0 && (
              <div className="text-xs text-green-700">Pontos fortes: {strengths.join(' ')}</div>
            )}
            {weaknesses.length > 0 && (
              <div className="text-xs text-red-600">Pontos fracos: {weaknesses.join(' ')}</div>
            )}
            <p className="text-xs text-[#858A98] mt-2">
              Overall calculado a partir dos atributos reais e jogadores escalados. Cartas no banco não contam para titulares.
            </p>
          </div>
        </div>
      </div>

      <div className="card-surface p-4 space-y-3">
        <h3 className="font-semibold text-[#252733]">Escalações salvas</h3>
        <div className="flex flex-wrap gap-2">
          <input value={saveName} onChange={e=>setSaveName(e.target.value)} placeholder="Nome da escalação" className="flex-1 min-w-[180px] bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm" />
          <button onClick={handleSave} className="px-3 py-2 rounded-xl bg-[#E30613] text-white text-sm font-medium">Salvar</button>
        </div>
        {mySaved.length === 0 && <div className="text-sm text-[#858A98]">Nenhuma escalação salva.</div>}
        <div className="space-y-2">
          {mySaved.map(s => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl border border-[#E9EAF0]">
              <div className="text-sm text-[#252733]">
                {s.isPrimary && <span className="text-[#E30613] mr-1">★</span>}{s.name} <span className="text-[#858A98] text-xs">({s.formation})</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleLoad(s.id)} className="px-2 py-1 text-xs rounded-lg bg-white border border-[#E9EAF0]">Carregar</button>
                <button onClick={() => handleDuplicate(s)} className="px-2 py-1 text-xs rounded-lg bg-white border border-[#E9EAF0]">Duplicar</button>
                <button onClick={() => setPrimary(s.id)} className="px-2 py-1 text-xs rounded-lg bg-white border border-[#E9EAF0]">Principal</button>
                <button onClick={() => { if (confirm('Excluir?')) deleteSquad(s.id); }} className="px-2 py-1 text-xs rounded-lg text-red-600 border border-red-200">Excluir</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
