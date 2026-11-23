import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Award, Coins, LogOut, Package, Pencil, Shield, Target, Trash2, Users } from 'lucide-react';
import { useGame } from '../store/useGame';
import Card from '../components/Card';
import ConfirmModal from '../components/ConfirmModal';
import { useCardViewer } from '../hooks/useCardViewer';
import { supabase } from '../lib/supabase';
import { FORMATIONS_FUTSAL as FS, normalizeFutsalFormation } from '../lib/game';
import { getProfile, updateProfile, type UserProfile } from '../lib/profile';
import { updateEmail, updatePassword, signOut, updateMetadata } from '../lib/services/auth';
import { RARITY_META } from '../types';

const COURT_COORDINATES: Record<string, { x: number; y: number }[]> = {
  '1-2-1': [
    { x: 50, y: 88 },
    { x: 50, y: 66 },
    { x: 25, y: 47 },
    { x: 75, y: 47 },
    { x: 50, y: 27 },
  ],
  '2-2': [
    { x: 50, y: 88 },
    { x: 30, y: 65 },
    { x: 70, y: 65 },
    { x: 30, y: 35 },
    { x: 70, y: 35 },
  ],
};

const POSITION_LABELS: Record<string, string> = { GK: 'GOL', Fixo: 'FIXO', Ala: 'ALA', Pivo: 'PIVÔ' };

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
  const { openCard: openCardViewer, viewer: cardViewer } = useCardViewer();

  useEffect(() => {
    document.title = 'Meu perfil | FutSENAI Cards';
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }: { data: any }) => {
      if (data.session?.user?.id) {
        try {
          const uid = data.session.user.id;
          const nextProfile = await getProfile(uid);
          setProfile(nextProfile);
          setDraftName(nextProfile?.name || '');
          setDraftAvatar(nextProfile?.avatar_url || '');
        } catch (error) {
          console.error('[Profile] load failed', error);
        }
      }
    }).catch(error => {
      console.error('[Profile] session load failed', error);
    });
  }, []);

  const handleSaveProfile = async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return;
    setSaving(true);
    try {
      const updated = await updateProfile(uid, { name: draftName.trim() || null, avatar_url: draftAvatar.trim() || null });
      if (updated) {
        setProfile(updated);
        await updateMetadata(draftName.trim());
        useGame.setState({ avatarUrl: draftAvatar.trim() || null });
        setEditing(false);
        setAccountMsg('Perfil atualizado.');
      } else {
        setAccountMsg('Não foi possível atualizar o perfil.');
      }
    } catch (error) {
      console.error('[Profile] update failed', error);
      setAccountMsg('Não foi possível atualizar o perfil.');
    } finally {
      setSaving(false);
    }
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

  const handleDeleteAccount = () => {
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

  const levelXp = Math.max(0, Math.min(500, xp - (level - 1) * 500));
  const xpProgress = (levelXp / 500) * 100;
  const wins = matchHistory.filter(match => match.homeScore > match.awayScore).length;
  const losses = matchHistory.filter(match => match.homeScore < match.awayScore).length;
  const winRate = matchHistory.length ? Math.round((wins / matchHistory.length) * 100) : 0;
  const rareCount = cards.filter(card => ['rare', 'epic', 'legendary', 'icon', 'secret'].includes(card.rarity)).length;
  const specialCount = cards.filter(card => card.special && card.special !== 'none').length;
  const missionsDone = missions.filter(mission => mission.completed).length;
  const achievementsUnlocked = achievements.filter(achievement => achievement.unlocked).length;
  const featuredCard = [...cards].sort((a, b) => b.overall - a.overall)[0];
  const formation = normalizeFutsalFormation(squad.formation);
  const coordinates = COURT_COORDINATES[formation];
  const cardsByUid = new Map(cards.map(card => [card.uid, card]));

  const performanceStats = [
    { label: 'Partidas', value: matchHistory.length },
    { label: 'Vitórias', value: wins },
    { label: 'Derrotas', value: losses },
    { label: 'Taxa de vitória', value: `${winRate}%` },
  ];
  const collectionStats = [
    { label: 'Cartas', value: cards.length },
    { label: 'Cartas raras+', value: rareCount },
    { label: 'Cartas especiais', value: specialCount },
    { label: 'Conquistas', value: achievementsUnlocked },
  ];
  const clubStats = [
    { label: 'Moedas', value: coins.toLocaleString('pt-BR'), icon: Coins },
    { label: 'Pacotes abertos', value: packsOpened, icon: Package },
    { label: 'Missões concluídas', value: missionsDone, icon: Target },
  ];

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-7 p-4 md:p-6 lg:p-8">
      <section className="relative isolate overflow-hidden rounded-[1.75rem] bg-[#17191f] p-4 text-white shadow-[0_18px_44px_rgba(27,30,39,0.15)] sm:p-6 lg:p-8" aria-labelledby="own-profile-title">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 h-[30rem] w-[30rem] rounded-full border-[42px] border-[#ed1b35]/15" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-[-9rem] left-[28%] h-72 w-72 rotate-45 border border-white/[0.08]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'repeating-linear-gradient(135deg, transparent 0, transparent 30px, rgba(255,255,255,.28) 31px, transparent 32px)' }} />
        <div className="relative z-10 grid gap-6 xl:grid-cols-[minmax(280px,0.82fr)_minmax(0,1.18fr)] xl:gap-10">
          <div className="flex flex-col items-center">
            <div className="mb-3 flex w-full max-w-[19rem] items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/55">Sua carta em destaque</span>
              {featuredCard && (
                <span className="rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-white/70">
                  OVR {featuredCard.overall} · {RARITY_META[featuredCard.rarity]?.label ?? featuredCard.rarity}
                </span>
              )}
            </div>
            {featuredCard ? (
              <>
                <div className="relative w-full max-w-[19rem] rounded-2xl border border-white/10 bg-[radial-gradient(ellipse_at_50%_42%,rgba(237,27,53,0.22),rgba(255,255,255,0.035)_52%,transparent_72%)] p-3 sm:p-4">
                  <Card card={featuredCard} size="fluid" onClick={() => openCardViewer(featuredCard)} />
                </div>
                <p className="mt-3 inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.13em] text-white/55">
                  <Activity className="h-3.5 w-3.5 text-[#ff8290]" /> Clique para visualizar em 3D
                </p>
              </>
            ) : (
              <div className="flex min-h-[22rem] w-full max-w-[19rem] flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.04] px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.08] text-white/55"><Shield className="h-6 w-6" /></div>
                <p className="mt-4 text-sm font-bold text-white">Nenhuma carta disponível</p>
                <p className="mt-1 text-xs text-white/50">Sua carta principal aparecerá aqui quando fizer parte da coleção.</p>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col justify-center py-1 sm:py-3">
            <div className="mb-5 flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/15 bg-white/[0.08] text-xl font-black uppercase text-white shadow-lg sm:h-20 sm:w-20">
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt={`Avatar de ${profile.name || 'jogador'}`} className="h-full w-full object-cover" />
                  : (profile?.name || 'J').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff8290]">Meu perfil · ficha do jogador</p>
                <h1 id="own-profile-title" className="break-words text-3xl font-black uppercase leading-[0.92] tracking-tight text-white sm:text-4xl lg:text-5xl">{profile?.name || 'Jogador'}</h1>
              </div>
              {!editing && (
                <button type="button" onClick={() => { setAccountMsg(''); setEditing(true); }} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-3 text-xs font-bold text-white transition hover:bg-white/[0.12]">
                  <Pencil className="h-3.5 w-3.5" /> Editar perfil
                </button>
              )}
            </div>

            {editing && (
              <div className="mb-5 space-y-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <label className="block space-y-1 text-[9px] font-black uppercase tracking-[0.13em] text-white/55">
                  Nome
                  <input value={draftName} onChange={event => setDraftName(event.target.value)} placeholder="Nome" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-white placeholder:text-white/35" />
                </label>
                <label className="block space-y-1 text-[9px] font-black uppercase tracking-[0.13em] text-white/55">
                  URL do avatar
                  <input value={draftAvatar} onChange={event => setDraftAvatar(event.target.value)} placeholder="URL do avatar" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-white placeholder:text-white/35" />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void handleSaveProfile()} disabled={saving} className="inline-flex min-h-10 items-center rounded-xl bg-[var(--red)] px-4 text-xs font-black uppercase tracking-wide text-white disabled:opacity-60">
                    {saving ? 'Salvando...' : 'Salvar alterações'}
                  </button>
                  <button type="button" onClick={() => { setEditing(false); setDraftName(profile?.name || ''); setDraftAvatar(profile?.avatar_url || ''); }} className="inline-flex min-h-10 items-center rounded-xl border border-white/15 px-4 text-xs font-bold text-white/75 transition hover:bg-white/[0.08]">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 sm:p-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/45">Nível do jogador</p>
                  <p className="mt-1 text-4xl font-black leading-none tabular-nums text-white sm:text-5xl">{level}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black uppercase tracking-[0.15em] text-white/45">Experiência total</p>
                  <p className="mt-1 text-lg font-black tabular-nums text-white">{xp.toLocaleString('pt-BR')} <span className="text-xs font-bold text-white/50">XP</span></p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Progresso de XP para o próximo nível" aria-valuemin={0} aria-valuemax={500} aria-valuenow={levelXp}>
                <div className="h-full rounded-full bg-gradient-to-r from-[#ed1b35] to-[#ff7887] transition-[width] duration-500" style={{ width: `${xpProgress}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-[9px] font-semibold tabular-nums text-white/50">
                <span>{levelXp.toLocaleString('pt-BR')} / 500 XP no nível</span>
                <span>{Math.round(xpProgress)}%</span>
              </div>
            </div>
            {accountMsg && <p role="status" aria-live="polite" className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs font-semibold text-white/85">{accountMsg}</p>}
          </div>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="own-profile-stats-title">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Números da trajetória</p>
          <h2 id="own-profile-stats-title" className="mt-1 text-xl font-black uppercase tracking-tight text-[var(--text)] sm:text-2xl">Estatísticas</h2>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#17191f] text-white shadow-sm">
          <div className="border-b border-white/10 px-4 py-2.5 text-[8px] font-black uppercase tracking-[0.2em] text-white/45">Performance</div>
          <div className="grid grid-cols-2 divide-x divide-y divide-white/10 sm:grid-cols-4 sm:divide-y-0">
            {performanceStats.map(stat => (
              <div key={stat.label} className="px-4 py-4 sm:px-5 sm:py-5">
                <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/45">{stat.label}</p>
                <p className="mt-2 text-3xl font-black leading-none tabular-nums sm:text-4xl">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
          <div className="border-b border-[var(--border)] px-4 py-2.5 text-[8px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Coleção e conquistas</div>
          <div className="grid grid-cols-2 divide-x divide-y divide-[var(--border)] sm:grid-cols-4 sm:divide-y-0">
            {collectionStats.map((stat, index) => (
              <div key={stat.label} className="relative px-4 py-4 sm:px-5 sm:py-5">
                {index === 0 && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-[var(--red)]" />}
                <p className="text-[8px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">{stat.label}</p>
                <p className="mt-2 text-3xl font-black leading-none tabular-nums text-[var(--text)] sm:text-4xl">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {clubStats.map(stat => (
            <div key={stat.label} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--soft)] text-[var(--red)]"><stat.icon className="h-5 w-5" /></div>
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">{stat.label}</p>
                <p className="mt-0.5 text-lg font-black tabular-nums text-[var(--text)]">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="own-squad-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Identidade tática</p>
            <h2 id="own-squad-title" className="mt-1 text-xl font-black uppercase tracking-tight text-[var(--text)] sm:text-2xl">Elenco atual</h2>
          </div>
          <span className="rounded-lg bg-white px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">Formação {formation}</span>
        </div>
        <div className="grid items-center gap-5 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_minmax(240px,0.7fr)] md:p-6 lg:gap-8">
          <div className="mx-auto w-full max-w-[36rem] rounded-[1.35rem] border border-[#dfe8df] bg-[#eef4ef] p-1.5 shadow-inner">
            <div className="relative isolate aspect-[4/5] w-full overflow-hidden rounded-[1rem] border border-white/70 bg-[linear-gradient(140deg,#348550_0%,#277743_48%,#21683b_100%)] shadow-[inset_0_0_45px_rgba(9,42,21,0.22)]" role="group" aria-label={`Seu elenco, formação ${formation}`}>
              <div aria-hidden="true" className="pointer-events-none absolute inset-[3.2%] rounded-[1rem] border border-white/70" />
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-[3.2%] top-1/2 border-t border-white/65" />
              <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[29%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/65" />
              <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
              <div aria-hidden="true" className="pointer-events-none absolute left-[31%] top-[3.2%] h-[9%] w-[38%] rounded-b-[18%] border border-t-0 border-white/65" />
              <div aria-hidden="true" className="pointer-events-none absolute bottom-[3.2%] left-[31%] h-[9%] w-[38%] rounded-t-[18%] border border-b-0 border-white/65" />
              <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[1.7%] -translate-x-1/2 text-[7px] font-black tracking-[0.22em] text-white/60 sm:text-[9px]">FUTSENAI · FUTSAL</span>
              {squad.starters.map((slot, index) => {
                const point = coordinates[index] ?? { x: 50, y: 50 };
                const position = FS[formation]?.[index] ?? slot.position;
                const positionLabel = POSITION_LABELS[position] ?? position;
                const card = slot.uid ? cardsByUid.get(slot.uid) : undefined;
                return (
                  <div key={`${slot.position}-${index}`} className="absolute z-10 w-[19%] max-w-[112px]" style={{ left: `${point.x}%`, top: `${point.y}%`, transform: 'translate(-50%, -50%)' }}>
                    <span className="mb-1 block rounded bg-[#202a23]/90 px-1 py-1 text-center text-[7px] font-black tracking-[0.08em] text-white shadow sm:text-[9px]">{positionLabel}</span>
                    {card ? (
                      <Card card={card} size="fluid" onClick={() => openCardViewer(card)} />
                    ) : (
                      <div className="flex aspect-[7/10] w-full flex-col items-center justify-center rounded-lg border border-dashed border-white/60 bg-white/[0.12] text-center text-white/80">
                        <span className="text-[8px] font-black uppercase tracking-wide sm:text-[10px]">{positionLabel}</span>
                        <span className="mt-1 text-[6px] font-semibold uppercase tracking-wide text-white/55 sm:text-[8px]">Vazio</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--soft)] text-[var(--red)]"><Users className="h-5 w-5" /></div>
            <h3 className="text-lg font-black text-[var(--text)]">Formação {formation}</h3>
            <p className="text-sm leading-6 text-[var(--muted)]">Suas cartas titulares aparecem no campo. Selecione uma carta para abrir a visualização 3D.</p>
            <p className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.12em] text-[var(--red)]">
              <Activity className="h-4 w-4" /> {squad.starters.filter(slot => slot.uid).length} atletas escalados
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="own-collection-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Suas cartas</p>
            <h2 id="own-collection-title" className="mt-1 text-xl font-black uppercase tracking-tight text-[var(--text)] sm:text-2xl">Coleção <span className="text-[var(--red)]">({cards.length})</span></h2>
          </div>
          {cards.length > 0 && <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--muted)]">Clique em uma carta para visualizar em 3D</span>}
        </div>
        {cards.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {cards.slice(0, 24).map(card => (
              <div key={card.uid} className="mx-auto w-full min-w-0 max-w-[12rem] rounded-2xl border border-[var(--border)] bg-white p-1.5 shadow-sm transition hover:-translate-y-1 hover:shadow-md motion-reduce:transform-none">
                <Card card={card} size="fluid" onClick={() => openCardViewer(card)} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border)] bg-white px-5 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--muted)]"><Shield className="h-5 w-5" /></div>
            <div>
              <h3 className="text-base font-black text-[var(--text)]">Coleção vazia</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">Nenhuma carta disponível para exibir.</p>
            </div>
          </div>
        )}
      </section>

      {achievementsUnlocked > 0 && (
        <section className="space-y-3" aria-labelledby="own-achievements-title">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Marcos da carreira</p>
            <h2 id="own-achievements-title" className="mt-1 text-lg font-black uppercase tracking-tight text-[var(--text)]">Conquistas</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {achievements.filter(achievement => achievement.unlocked).map(achievement => (
              <span key={achievement.id} className="inline-flex items-center gap-2 rounded-xl border border-[#e4c66b]/35 bg-[#fff9e8] px-3 py-2 text-xs font-bold text-[#705312]">
                <Award className="h-4 w-4 text-[#b58a25]" />
                {achievement.title}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4" aria-labelledby="account-security-title">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Acesso e proteção</p>
          <h2 id="account-security-title" className="mt-1 text-xl font-black uppercase tracking-tight text-[var(--text)] sm:text-2xl">Conta e segurança</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm sm:p-5">
            <h3 className="text-sm font-black text-[var(--text)]">Dados de acesso</h3>
            <input value={newEmail} onChange={event => setNewEmail(event.target.value)} type="email" placeholder="Novo email" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm" />
            <button type="button" onClick={() => void handleChangeEmail()} disabled={saving} className="w-full rounded-xl bg-[var(--red)] py-2.5 text-sm font-bold text-white disabled:opacity-60">Alterar email</button>
            <input value={newPassword} onChange={event => setNewPassword(event.target.value)} type="password" placeholder="Nova senha" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm" />
            <button type="button" onClick={() => void handleChangePassword()} disabled={saving} className="w-full rounded-xl border border-[var(--border)] bg-white py-2.5 text-sm font-bold text-[var(--text)] disabled:opacity-60">Alterar senha</button>
            {accountMsg && <p role="status" aria-live="polite" className="text-xs font-semibold text-[var(--muted)]">{accountMsg}</p>}
          </div>
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm sm:p-5">
            <div>
              <h3 className="text-sm font-black text-[var(--text)]">Ações da conta</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">Gerencie sua sessão ou solicite a exclusão da conta.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => void handleLogout()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border)] px-4 text-sm font-bold text-[var(--text)] transition hover:bg-[var(--bg)]">
                <LogOut className="h-4 w-4" /> Sair
              </button>
              <button type="button" onClick={handleDeleteAccount} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-60">
                <Trash2 className="h-4 w-4" /> Excluir conta
              </button>
            </div>
          </div>
        </div>
      </section>

      {cardViewer}
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
