import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from '../store/toast';
import { useGame } from '../store/useGame';
import Card from '../components/Card';
import type { PlayerCard, Position, Rarity } from '../types';
import { RARITY_MODIFIER, RARITY_OVR_BONUS, SPECIAL_OVR_BONUS, calculateOverall } from '../data/players';

const ADMIN_USER_ID = '35a8dc5f-c5db-4b33-9380-a32739ff6c10';

const POSITIONS = ['GK', 'Fixo', 'Ala', 'Pivo'] as const;
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'icon'] as const;
const SPECIALS = ['none', 'totw', 'potm', 'revelation', 'legend', 'futsal'] as const;
const EDITIONS = ['none', 'totw', 'potm'] as const;

const RARITY_LABELS: Record<string, string> = {
  common: 'Comum',
  uncommon: 'Incomum',
  rare: 'Rara',
  epic: 'Épica',
  legendary: 'Lendária',
  icon: 'Ícone',
};

const SPECIAL_LABELS: Record<string, string> = {
  none: 'Nenhuma',
  totw: 'Time da Semana',
  potm: 'Craque da Rodada',
  revelation: 'Revelação',
  legend: 'Lenda',
  futsal: 'Futsal',
};

const EDITION_LABELS: Record<string, string> = {
  none: 'Nenhuma',
  totw: 'Time da Semana',
  potm: 'Craque da Rodada',
};

function calcOverall(attrs: { pace: number; shooting: number; passing: number; dribbling: number; defending: number; physical: number; reflexes?: number; positioning?: number; handling?: number }, position: string, rarity: string, special: string): number {
  const t = {
    attributes: { pace: attrs.pace, shooting: attrs.shooting, passing: attrs.passing, dribbling: attrs.dribbling, defending: attrs.defending, physical: attrs.physical },
    gkAttributes: attrs.reflexes ? { reflexes: attrs.reflexes, positioning: attrs.positioning!, handling: attrs.handling! } : undefined,
    position: position as Position,
    baseOverall: undefined as number | undefined,
  };
  const base = calculateOverall(t as any);
  return Math.min(99, base + (RARITY_OVR_BONUS[rarity as Rarity] ?? 0) + (SPECIAL_OVR_BONUS[special] ?? 0));
}

function applyMod(value: number, mod: number): number {
  return Math.max(0, Math.min(99, Math.round(value * mod)));
}

