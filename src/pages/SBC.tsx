import { useState } from 'react';
import { useGame } from '../store/useGame';
import Card from '../components/Card';

export default function SBC() {
  const sbcs = useGame(s => s.sbcs);
  const cards = useGame(s => s.cards);
  const completeSBC = useGame(s => s.completeSBC);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [msg, setMsg] = useState('');

  const toggle = (sbcId: string, uid: string) => {
    setSelected(prev => {
      const cur = prev[sbcId] || [];
      const next = cur.includes(uid) ? cur.filter(u => u !== uid) : [...cur, uid];
      return { ...prev, [sbcId]: next };
    });
  };

  const handleComplete = (sbcId: string) => {
    const uids = selected[sbcId] || [];
    const ok = completeSBC(sbcId, uids);
    setMsg(ok ? 'Desafio concluído! Recompensa concedida.' : 'Requisitos não atendidos.');
    if (ok) setSelected(prev => ({ ...prev, [sbcId]: [] }));
    setTimeout(() => setMsg(''), 2000);
  };

  return (
    <div className="p-4 md:p-8 space-y-4">
      <h1 className="text-2xl md:text-3xl font-semibold text-[#252733]">Desafios de elenco (SBC)</h1>
      {msg && <div className="text-sm text-[#E30613]">{msg}</div>}
      <div className="space-y-4">
        {sbcs.map(sbc => {
          const chosen = selected[sbc.id] || [];
          return (
            <div key={sbc.id} className="card-surface p-4 space-y-3">
              <div>
                <div className="font-semibold text-[#252733]">{sbc.title}</div>
                <div className="text-xs text-[#858A98]">{sbc.description}</div>
                <div className="text-xs text-[#252733] mt-1">Recompensa: {sbc.reward.type} {String(sbc.reward.value)} · Requisitos: {sbc.requirements.count} cartas{sbc.requirements.minOverall ? ` (min OVR ${sbc.requirements.minOverall})` : ''}{sbc.requirements.sameClub ? ' (mesmo clube)' : ''}</div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-48 overflow-auto">
                {cards.map(c => (
                  <div key={c.uid} onClick={() => toggle(sbc.id, c.uid)} className={`cursor-pointer rounded-xl ${chosen.includes(c.uid) ? 'ring-2 ring-[#E30613]' : ''}`}>
                    <Card card={c} size="sm" />
                  </div>
                ))}
              </div>
              <div className="text-xs text-[#858A98]">Selecionadas: {chosen.length}/{sbc.requirements.count}</div>
              <button onClick={() => handleComplete(sbc.id)} disabled={chosen.length < sbc.requirements.count} className="px-4 py-2 rounded-xl bg-[#E30613] text-white text-sm font-medium disabled:opacity-40">
                Confirmar entrega
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
