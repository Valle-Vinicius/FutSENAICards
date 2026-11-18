import { supabase } from '../supabase';

export type ChangelogCategory = 'novo' | 'melhoria' | 'correcao' | 'seguranca' | 'balanceamento';

export interface ChangelogEntry {
  id: string;
  version: string;
  title: string;
  body: string;
  category: ChangelogCategory;
  published_at: string;
}

export type ChangelogCursor = Pick<ChangelogEntry, 'id' | 'published_at'>;

export interface ListChangelogOptions {
  limit: number;
  before?: ChangelogCursor;
}

export interface SaveChangelogEntry {
  id?: string | null;
  version: string;
  title: string;
  body: string;
  category: ChangelogCategory;
  published_at: string | null;
}

export async function listChangelog({ limit, before }: ListChangelogOptions): Promise<ChangelogEntry[]> {
  if (!supabase) return [];

  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  let query = supabase
    .from('changelog_entries')
    .select('id, version, title, body, category, published_at')
    .order('published_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(safeLimit);

  if (before) {
    query = query.or(
      `published_at.lt.${before.published_at},and(published_at.eq.${before.published_at},id.lt.${before.id})`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ChangelogEntry[];
}

export function subscribeChangelog(onChange: () => void): () => void {
  if (!supabase) return () => undefined;

  const channel = supabase
    .channel(`public-changelog-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'changelog_entries' }, onChange)
    .subscribe();

  return () => {
    if (supabase) void supabase.removeChannel(channel);
  };
}

export async function adminSaveChangelogEntry(entry: SaveChangelogEntry): Promise<string> {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { data, error } = await supabase.rpc('admin_save_changelog_entry', {
    p_id: entry.id ?? null,
    p_version: entry.version,
    p_title: entry.title,
    p_body: entry.body,
    p_category: entry.category,
    p_published_at: entry.published_at,
  });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('O servidor não retornou o identificador do registro.');
  return data;
}

export async function adminDeleteChangelogEntry(id: string): Promise<boolean> {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { data, error } = await supabase.rpc('admin_delete_changelog_entry', { p_id: id });
  if (error) throw error;
  return data === true;
}
