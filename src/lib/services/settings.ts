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
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (sessionData.session?.user?.id !== userId) throw new Error('Sessão inválida para atualizar preferências.');
  const { error } = await supabase.rpc('update_user_preferences', { p_patch: settings });
  if (error) throw error;
}
