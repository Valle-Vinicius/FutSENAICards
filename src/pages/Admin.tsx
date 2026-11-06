import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from '../store/toast';

const ADMIN_USER_ID = '35a8dc5f-c5db-4b33-9380-a32739ff6c10';

const POSITIONS = ['GK', 'Fixo', 'Ala', 'Pivo'];
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'icon'];
const SPECIALS = ['none', 'totw', 'potm', 'revelation', 'legend', 'futsal'];
const EDITIONS = ['none', 'totw', 'potm'];

export default function Admin() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    name: '',
    position: 'Ala',
    rarity: 'uncommon',
    overall: 80,
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
  });

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
      setLoading(false);
    });
  }, []);

  const isGK = form.position === 'GK';

  const handleCreate = async () => {
    if (!supabase || !form.name.trim()) { toast.error('Nome obrigatório.'); return; }
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc('create_card', {
        p_name: form.name.trim(),
        p_position: form.position,
        p_rarity: form.rarity,
        p_overall: form.overall,
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
      });
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Carta criada! ID: ' + data);
      setForm({ ...form, name: '' });
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
    <div className="p-4 md:p-8 space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-[#252733]">Painel Administrador</h1>

      <div className="card-surface p-4 space-y-4">
        <h2 className="text-lg font-semibold text-[#252733]">Criar Carta</h2>

        <div>
          <label className={labelCls}>Nome</label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Ex: João Marcos" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Posição</label>
            <select value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className={inputCls}>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Raridade</label>
            <select value={form.rarity} onChange={e => setForm({ ...form, rarity: e.target.value })} className={inputCls}>
              {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Overall</label>
          <input type="number" value={form.overall} onChange={e => setForm({ ...form, overall: Number(e.target.value) })} className={inputCls} min={0} max={999} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {(['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical'] as const).map(attr => (
            <div key={attr}>
              <label className={labelCls}>{attr.toUpperCase()}</label>
              <input type="number" value={form[attr]} onChange={e => setForm({ ...form, [attr]: Number(e.target.value) })} className={inputCls} min={0} max={99} />
            </div>
          ))}
        </div>

        {isGK && (
          <div className="grid grid-cols-3 gap-3">
            {(['reflexes', 'positioning', 'handling'] as const).map(attr => (
              <div key={attr}>
                <label className={labelCls}>{attr.toUpperCase()}</label>
                <input type="number" value={form[attr]} onChange={e => setForm({ ...form, [attr]: Number(e.target.value) })} className={inputCls} min={0} max={99} />
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Edição</label>
            <select value={form.edition} onChange={e => setForm({ ...form, edition: e.target.value })} className={inputCls}>
              {EDITIONS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Especial</label>
            <select value={form.special} onChange={e => setForm({ ...form, special: e.target.value })} className={inputCls}>
              {SPECIALS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={creating || !form.name.trim()}
          className="w-full py-3 rounded-xl bg-[#E30613] text-white font-bold disabled:opacity-60"
        >
          {creating ? 'Criando...' : 'Criar Carta'}
        </button>
      </div>
    </div>
  );
}
