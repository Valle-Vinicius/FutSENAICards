import { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, RefreshCw, Search, ShieldCheck, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { countActiveAdminUsers, isAdminUserOnline, sortAdminUsers, type AdminUserSummary } from '../lib/adminUsers';

type AdminUser = AdminUserSummary;

type UserEditForm = {
  name: string;
  coins: string;
  xp: string;
  rankedElo: string;
  poolElo: string;
};

const numberFormat = new Intl.NumberFormat('pt-BR');

function toEditForm(user: AdminUser): UserEditForm {
  return {
    name: user.name ?? '',
    coins: String(user.coins),
    xp: String(user.xp),
    rankedElo: String(user.ranked_elo),
    poolElo: String(user.pool_elo),
  };
}

function formattedDate(value: string | null): string {
  if (!value) return 'Nunca visto';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export default function AdminUsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState('CONNECTING');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [highlightedUsers, setHighlightedUsers] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<UserEditForm | null>(null);
  const [, setPresenceTick] = useState(0);
  const debounceRef = useRef<number | null>(null);
  const highlightTimersRef = useRef<Record<string, number>>({});

  const refreshUsers = useCallback(async (showLoading = false) => {
    if (!supabase) {
      setError('Conexão com o servidor indisponível.');
      setLoading(false);
      return;
    }

    if (showLoading) setRefreshing(true);
    try {
      const { data, error: requestError } = await supabase.rpc('admin_list_users');
      if (requestError) throw requestError;
      setUsers((data ?? []) as AdminUser[]);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Erro inesperado ao carregar usuários.';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setPresenceTick(value => value + 1), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void refreshUsers();

    if (!supabase) return;
    const client = supabase;
    const highlightTimers = highlightTimersRef.current;
    const channel = client
      .channel('admin-users', { config: { private: true } })
      .on('broadcast', { event: 'user-updated' }, message => {
        const userId = (message.payload as { user_id?: string } | null)?.user_id;
        if (userId) {
          setHighlightedUsers(current => ({ ...current, [userId]: true }));
          const previousTimer = highlightTimersRef.current[userId];
          if (previousTimer) window.clearTimeout(previousTimer);
          highlightTimersRef.current[userId] = window.setTimeout(() => {
            setHighlightedUsers(current => {
              const next = { ...current };
              delete next[userId];
              return next;
            });
            delete highlightTimersRef.current[userId];
          }, 1200);
        }

        if (debounceRef.current) window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => {
          void refreshUsers();
          debounceRef.current = null;
        }, 300);
      })
      .subscribe(status => {
        setRealtimeStatus(status);
        if (status === 'SUBSCRIBED') void refreshUsers();
      });

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      Object.values(highlightTimers).forEach(window.clearTimeout);
      void client.removeChannel(channel);
    };
  }, [refreshUsers]);

  const activeCount = countActiveAdminUsers(users);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleUsers = sortAdminUsers(users
    .filter(user => !normalizedQuery
      || (user.name ?? '').toLocaleLowerCase().includes(normalizedQuery)
      || user.user_id.toLocaleLowerCase().includes(normalizedQuery)));
  const selectedUser = users.find(user => user.user_id === selectedId) ?? null;

  const selectUser = (user: AdminUser) => {
    setSelectedId(user.user_id);
    setForm(toEditForm(user));
    setEditing(false);
  };

  const saveUser = async () => {
    if (!supabase || !selectedUser || !form) return;
    const name = form.name.trim();
    const values = [form.coins, form.xp, form.rankedElo, form.poolElo].map(Number);
    if (!name || name.length > 80) {
      setError('O nome deve ter entre 1 e 80 caracteres.');
      return;
    }
    if (values.some(value => !Number.isSafeInteger(value) || value < 0)
      || values[0] > 2_000_000_000
      || values[1] > 2_000_000_000
      || values[2] > 10_000
      || values[3] > 10_000) {
      setError('Use inteiros válidos: moedas/XP até 2 bilhões e cada elo entre 0 e 10.000.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { error: saveError } = await supabase.rpc('admin_update_user_stats', {
        p_user_id: selectedUser.user_id,
        p_name: name,
        p_coins: values[0],
        p_xp: values[1],
        p_ranked_elo: values[2],
        p_pool_elo: values[3],
      });
      if (saveError) throw saveError;
      setEditing(false);
      await refreshUsers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar as alterações.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'h-10 w-full rounded-lg border border-[#E2E4EA] bg-white px-3 text-sm text-[#252733] outline-none transition focus:border-[#E30613] focus:ring-4 focus:ring-[#E30613]/10';

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#E9EAF0] bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-[#687080]"><Users className="size-4" /> Usuários cadastrados</div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-[#252733]">{numberFormat.format(users.length)}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-sm text-emerald-800"><span className="size-2.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" /> Ativos agora</div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-emerald-900">{numberFormat.format(activeCount)}</div>
          <div className="mt-1 text-xs text-emerald-800/80">Atividade nos últimos 2 minutos</div>
        </div>
        <div className="flex flex-col justify-center rounded-2xl border border-[#E9EAF0] bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#252733]">
            <ShieldCheck className={`size-4 ${realtimeStatus === 'SUBSCRIBED' ? 'text-emerald-600' : 'text-amber-600'}`} />
            {realtimeStatus === 'SUBSCRIBED'
              ? 'Atualização em tempo real ativa'
              : ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(realtimeStatus)
                ? 'Tempo real indisponível · use Atualizar'
                : 'Conectando ao tempo real…'}
          </div>
          <div className="mt-1 text-xs text-[#687080]">{lastUpdated ? `Atualizado às ${formattedDate(lastUpdated)}` : 'Aguardando primeira atualização'}</div>
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-[#E9EAF0] bg-white">
          <div className="flex flex-col gap-3 border-b border-[#E9EAF0] p-4 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#858A98]" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Buscar por nome ou ID"
                aria-label="Buscar usuários por nome ou ID"
                className={`${inputClass} pl-9`}
              />
            </div>
            <button
              type="button"
              onClick={() => void refreshUsers(true)}
              disabled={refreshing || loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#E2E4EA] bg-white px-3 text-sm font-semibold text-[#252733] transition hover:bg-[#F7F7F9] disabled:opacity-60"
            >
              <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>

          {error && <div role="alert" className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          {loading ? (
            <div className="p-8 text-center text-sm text-[#687080]">Carregando usuários…</div>
          ) : visibleUsers.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#687080]">{query ? 'Nenhum usuário encontrado.' : 'Ainda não há usuários para exibir.'}</div>
          ) : (
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-[#F7F7F9] text-xs uppercase tracking-wide text-[#687080]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Usuário</th>
                    <th className="px-4 py-3 font-semibold">Moedas</th>
                    <th className="px-4 py-3 font-semibold">Cartas</th>
                    <th className="px-4 py-3 font-semibold">Ranked</th>
                    <th className="px-4 py-3 font-semibold">Sinuca</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F1F4]">
                  {visibleUsers.map(user => {
                    const online = isAdminUserOnline(user.last_seen);
                    return (
                      <tr
                        key={user.user_id}
                        onClick={() => selectUser(user)}
                        onKeyDown={event => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            selectUser(user);
                          }
                        }}
                        tabIndex={0}
                        aria-selected={selectedId === user.user_id}
                        className={`cursor-pointer transition-colors duration-700 ease-out hover:bg-[#F7F7F9] ${selectedId === user.user_id ? 'bg-[#FFF5F5]' : ''} ${highlightedUsers[user.user_id] ? 'bg-emerald-50' : ''}`}
                      >
                        <td className="max-w-[260px] px-4 py-3">
                          <div className="truncate font-semibold text-[#252733]">{user.name || 'Sem nome'}</div>
                          <div className="truncate text-xs text-[#858A98]">{user.user_id}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[#252733]">{numberFormat.format(user.coins)}</td>
                        <td className="px-4 py-3 tabular-nums text-[#252733]">{numberFormat.format(user.card_count)}</td>
                        <td className="px-4 py-3 tabular-nums text-[#252733]">{numberFormat.format(user.ranked_elo)}</td>
                        <td className="px-4 py-3 tabular-nums text-[#252733]">{numberFormat.format(user.pool_elo)}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${online ? 'text-emerald-700' : 'text-[#858A98]'}`}>
                            <span className={`size-2 rounded-full ${online ? 'bg-emerald-500 motion-safe:animate-pulse' : 'bg-[#B7BAC4]'}`} />
                            {online ? 'Ativo' : 'Offline'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-[#E9EAF0] bg-white p-4">
          {!selectedUser ? (
            <div className="py-8 text-center text-sm text-[#687080]">Selecione um usuário para ver os detalhes.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-[#252733]">{selectedUser.name || 'Sem nome'}</h2>
                  <p className="break-all text-xs text-[#858A98]">{selectedUser.user_id}</p>
                </div>
                {!editing ? (
                  <button
                    type="button"
                    onClick={() => { setForm(toEditForm(selectedUser)); setEditing(true); setError(null); }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#E30613] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#C9000D]"
                  >
                    <Pencil className="size-3.5" /> Editar
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label="Cancelar edição"
                    onClick={() => { setEditing(false); setForm(toEditForm(selectedUser)); setError(null); }}
                    className="grid size-9 shrink-0 place-items-center rounded-lg border border-[#E2E4EA] text-[#687080] hover:bg-[#F7F7F9]"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              {editing && form ? (
                <div className="space-y-3">
                  {([
                    ['name', 'Nome', 'text'],
                    ['coins', 'Moedas', 'number'],
                    ['xp', 'XP', 'number'],
                    ['rankedElo', 'Elo Ranked', 'number'],
                    ['poolElo', 'Elo Sinuca', 'number'],
                  ] as const).map(([field, label, type]) => (
                    <label key={field} className="block text-xs font-semibold text-[#555B68]">
                      {label}
                      <input
                        type={type}
                        min={type === 'number' ? 0 : undefined}
                        max={field === 'name' ? 80 : field === 'rankedElo' || field === 'poolElo' ? 10000 : 2_000_000_000}
                        maxLength={field === 'name' ? 80 : undefined}
                        value={form[field]}
                        onChange={event => setForm(current => current ? { ...current, [field]: event.target.value } : current)}
                        className={`${inputClass} mt-1`}
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() => void saveUser()}
                    disabled={saving}
                    className="w-full rounded-lg bg-[#E30613] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#C9000D] disabled:opacity-60"
                  >
                    {saving ? 'Salvando…' : 'Salvar alterações'}
                  </button>
                  <p className="text-xs leading-relaxed text-[#858A98]">As alterações são validadas e registradas no servidor. O nível é recalculado a partir do XP.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Metric label="Moedas" value={numberFormat.format(selectedUser.coins)} />
                  <Metric label="XP / nível" value={`${numberFormat.format(selectedUser.xp)} · ${selectedUser.level}`} />
                  <Metric label="Cartas" value={numberFormat.format(selectedUser.card_count)} />
                  <Metric label="Ranked" value={`${numberFormat.format(selectedUser.ranked_elo)} · ${selectedUser.ranked_wins}/${selectedUser.ranked_matches} vitórias/jogos`} />
                  <Metric label="Sinuca" value={`${numberFormat.format(selectedUser.pool_elo)} · ${selectedUser.pool_wins}/${selectedUser.pool_matches} vitórias/jogos`} />
                  <Metric label="Última atividade" value={formattedDate(selectedUser.last_seen)} />
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-[#F7F7F9] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#858A98]">{label}</div>
      <div className="mt-1 break-words font-semibold text-[#252733]">{value}</div>
    </div>
  );
}
