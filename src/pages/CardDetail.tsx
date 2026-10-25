import { useParams, useNavigate } from 'react-router-dom';
import { useGame } from '../store/useGame';
import Card from '../components/Card';

export default function CardDetail() {
  const { uid } = useParams();
  const navigate = useNavigate();
  const cards = useGame(s => s.cards);
  const toggleFav = useGame(s => s.toggleFavorite);
  const upgradePlayer = useGame(s => s.upgradePlayer);
  const card = cards.find(c => c.uid === uid);
  if (!card) return <div className="p-8 text-[#252733]">Carta não encontrada. <button onClick={()=>navigate('/collection')} className="text-[#E30613]">Voltar</button></div>;

  const isGK = card.position === 'GK';
  const attrs = isGK
    ? [['Reflexos', card.reflexes ?? 0], ['Posicionamento', card.positioning ?? 0], ['Defesa', card.handling ?? 0], ['Passe', card.passing], ['Físico', card.physical], ['Velocidade', card.pace]]
    : [['Velocidade', card.pace], ['Chute', card.shooting], ['Passe', card.passing], ['Drible', card.dribbling], ['Defesa', card.defending], ['Físico', card.physical]];

  return (
    <div className="p-4 md:p-8 flex flex-col md:flex-row gap-8 items-start">
      <div className="flex justify-center">
        <Card card={card} size="lg" />
      </div>
      <div className="flex-1 space-y-4">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-semibold text-[#252733]">{card.name}</h1>
          <button onClick={() => toggleFav(card.uid)} className={`text-2xl ${card.favorite ? 'text-[#E30613]' : 'text-[#858A98]'}`}>★</button>
        </div>
        <div className="card-surface p-4 grid grid-cols-2 gap-2 text-sm">
          <Row label="Posição" value={card.position} />
          <Row label="Clube" value={card.club} />
          <Row label="Nacionalidade" value={card.nationality} />
          <Row label="Idade" value={String(card.age)} />
          <Row label="Raridade" value={card.rarity} />
          <Row label="Edição" value={card.edition} />
          <Row label="Overall" value={String(card.overall)} />
          <Row label="ID" value={card.uid} />
        </div>
        <div className="card-surface p-4">
          <div className="font-semibold mb-2 text-[#252733]">Atributos</div>
          <div className="space-y-2">
            {attrs.map(([l, v]) => (
              <div key={l as string}>
                <div className="flex justify-between text-xs mb-1 text-[#858A98]"><span>{l}</span><span className="font-bold text-[#252733]">{v}</span></div>
                <div className="h-2 bg-[#E9EAF0] rounded-full overflow-hidden">
                  <div className="h-full bg-[#E30613]" style={{ width: `${v}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card-surface p-4">
          <div className="font-semibold mb-2 text-[#252733]">Evolução</div>
          <div className="text-xs text-[#858A98] mb-2">XP: {card.xp ?? 0} · Pontos de evolução: {card.evoPoints ?? 0}</div>
          <div className="h-2 bg-[#E9EAF0] rounded-full overflow-hidden mb-3">
            <div className="h-full bg-[#E30613]" style={{ width: `${Math.min(100, ((card.xp ?? 0) % 100))}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'pace', label: 'Velocidade', v: card.pace },
              { key: 'shooting', label: 'Chute', v: card.shooting },
              { key: 'passing', label: 'Passe', v: card.passing },
              { key: 'dribbling', label: 'Drible', v: card.dribbling },
              { key: 'defending', label: 'Defesa', v: card.defending },
              { key: 'physical', label: 'Físico', v: card.physical },
            ].map(a => (
              <button
                key={a.key}
                disabled={(card.evoPoints ?? 0) <= 0}
                onClick={() => { const ok = upgradePlayer(card.uid, a.key as any); if (!ok) alert('Sem pontos ou limite atingido.'); }}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-white border border-[#E9EAF0] text-sm disabled:opacity-40"
              >
                <span className="text-[#252733]">{a.label}</span>
                <span className="font-bold text-[#E30613]">{a.v} +</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-[#858A98] mt-2">
            Limite total de 15 melhorias por carta e +10 por atributo. Overall máximo 99.
          </p>
        </div>

        <div className="card-surface p-4">
          <div className="font-semibold mb-2 text-[#252733]">Histórico de evolução</div>
          {(card.evolutionLog ?? []).length === 0 && <div className="text-xs text-[#858A98]">Sem evoluções.</div>}
          <div className="space-y-1 max-h-32 overflow-auto text-xs">
            {(card.evolutionLog ?? []).map((e, i) => (
              <div key={i} className="text-[#252733]">{new Date(e.at).toLocaleString('pt-BR')} · +1 {e.attr}</div>
            ))}
          </div>
        </div>

        <div className="card-surface p-4">
          <div className="font-semibold mb-2 text-[#252733]">Estatísticas da temporada</div>
          <div className="text-sm text-[#252733]">Partidas: <span className="font-bold">{card.seasonStats?.matches ?? 0}</span></div>
          <div className="text-sm text-[#252733]">Gols: <span className="font-bold">{card.seasonStats?.goals ?? 0}</span></div>
          <div className="text-sm text-[#252733]">Assistências: <span className="font-bold">{card.seasonStats?.assists ?? 0}</span></div>
        </div>

        <button onClick={() => navigate('/collection')} className="px-4 py-2 rounded-xl bg-white border border-[#E9EAF0] text-[#252733] font-medium hover:bg-[#F7F7F9]">Voltar à coleção</button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-[#E9EAF0] pb-1">
      <span className="text-[#858A98]">{label}</span>
      <span className="font-medium text-[#252733]">{value}</span>
    </div>
  );
}
