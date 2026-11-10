import { useEffect, useState } from 'react';
import { useGame } from '../store/useGame';
import { Check, Lock } from 'lucide-react';
import { toast } from '../store/toast';

export default function Missions() {
  const missions = useGame(s => s.missions);
  const claim = useGame(s => s.claimMission);
  const update = useGame(s => s.updateMissionProgress);
  const achievements = useGame(s => s.achievements);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  useEffect(() => { update(); }, [update]);

  const handleClaim = async (id: string) => {
    if (claimingId) return;
    setClaimingId(id);
    if (await claim(id)) toast.success('Recompensa da missão resgatada.');
    setClaimingId(null);
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <h1 className="text-2xl md:text-3xl font-semibold text-[#252733]">Missões e conquistas</h1>

      <div>
        <h2 className="text-lg font-semibold mb-3 text-[#252733]">Missões</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {missions.map(m => (
            <div key={m.id} className="card-surface p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-[#252733]">{m.title}</div>
                  <div className="text-xs text-[#858A98]">{m.description}</div>
                </div>
                <div className="text-xs font-bold text-[#E30613]">+{m.reward} moedas</div>
              </div>
              <div className="mt-2 h-2 bg-[#E9EAF0] rounded-full overflow-hidden">
                <div className="h-full bg-[#E30613]" style={{ width: `${(m.progress/m.target)*100}%` }} />
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-xs text-[#858A98]">{m.progress}/{m.target}</span>
                {m.completed && !m.claimed && (
                  <button onClick={() => handleClaim(m.id)} disabled={claimingId !== null} className="px-3 py-1 rounded-xl bg-[#E30613] text-white text-xs font-medium disabled:opacity-60">{claimingId === m.id ? 'Resgatando...' : 'Resgatar'}</button>
                )}
                {m.claimed && <span className="text-xs text-[#858A98]">Resgatada</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3 text-[#252733]">Conquistas</h2>
        <div className="grid md:grid-cols-3 gap-3">
          {achievements.map(a => (
            <div key={a.id} className={`card-surface p-4 ${a.unlocked ? '' : 'opacity-40'}`}>
              <div className="font-medium text-[#252733]">{a.title}</div>
              <div className="text-xs text-[#858A98]">{a.description}</div>
              <div className="mt-2 text-xs">{a.unlocked ? <><Check className="inline w-3 h-3" /> Desbloqueado</> : <><Lock className="inline w-3 h-3" /> Bloqueado</>}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
