import { supabase } from '../supabase';
import type { Squad, SavedSquad } from '../../types';

import { FORMATIONS_FUTSAL as FS } from '../game';

export async function getSquad(userId: string): Promise<Squad | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('squads').select('*').eq('user_id', userId).eq('is_primary', true).single();
  if (error || !data) return null;
  const positions = (FS as any)[data.formation] || (FS as any)['1-2-1'];
  const starters = (data.starters || []).map((uid: string | null, i: number) => ({
    position: positions[i] || 'Ala',
    uid: uid || null,
  }));
  return {
    sport: 'futsal',
    formation: data.formation,
    starters,
    bench: data.bench || [],
  } as Squad;
}

export async function saveSquad(userId: string, squad: Squad, name = 'Elenco principal'): Promise<SavedSquad | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('saved_squads').insert({
    user_id: userId,
    name,
    formation: squad.formation,
    starters: squad.starters.map(s => s.uid),
    bench: squad.bench,
    is_primary: true,
  }).select().single();
  if (error) return null;
  return {
    id: data.id,
    name: data.name,
    sport: 'futsal',
    formation: data.formation,
    starters: data.starters,
    bench: data.bench,
    createdAt: new Date(data.created_at).getTime(),
    isPrimary: data.is_primary,
  };
}

export async function upsertPrimarySquad(userId: string, squad: Squad): Promise<boolean> {
  if (!supabase) return false;
  // delete existing primary
  await supabase.from('squads').delete().eq('user_id', userId).eq('is_primary', true);
  const { error } = await supabase.from('squads').insert({
    user_id: userId,
    formation: squad.formation,
    starters: squad.starters.map(s => s.uid),
    bench: squad.bench,
    is_primary: true,
  });
  return !error;
}
export async function getSavedSquads(userId: string): Promise<SavedSquad[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('saved_squads').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) return [];
  return (data || []).map((s: any) => {
    const starters = (s.starters || []).map((x: any) => {
      if (typeof x === 'string') return x || null;
      if (x && typeof x === 'object') return x.uid ?? null;
      return null;
    });
    return {
      id: s.id,
      name: s.name,
      sport: 'futsal',
      formation: s.formation,
      starters,
      bench: s.bench,
      createdAt: new Date(s.created_at).getTime(),
      isPrimary: s.is_primary,
    };
  });
}
