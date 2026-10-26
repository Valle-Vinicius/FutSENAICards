import { useGame } from '../store/useGame';
import Card from '../components/Card';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getProfile, updateProfile, type UserProfile } from '../lib/profile';
import { updateEmail, updatePassword, signOut, updateMetadata } from '../lib/services/auth';
import { useEffect, useState } from 'react';

export default function Profile() {
  const coins = useGame(s => s.coins);
  const xp = useGame(s => s.xp);
  const level = useGame(s => s.level);
  const cards = useGame(s => s.cards);
  const packsOpened = useGame(s => s.packsOpened);
  const missions = useGame(s => s.missions);
  const achievements = useGame(s => s.achievements);
  const matchHistory = useGame(s => s.matchHistory);
  const lvlXp = (level - 1) * 500;
  const nextXp = level * 500;
  const pct = Math.min(100, ((xp - lvlXp) / (nextXp - lvlXp)) * 100);
  const wins = matchHistory.filter(m => m.homeScore > m.awayScore).length;
  const rarest = [...cards].sort((a, b) => b.overall - a.overall)[0];
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftAvatar, setDraftAvatar] = useState('');
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [accountMsg, setAccountMsg] = useState('');
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user?.id) {
        const p = await getProfile(data.session.user.id);
        setProfile(p);
        setDraftName(p?.name || '');
        setDraftAvatar(p?.avatar_url || '');
      }
    });
  }, []);
  const handleChangeEmail = async () => {
    if (!newEmail) return;
    setSaving(true);
    setAccountMsg('');
    const { error } = await updateEmail(newEmail);
    setAccountMsg(error ? error : 'Email de confirmação enviado.');
    setSaving(false);
  };
  const handleChangePassword = async () => {
    if (!newPassword) return;
    setSaving(true);
    setAccountMsg('');
    const { error } = await updatePassword(newPassword);
    setAccountMsg(error ? error : 'Senha alterada.');
    setSaving(false);
  };
  const handleSaveProfile = async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return;
    setSaving(true);
    const updated = await updateProfile(uid, { name: draftName.trim() || null, avatar_url: draftAvatar.trim() || null });
    if (updated) {
      setProfile(updated);
      await updateMetadata(draftName.trim());
      setEditing(false);
    }
    setSaving(false);
  };
  const handleLogout = async () => {
    await signOut();
    localStorage.removeItem('futsenai-cards-v3');
    navigate('/auth');
  };
  const handleDeleteAccount = async () => {
    if (!supabase) return;
    if (!confirm('Tem certeza que deseja excluir sua conta? Esta ação é irreversível.')) return;
    setSaving(true);
    const { error } = await supabase.functions.invoke('delete-account');
    if (error) { setAccountMsg(error.message); setSaving(false); return; }
    await signOut();
    localStorage.removeItem('futsenai-cards-v3');
    navigate('/auth');
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <h1 className="text-2xl md:text-3xl font-semibold text-[#252733]">Perfil do usuário</h1>
      <div className="card-surface p-6 flex flex-col md:flex-row items-center gap-6">
        <div className="w-24 h-24 rounded-full bg-[#FFF0F2] flex items-center justify-center text-4xl text-[#E30613] font-bold overflow-hidden">
          {profile?.avatar_url ? <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" /> : level}
        </div>
        <div className="flex-1 space-y-2 w-full">
          {!editing ? (
            <>
              <div className="text-xl font-semibold text-[#252733]">{profile?.name || 'Jogador Futsenai'}</div>
              <div className="text-sm text-[#858A98]">NÃ­vel {level} Â· {xp} XP</div>
              <button onClick={() => setEditing(true)} className="text-sm text-[#E30613] font-medium hover:underline">Editar perfil</button>
            </>
          ) : (
            <div className="space-y-2">
              <input value={draftName} onChange={e => setDraftName(e.target.value)} placeholder="Nome" className="w-full bg-[#F7F7F9] border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm" />
              <input value={draftAvatar} onChange={e => setDraftAvatar(e.target.value)} placeholder="URL do avatar" className="w-full bg-[#F7F7F9] border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <button onClick={handleSaveProfile} disabled={saving} className="px-4 py-2 rounded-xl bg-[#E30613] text-white text-sm font-bold disabled:opacity-60">
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-xl bg-white border border-[#E9EAF0] text-sm font-medium">
                  Cancelar
                </button>
              </div>
            </div>
          )}
          <div className="h-2 bg-[#E9EAF0] rounded-full overflow-hidden">
            <div className="h-full bg-[#E30613]" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-[#858A98]">{xp - lvlXp} / {nextXp - lvlXp} XP para o próximo nível</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Moedas', value: coins.toLocaleString('pt-BR') },
          { label: 'Cartas', value: String(cards.length) },
          { label: 'Pacotes abertos', value: String(packsOpened) },
          { label: 'Missões concluídas', value: String(missions.filter(m => m.completed).length) },
          { label: 'Conquistas', value: String(achievements.filter(a => a.unlocked).length) },
          { label: 'Partidas', value: String(matchHistory.length) },
          { label: 'Vitórias', value: String(wins) },
          { label: 'Cartas raras+', value: String(cards.filter(c => ['rare', 'epic', 'legendary', 'icon'].includes(c.rarity)).length) },
        ].map(s => (
          <div key={s.label} className="card-surface p-3">
            <div className="text-xs text-[#858A98]">{s.label}</div>
            <div className="text-xl font-bold text-[#252733]">{s.value}</div>
          </div>
        ))}
      </div>

      {rarest && (
        <div className="card-surface p-4">
          <div className="text-sm font-medium text-[#858A98] mb-3">Carta mais rara</div>
          <div className="flex justify-center"><Card card={rarest} size="md" /></div>
        </div>
      )}

      <div className="card-surface p-4 space-y-3">
        <div className="text-sm font-medium text-[#858A98]">Segurança da conta</div>
        <input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" placeholder="Novo email" className="w-full bg-[#F7F7F9] border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm" />
        <button onClick={handleChangeEmail} disabled={saving} className="w-full py-2 rounded-xl bg-[#E30613] text-white text-sm font-bold disabled:opacity-60">Alterar email</button>
        <input value={newPassword} onChange={e => setNewPassword(e.target.value)} type="password" placeholder="Nova senha" className="w-full bg-[#F7F7F9] border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm" />
        <button onClick={handleChangePassword} disabled={saving} className="w-full py-2 rounded-xl bg-[#E30613] text-white text-sm font-bold disabled:opacity-60">Alterar senha</button>
        {accountMsg && <div className="text-xs text-[#858A98]">{accountMsg}</div>}
      </div>

      <div className="card-surface p-4">
        <button onClick={handleLogout} className="w-full py-3 rounded-xl bg-white border border-red-200 text-red-600 font-bold">
          Sair da conta
        </button>
        <button onClick={handleDeleteAccount} disabled={saving} className="w-full py-3 rounded-xl bg-red-600 text-white font-bold mt-2 disabled:opacity-60">
          Excluir conta
        </button>
      </div>
    </div>
  );
}