export default function Admin() {
  const navigate = useNavigate();
  const syncUserData = useGame(s => s.syncUserData);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    name: '',
    position: 'Ala',
    rarity: 'uncommon',
    overall: 80,
    baseOverall: 80,
    baseRarity: 'uncommon',
    pace: 70,
    shooting: 70,
    passing: 70,
    dribbling: 70,
    defending: 70,
    physical: 70,
    reflexes: 0,
    positioning: 0,
    handling: 0,
    edition: 'none',
    special: 'none',
    imageUrl: '',
    calcOverall: false,
    destination: 'inventory' as 'inventory' | 'packs',
  });

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
      setLoading(false);
    });
  }, []);

  const isGK = form.position === 'GK';
  const calcMode = form.calcOverall;

  // When calc mode is on, force uncommon rarity
  useEffect(() => {
    if (calcMode && form.rarity !== 'uncommon') {
      setForm(f => ({ ...f, rarity: 'uncommon' }));
    }
  }, [calcMode]);

  const attrs = {
    pace: form.pace, shooting: form.shooting, passing: form.passing,
    dribbling: form.dribbling, defending: form.defending, physical: form.physical,
    reflexes: isGK ? form.reflexes : undefined,
    positioning: isGK ? form.positioning : undefined,
    handling: isGK ? form.handling : undefined,
  };

  const calcRarity = form.destination === 'packs' ? form.baseRarity : form.rarity;
  const calcBaseOvr = form.destination === 'packs' ? form.baseOverall : form.overall;
  const calculatedOverall = calcMode ? calcOverall(attrs, form.position, calcRarity, form.special) : calcBaseOvr;

  // Preview cards for all rarities (when calc mode)
  const makePreviewCard = (rarity: string): PlayerCard => {
    const mod = RARITY_MODIFIER[rarity as Rarity] ?? 1.0;
    const ovr = calcMode ? calcOverall(attrs, form.position, rarity, form.special) : (form.destination === 'packs' ? form.baseOverall : form.overall);
    return {
      uid: 'preview-' + rarity,
      playerId: form.name.toLowerCase().replace(/\s+/g, '-') + '-' + rarity,
      name: form.name || 'Nome do Jogador',
      position: form.position as any,
      sport: 'futsal',
      nationality: 'Brasil',
      age: 20,
      club: 'Clube',
      rarity: rarity as any,
      edition: form.edition as any,
      special: form.special as any,
      overall: ovr,
      pace: calcMode ? applyMod(form.pace, mod) : form.pace,
      shooting: calcMode ? applyMod(form.shooting, mod) : form.shooting,
      passing: calcMode ? applyMod(form.passing, mod) : form.passing,
      dribbling: calcMode ? applyMod(form.dribbling, mod) : form.dribbling,
      defending: calcMode ? applyMod(form.defending, mod) : form.defending,
      physical: calcMode ? applyMod(form.physical, mod) : form.physical,
      reflexes: isGK ? (calcMode ? applyMod(form.reflexes, mod) : form.reflexes) : undefined,
      positioning: isGK ? (calcMode ? applyMod(form.positioning, mod) : form.positioning) : undefined,
      handling: isGK ? (calcMode ? applyMod(form.handling, mod) : form.handling) : undefined,
      image: form.imageUrl.trim(),
      favorite: false,
      isNew: true,
      obtainedAt: Date.now(),
      xp: 0,
      evoPoints: 0,
      upgrades: { pace: 0, shooting: 0, passing: 0, dribbling: 0, defending: 0, physical: 0 },
      evolutionLog: [],
      seasonStats: { matches: 0, goals: 0, assists: 0 },
    };
  };

  const handleCreate = async () => {
    if (!supabase || !form.name.trim()) { toast.error('Nome obrigatório.'); return; }
    setCreating(true);
    try {
      if (form.destination === 'inventory') {
        const ovr = calcMode ? calculatedOverall : form.overall;
        const { error } = await supabase.rpc('create_card', {
          p_name: form.name.trim(),
          p_position: form.position,
          p_rarity: calcMode ? 'uncommon' : form.rarity,
          p_overall: ovr,
          p_pace: form.pace,
          p_shooting: form.shooting,
          p_passing: form.passing,
          p_dribbling: form.dribbling,
          p_defending: form.defending,
          p_physical: form.physical,
          p_reflexes: isGK ? form.reflexes : null,
          p_positioning: isGK ? form.positioning : null,
          p_handling: isGK ? form.handling : null,
          p_edition: form.edition,
          p_special: form.special,
          p_image: form.imageUrl.trim() || null,
        });
        if (error) { toast.error('Erro: ' + error.message); return; }
        toast.success('Carta criada no inventário!');
        if (userId) await syncUserData(userId);
      } else {
        const ovr = calcMode ? calculatedOverall : form.baseOverall;
        const { error } = await supabase.rpc('create_card_template', {
          p_name: form.name.trim(),
          p_position: form.position,
          p_nationality: 'Brasil',
          p_age: 20,
          p_club: 'Clube',
          p_pace: form.pace,
          p_shooting: form.shooting,
          p_passing: form.passing,
          p_dribbling: form.dribbling,
          p_defending: form.defending,
          p_physical: form.physical,
          p_reflexes: isGK ? form.reflexes : null,
          p_positioning: isGK ? form.positioning : null,
          p_handling: isGK ? form.handling : null,
          p_image: form.imageUrl.trim() || null,
          p_special: 'none',
          p_base_rarity: form.baseRarity,
          p_base_overall: ovr,
        });
        if (error) { toast.error('Erro: ' + error.message); return; }
        toast.success('Carta adicionada aos pacotes!');
      }
      setForm({ ...form, name: '', imageUrl: '' });
    } catch (e: any) {
      toast.error('Erro: ' + (e?.message || 'desconhecido'));
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="p-8 text-[#858A98]">Carregando...</div>;

  if (userId !== ADMIN_USER_ID) {
    return (
      <div className="p-8 text-center text-[#858A98]">
        <div className="text-lg font-bold text-[#252733] mb-2">Acesso restrito</div>
        <div className="text-sm">Esta página é exclusiva para administradores.</div>
        <button onClick={() => navigate('/')} className="mt-4 px-4 py-2 rounded-xl bg-[#E30613] text-white text-sm">Voltar</button>
      </div>
    );
  }

  const inputCls = "w-full bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm text-[#252733]";
  const labelCls = "text-xs text-[#858A98] mb-1 block";

  return (
    <div className="p-4 md:p-8 space-y-6">
      <h1 className="text-2xl font-bold text-[#252733]">Painel Administrador</h1>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Formulário */}
        <div className="flex-1 card-surface p-4 space-y-4">
          <h2 className="text-lg font-semibold text-[#252733]">Criar Carta</h2>

          <div>
            <label className={labelCls}>Nome do Jogador</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Ex: João Marcos" />
          </div>

          <div>
            <label className={labelCls}>URL da Imagem</label>
            <input value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })} className={inputCls} placeholder="https://... ou /assets/imagem.jpg" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Posição</label>
              <select value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className={inputCls}>
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {form.destination === 'inventory' ? (
              <div>
                <label className={labelCls}>Raridade</label>
                <select value={form.rarity} onChange={e => setForm({ ...form, rarity: e.target.value })} className={inputCls} disabled={calcMode}>
                  {RARITIES.map(r => <option key={r} value={r}>{RARITY_LABELS[r]}</option>)}
                </select>
                {calcMode && <div className="text-[10px] text-[#858A98] mt-1">Bloqueado no modo cálculo (sempre Incomum)</div>}
              </div>
            ) : (
              <div>
                <label className={labelCls}>Raridade Base (pacotes)</label>
                <select value={form.baseRarity} onChange={e => setForm({ ...form, baseRarity: e.target.value as any })} className={inputCls}>
                  {RARITIES.map(r => <option key={r} value={r}>{RARITY_LABELS[r]}</option>)}
                </select>
                <div className="text-[10px] text-[#858A98] mt-1">Raridade usada como base da carta nos pacotes</div>
              </div>
            )}
          </div>

          {/* Toggle: calcular OVR automaticamente */}
          <div className="flex items-center gap-3 p-3 bg-[#F7F7F9] rounded-xl">
            <input type="checkbox" checked={form.calcOverall} onChange={e => setForm({ ...form, calcOverall: e.target.checked })} className="w-4 h-4" />
            <div>
              <div className="text-sm font-medium text-[#252733]">Calcular OVR automaticamente</div>
              <div className="text-xs text-[#858A98]">{form.destination === 'inventory' ? 'O overall será calculado a partir dos atributos (sistema incomum).' : 'O overall base será usado direto nos pacotes.'}</div>
            </div>
          </div>

          <div>
            <label className={labelCls}>Overall {form.destination === 'packs' ? '(base)' : ''} {calcMode && <span className="text-[#E30613]">(calculado: {calculatedOverall})</span>}</label>
            <input type="number" value={calcMode ? calculatedOverall : (form.destination === 'packs' ? form.baseOverall : form.overall)} onChange={e => {
              const val = Number(e.target.value);
              if (form.destination === 'packs') setForm({ ...form, baseOverall: val });
              else setForm({ ...form, overall: val });
            }} className={inputCls} min={0} max={999} disabled={calcMode} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Velocidade</label>
              <input type="number" value={form.pace} onChange={e => setForm({ ...form, pace: Number(e.target.value) })} className={inputCls} min={0} max={99} />
            </div>
            <div>
              <label className={labelCls}>Chute</label>
              <input type="number" value={form.shooting} onChange={e => setForm({ ...form, shooting: Number(e.target.value) })} className={inputCls} min={0} max={99} />
            </div>
            <div>
              <label className={labelCls}>Passe</label>
              <input type="number" value={form.passing} onChange={e => setForm({ ...form, passing: Number(e.target.value) })} className={inputCls} min={0} max={99} />
            </div>
            <div>
              <label className={labelCls}>Drible</label>
              <input type="number" value={form.dribbling} onChange={e => setForm({ ...form, dribbling: Number(e.target.value) })} className={inputCls} min={0} max={99} />
            </div>
            <div>
              <label className={labelCls}>Defesa</label>
              <input type="number" value={form.defending} onChange={e => setForm({ ...form, defending: Number(e.target.value) })} className={inputCls} min={0} max={99} />
            </div>
            <div>
              <label className={labelCls}>Físico</label>
              <input type="number" value={form.physical} onChange={e => setForm({ ...form, physical: Number(e.target.value) })} className={inputCls} min={0} max={99} />
            </div>
          </div>

          {isGK && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Reflexos</label>
                <input type="number" value={form.reflexes} onChange={e => setForm({ ...form, reflexes: Number(e.target.value) })} className={inputCls} min={0} max={99} />
              </div>
              <div>
                <label className={labelCls}>Posicionamento</label>
                <input type="number" value={form.positioning} onChange={e => setForm({ ...form, positioning: Number(e.target.value) })} className={inputCls} min={0} max={99} />
              </div>
              <div>
                <label className={labelCls}>Defesa de Bola</label>
                <input type="number" value={form.handling} onChange={e => setForm({ ...form, handling: Number(e.target.value) })} className={inputCls} min={0} max={99} />
              </div>
            </div>
          )}

          {form.destination === 'inventory' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Edição</label>
                <select value={form.edition} onChange={e => setForm({ ...form, edition: e.target.value })} className={inputCls}>
                  {EDITIONS.map(e => <option key={e} value={e}>{EDITION_LABELS[e]}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Especial</label>
                <select value={form.special} onChange={e => setForm({ ...form, special: e.target.value })} className={inputCls}>
                  {SPECIALS.map(s => <option key={s} value={s}>{SPECIAL_LABELS[s]}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Toggle: destino */}
          <div className="flex items-center gap-3 p-3 bg-[#F7F7F9] rounded-xl">
            <div className="flex-1">
              <div className="text-sm font-medium text-[#252733]">Destino da carta</div>
              <div className="text-xs text-[#858A98]">Onde a carta será disponibilizada</div>
            </div>
            <select value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value as any })} className="bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm text-[#252733]">
              <option value="inventory">Inventário (admin)</option>
              <option value="packs">Pacotes (disponível para todos)</option>
            </select>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating || !form.name.trim()}
            className="w-full py-3 rounded-xl bg-[#E30613] text-white font-bold disabled:opacity-60"
          >
            {creating ? 'Criando...' : form.destination === 'packs' ? 'Adicionar aos Pacotes' : 'Criar no Inventário'}
          </button>
        </div>

        {/* Preview da carta */}
        <div className="flex flex-col items-center justify-start gap-4 min-w-[200px]">
          <h2 className="text-lg font-semibold text-[#252733]">Preview</h2>
          {calcMode ? (
            <div className="flex flex-wrap gap-3 justify-center">
              {RARITIES.map(r => (
                <div key={r} className="flex flex-col items-center gap-1">
                  <Card card={makePreviewCard(r)} size="sm" />
                  <div className="text-[10px] text-[#858A98]">{RARITY_LABELS[r]} · OVR {makePreviewCard(r).overall}</div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <Card card={makePreviewCard(form.destination === 'packs' ? form.baseRarity : form.rarity)} size="lg" />
              <div className="text-xs text-[#858A98] text-center">
                {RARITY_LABELS[form.destination === 'packs' ? form.baseRarity : form.rarity] || (form.destination === 'packs' ? form.baseRarity : form.rarity)} · OVR {form.destination === 'packs' ? form.baseOverall : form.overall}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
