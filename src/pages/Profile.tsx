import { useGame } from '../store/useGame';
import Card from '../components/Card';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getProfile, updateProfile, type UserProfile } from '../lib/profile';
import { updateEmail, updatePassword, signOut, updateMetadata } from '../lib/services/auth';
import { useEffect, useState } from 'react';
import { Trophy, Coins, Layers, Package, Target, Medal, Swords, Sparkles, LogOut, Trash2, Pencil } from 'lucide-react';

export default function Profile() {
  const coins = useGame(s => s.coins);
  const xp = useGame(s => s.xp);
  const level = useGame(s => s.level);
  const cards = useGame(s => s.cards);
  const missions = useGame(s => s.missions);
  const achievements = useGame(s => s.achievements);
  const matchHistory = useGame(s => s.matchHistory);
  const packsOpened = useGame(s => s.packsOpened);
  const squad = useGame(s => s.squads.futsal);

  const lvlXp = (level - 1) * 500;
  const nextXp = level * 500;
  const pct = Math.min(100, ((xp - lvlXp) / (nextXp - lvlXp)) * 100);
  const rarest = [...cards].sort((a, b) => b.overall - a.overall)[0];
  const rareCount = cards.filter(c => ['rare','epic','legendary','icon'].includes(c.rarity)).length;
  const wins = matchHistory.filter(m => m.homeScore > m.awayScore).length;
  const missionsDone = missions.filter(m => m.completed).length;
  const achievementsUnlocked = achievements.filter(a => a.unlocked).length;

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
    supabase.auth.getSession().then(async ({ data }: { data: any }) => {
      if (data.session?.user?.id) {
        const uid = data.session.user.id;
        const p = await getProfile(uid);
        setProfile(p);
        setDraftName(p?.name || '');
        setDraftAvatar(p?.avatar_url || '');
      }
    });
  }, []);

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
      useGame.setState({ avatarUrl: draftAvatar.trim() || null });
      setEditing(false);
    }
    setSaving(false);
  };

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

  const stats = [
    { label: 'Moedas', value: coins.toLocaleString('pt-BR'), icon: Coins },
    { label: 'Cartas', value: String(cards.length), icon: Layers },
    { label: 'Pacotes', value: String(packsOpened), icon: Package },
    { label: 'Missões', value: String(missionsDone), icon: Target },
    { label: 'Conquistas', value: String(achievementsUnlocked), icon: Medal },
    { label: 'Partidas', value: String(matchHistory.length), icon: Swords },
    { label: 'Vitórias', value: String(wins), icon: Trophy },
    { label: 'Raras', value: String(rareCount), icon: Sparkles },
  ];

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      {/* Cabeçalho do perfil */}
      <div className="card-surface p-4 md:p-6 flex flex-col md:flex-row items-center gap-4 md:gap-6">
        <div className="w-24 h-24 rounded-full bg-[#FFF0F2] flex items-center justify-center text-3xl text-[#E30613] font-bold overflow-hidden shrink-0">
          {profile?.avatar_url ? <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" /> : level}
        </div>
        <div className="flex-1 min-w-0 text-center md:text-left space-y-1">
          {!editing ? (
            <>
              <div className="text-xl font-bold text-[#252733] truncate">{profile?.name || 'Jogador'}</div>
              <div className="text-sm text-[#858A98]">Nível {level} · {xp} XP</div>
              <div className="h-2 bg-[#E9EAF0] rounded-full overflow-hidden max-w-xs mx-auto md:mx-0">
                <div className="h-full bg-[#E30613]" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-xs text-[#858A98]">{xp - lvlXp} / {nextXp - lvlXp} XP para o próximo nível</div>
              <button onClick={() => setEditing(true)} className="text-sm text-[#E30613] font-medium hover:underline flex items-center gap-1 mx-auto md:mx-0">
                <Pencil className="w-3 h-3" /> Editar perfil
              </button>
            </>
          ) : (
            <div className="space-y-2 max-w-sm mx-auto md:mx-0">
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
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="card-surface p-3 text-center space-y-1">
            <s.icon className="w-5 h-5 mx-auto text-[#E30613]" />
            <div className="text-lg font-bold text-[#252733]">{s.value}</div>
            <div className="text-[10px] text-[#858A98]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Elenco atual */}
      {squad && squad.starters.some((s: any) => s.uid) && (
        <div className="card-surface p-4 space-y-2">
          <div className="text-sm font-medium text-[#858A98]">Elenco atual · Formação {squad.formation}</div>
          <div className="relative bg-gradient-to-b from-green-50 to-green-100 rounded-xl border-2 border-green-200 p-4 mx-auto max-w-md overflow-hidden">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 border border-green-300/40 rounded-full" />
              <div className="absolute bottom-0 left-0 right-0 h-px bg-green-300/30" />
            </div>
            <div className="relative flex flex-col items-center gap-4">
              <div className="flex flex-col items-center gap-1">
                <span className="text-[9px] font-bold text-green-700/60">GOL</span>
                {(() => { const sl = squad.starters.find((x: any) => x.position === 'GK'); const c = sl?.uid ? cards.find((cc: any) => cc.uid === sl.uid) : null; return c ? <Card card={c} size="sm" /> : <div className="w-32 h-44 rounded-xl border-2 border-dashed border-green-300 flex items-center justify-center text-xs text-[#858A98]">GOL</div>; })()}
              </div>
              <div className="flex justify-between w-full max-w-xs gap-4">
                {['Ala', 'Ala'].map((_, idx) => {
                  const alas = squad.starters.filter((x: any) => x.position === 'Ala');
                  const sl = alas[idx];
                  const c = sl?.uid ? cards.find((cc: any) => cc.uid === sl.uid) : null;
                  return (
                    <div key={idx} className="flex flex-col items-center gap-1">
                      <span className="text-[9px] font-bold text-green-700/60">ALA</span>
                      {c ? <Card card={c} size="sm" /> : <div className="w-32 h-44 rounded-xl border-2 border-dashed border-green-300 flex items-center justify-center text-xs text-[#858A98]">ALA</div>}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[9px] font-bold text-green-700/60">PIVÔ</span>
                {(() => { const sl = squad.starters.find((x: any) => x.position === 'Pivo'); const c = sl?.uid ? cards.find((cc: any) => cc.uid === sl.uid) : null; return c ? <Card card={c} size="sm" /> : <div className="w-32 h-44 rounded-xl border-2 border-dashed border-green-300 flex items-center justify-center text-xs text-[#858A98]">PIVÔ</div>; })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Carta mais rara */}
      {rarest && (
        <div className="card-surface p-4 flex flex-col md:flex-row items-center gap-4">
          <div className="shrink-0">
            <Card card={rarest} size="lg" />
          </div>
          <div className="space-y-2 text-center md:text-left">
            <div className="text-sm font-medium text-[#858A98]">Carta mais rara</div>
            <div className="text-2xl font-bold text-[#252733]">{rarest.name}</div>
            <div className="text-lg text-[#E30613] font-bold">OVR {rarest.overall} · {rarest.rarity}</div>
            <div className="text-sm text-[#858A98]">{rarest.position} · {rarest.club}</div>
          </div>
        </div>
      )}

      {/* Segurança da conta */}
      <div className="card-surface p-4 space-y-3 max-w-md">
        <div className="text-sm font-medium text-[#858A98]">Segurança da conta</div>
        <input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" placeholder="Novo email" className="w-full bg-[#F7F7F9] border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm" />
        <button onClick={handleChangeEmail} disabled={saving} className="w-full py-2 rounded-xl bg-[#E30613] text-white text-sm font-bold disabled:opacity-60">Alterar email</button>
        <input value={newPassword} onChange={e => setNewPassword(e.target.value)} type="password" placeholder="Nova senha" className="w-full bg-[#F7F7F9] border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm" />
        <button onClick={handleChangePassword} disabled={saving} className="w-full py-2 rounded-xl bg-[#E30613] text-white text-sm font-bold disabled:opacity-60">Alterar senha</button>
        {accountMsg && <div className="text-xs text-[#858A98]">{accountMsg}</div>}
      </div>

      {/* Ações da conta */}
      <div className="flex gap-3">
        <button onClick={handleLogout} className="px-4 py-2 rounded-xl bg-white border border-[#E9EAF0] text-[#252733] text-sm font-medium">
          <LogOut className="w-4 h-4 inline mr-1" /> Sair
        </button>
        <button onClick={handleDeleteAccount} disabled={saving} className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-60">
          <Trash2 className="w-4 h-4 inline mr-1" /> Excluir conta
        </button>
      </div>
    </div>
  );
}
