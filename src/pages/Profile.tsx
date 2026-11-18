import { useGame } from '../store/useGame';
import Card from '../components/Card';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getProfile, updateProfile, type UserProfile } from '../lib/profile';
import { updateEmail, updatePassword, signOut, updateMetadata } from '../lib/services/auth';
import { useEffect, useState } from 'react';
import { Trophy, Coins, Layers, Package, Target, Medal, Swords, Sparkles, LogOut, Trash2, Pencil } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

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
  const rareCount = cards.filter(c => ['rare','epic','legendary','icon','secret'].includes(c.rarity)).length;
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }: { data: any }) => {
      if (data.session?.user?.id) {
        try {
          const uid = data.session.user.id;
          const p = await getProfile(uid);
          setProfile(p);
          setDraftName(p?.name || '');
          setDraftAvatar(p?.avatar_url || '');
        } catch (error) {
          console.error('[Profile] load failed', error);
        }
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
    setDeleteConfirmOpen(true);
  };
  const confirmDeleteAccount = async () => {
    if (!supabase) return;
    setDeleteConfirmOpen(false);
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
        <div className="w-24 h-24 rounded-full bg-[var(--soft)] flex items-center justify-center text-3xl text-[var(--red)] font-bold overflow-hidden shrink-0">
          {profile?.avatar_url ? <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" /> : level}
        </div>
        <div className="flex-1 min-w-0 text-center md:text-left space-y-1">
          {!editing ? (
            <>
              <div className="text-xl font-bold text-[var(--text)] truncate">{profile?.name || 'Jogador'}</div>
              <div className="text-sm text-[var(--muted)]">Nível {level} · {xp} XP</div>
              <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden max-w-xs mx-auto md:mx-0">
                <div className="h-full bg-[var(--red)]" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-xs text-[var(--muted)]">{xp - lvlXp} / {nextXp - lvlXp} XP para o próximo nível</div>
              <button onClick={() => setEditing(true)} className="text-sm text-[var(--red)] font-medium hover:underline flex items-center gap-1 mx-auto md:mx-0">
                <Pencil className="w-3 h-3" /> Editar perfil
              </button>
            </>
          ) : (
            <div className="space-y-2 max-w-sm mx-auto md:mx-0">
              <input value={draftName} onChange={e => setDraftName(e.target.value)} placeholder="Nome" className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm" />
              <input value={draftAvatar} onChange={e => setDraftAvatar(e.target.value)} placeholder="URL do avatar" className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <button onClick={handleSaveProfile} disabled={saving} className="px-4 py-2 rounded-xl bg-[var(--red)] text-white text-sm font-bold disabled:opacity-60">
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-xl bg-white border border-[var(--border)] text-sm font-medium">
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
            <s.icon className="w-5 h-5 mx-auto text-[var(--red)]" />
            <div className="text-lg font-bold text-[var(--text)]">{s.value}</div>
            <div className="text-[10px] text-[var(--muted)]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Elenco atual */}
      {squad && squad.starters.some((s: any) => s.uid) && (
        <div className="card-surface p-4 space-y-2">
          <div className="text-sm font-medium text-[var(--muted)]">Elenco atual · Formação {squad.formation}</div>
          <div className="flex justify-center gap-2 flex-wrap">
            {squad.starters.slice(0, 3).map((s: any, i: number) => {
              const card = cards.find((c: any) => c.uid === s.uid);
              return (
                <div key={i} className="flex flex-col items-center">
                  {card ? <Card card={card} size="sm" /> : <div className="flex aspect-[7/10] w-36 items-center justify-center rounded-xl border-2 border-dashed border-[var(--border)] text-xs text-[var(--muted)]">{s.position}</div>}
                </div>
              );
            })}
          </div>
          <div className="flex justify-center gap-2 flex-wrap">
            {squad.starters.slice(3, 5).map((s: any, i: number) => {
              const card = cards.find((c: any) => c.uid === s.uid);
              return (
                <div key={i} className="flex flex-col items-center">
                  {card ? <Card card={card} size="sm" /> : <div className="flex aspect-[7/10] w-36 items-center justify-center rounded-xl border-2 border-dashed border-[var(--border)] text-xs text-[var(--muted)]">{s.position}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Carta mais rara */}
      {rarest && (
        <div className="card-surface p-4 flex flex-col md:flex-row items-center gap-4">
          <div className="w-[min(100%,15rem)] shrink-0">
            <Card card={rarest} size="fluid" />
          </div>
          <div className="space-y-2 text-center md:text-left">
            <div className="text-sm font-medium text-[var(--muted)]">Carta mais rara</div>
            <div className="text-2xl font-bold text-[var(--text)]">{rarest.name}</div>
            <div className="text-lg text-[var(--red)] font-bold">OVR {rarest.overall} · {rarest.rarity}</div>
            <div className="text-sm text-[var(--muted)]">{rarest.position} · {rarest.club}</div>
          </div>
        </div>
      )}

      {/* Segurança da conta */}
      <div className="card-surface p-4 space-y-3 max-w-md">
        <div className="text-sm font-medium text-[var(--muted)]">Segurança da conta</div>
        <input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" placeholder="Novo email" className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm" />
        <button onClick={handleChangeEmail} disabled={saving} className="w-full py-2 rounded-xl bg-[var(--red)] text-white text-sm font-bold disabled:opacity-60">Alterar email</button>
        <input value={newPassword} onChange={e => setNewPassword(e.target.value)} type="password" placeholder="Nova senha" className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm" />
        <button onClick={handleChangePassword} disabled={saving} className="w-full py-2 rounded-xl bg-[var(--red)] text-white text-sm font-bold disabled:opacity-60">Alterar senha</button>
        {accountMsg && <div className="text-xs text-[var(--muted)]">{accountMsg}</div>}
      </div>

      {/* Ações da conta */}
      <div className="flex gap-3">
        <button onClick={handleLogout} className="px-4 py-2 rounded-xl bg-white border border-[var(--border)] text-[var(--text)] text-sm font-medium">
          <LogOut className="w-4 h-4 inline mr-1" /> Sair
        </button>
        <button onClick={handleDeleteAccount} disabled={saving} className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-60">
          <Trash2 className="w-4 h-4 inline mr-1" /> Excluir conta
        </button>
      </div>
      <ConfirmModal
        open={deleteConfirmOpen}
        title="Excluir conta"
        message="Tem certeza que deseja excluir sua conta? Esta ação é irreversível."
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void confirmDeleteAccount()}
        confirmLabel="Excluir conta"
        confirmVariant="danger"
        confirmDisabled={saving}
      />
    </div>
  );
}
