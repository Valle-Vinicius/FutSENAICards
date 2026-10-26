import { supabase } from '../supabase';

export interface SettingsRecord {
  audio: boolean;
  animations: boolean;
  highContrast: boolean;
}

export async function getSettings(userId: string): Promise<SettingsRecord | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('profiles').select('preferences').eq('id', userId).single();
  if (error) return null;
  const prefs = data?.preferences || {};
  return {
    audio: prefs.audio ?? true,
    animations: prefs.animations ?? true,
    highContrast: prefs.highContrast ?? false,
  };
}

export async function updateSettings(userId: string, settings: Partial<SettingsRecord>): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.from('profiles').select('preferences').eq('id', userId).single();
  const prefs = data?.preferences || {};
  await supabase.from('profiles').update({ preferences: { ...prefs, ...settings } }).eq('id', userId);
}
