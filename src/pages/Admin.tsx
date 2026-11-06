import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from '../store/toast';
import { useGame } from '../store/useGame';
import Card from '../components/Card';
import type { PlayerCard } from '../types';
import { allTemplates } from '../data/players';

const ADMIN_USER_ID = '35a8dc5f-c5db-4b33-9380-a32739ff6c10';

const POSITIONS = ['GK', 'Fixo', 'Ala', 'Pivo'];
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'icon'];
const SPECIALS = ['none', 'totw', 'potm', 'revelation', 'legend', 'futsal'];
const EDITIONS = ['none', 'totw', 'potm'];

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

const templates = allTemplates();

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
    imageBase: '',
  });

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
      setLoading(false);
    });
  }, []);

  const isGK = form.position === 'GK';

  const selectedTemplate = templates.find(t => t.name === form.imageBase);
  const previewImage = selectedTemplate?.image || '';

  const previewCard: PlayerCard = {
    uid: 'preview',
    playerId: form.name.toLowerCase().replace(/\s+/g, '-') + '-' + form.rarity,
    name: form.name || 'Nome do Jogador',
    position: form.position as any,
    sport: 'futsal',
    nationality: selectedTemplate?.nationality || 'Brasil',
    age: selectedTemplate?.age || 20,
    club: selectedTemplate?.club || 'Clube',
    rarity: form.rarity as any,
    edition: form.edition as any,
    special: form.special as any,
    overall: form.overall,
    pace: form.pace,
    shooting: form.shooting,
    passing: form.passing,
    dribbling: form.dribbling,
    defending: form.defending,
    physical: form.physical,
    reflexes: isGK ? form.reflexes : undefined,
    positioning: isGK ? form.positioning : undefined,
    handling: isGK ? form.handling : undefined,
    image: previewImage,
    favorite: false,
    isNew: true,
    obtainedAt: Date.now(),
    xp: 0,
    evoPoints: 0,
    upgrades: { pace: 0, shooting: 0, passing: 0, dribbling: 0, defending: 0, physical: 0 },
    evolutionLog: [],
    seasonStats: { matches: 0, goals: 0, assists: 0 },
  };

  const handleCreate = async () => {
    if (!supabase || !form.name.trim()) { toast.error('Nome obrigatório.'); return; }
    setCreating(true);
    try {
      const { error } = await supabase.rpc('create_card', {
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
        p_image: previewImage || null,
      });
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Carta criada com sucesso!');
      // Sincronizar dados do usuário para a carta aparecer na coleção
      if (userId) await syncUserData(userId);
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
            <label className={labelCls}>Imagem (baseada em jogador existente)</label>
            <select value={form.imageBase} onChange={e => setForm({ ...form, imageBase: e.target.value })} className={inputCls}>
              <option value="">-- Sem imagem --</option>
              {templates.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
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
                {RARITIES.map(r => <option key={r} value={r}>{RARITY_LABELS[r]}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Overall (OVR)</label>
            <input type="number" value={form.overall} onChange={e => setForm({ ...form, overall: Number(e.target.value) })} className={inputCls} min={0} max={999} />
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

          <button
            onClick={handleCreate}
            disabled={creating || !form.name.trim()}
            className="w-full py-3 rounded-xl bg-[#E30613] text-white font-bold disabled:opacity-60"
          >
            {creating ? 'Criando...' : 'Criar Carta'}
          </button>
        </div>

        {/* Preview da carta */}
        <div className="flex flex-col items-center justify-start gap-4 min-w-[200px]">
          <h2 className="text-lg font-semibold text-[#252733]">Preview</h2>
          <Card card={previewCard} size="lg" />
          <div className="text-xs text-[#858A98] text-center">
            {RARITY_LABELS[form.rarity] || form.rarity} · OVR {form.overall}
          </div>
        </div>
      </div>
    </div>
  );
}
