import { supabase } from './supabase';

export interface UserProfile {
  id: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  preferences: Record<string, any> | null;
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) return null;
  return data as UserProfile;
}

export async function updateProfile(userId: string, updates: Partial<Pick<UserProfile, 'name' | 'avatar_url' | 'preferences'>>) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('profiles').update(updates).eq('id', userId).select().single();
  if (error) return null;
  return data as UserProfile;
}
