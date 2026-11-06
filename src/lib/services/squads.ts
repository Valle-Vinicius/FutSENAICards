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
    starters: squad.starters,
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

export async function upsertPrimarySquad(_userId: string, squad: Squad): Promise<boolean> {
  if (!supabase) return false;
  // Atômico no servidor: apaga o principal antigo e grava o novo na mesma transação.
  const { error } = await supabase.rpc('set_primary_squad', {
    p_formation: squad.formation,
    p_starters: squad.starters.map(s => s.uid),
    p_bench: squad.bench,
  });
  if (error) console.error('[squads] set_primary_squad falhou:', error);
  return !error;
}
export async function getSavedSquads(userId: string): Promise<SavedSquad[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('saved_squads').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) return [];
  return (data || []).map((s: any) => {
    const positions = (FS as any)[s.formation] || (FS as any)['1-2-1'];
    const starters = (s.starters || []).map((uid: string | null, i: number) => ({
      position: positions[i] || 'Ala',
      uid: uid || null,
    }));
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