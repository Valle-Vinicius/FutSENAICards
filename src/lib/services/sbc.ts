import { supabase } from '../supabase';

export interface SBCCompletionRecord {
  sbcId: string;
  createdAt: string;
}

export async function recordSBCCompletion(userId: string, sbcId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('sbc_completions').insert({ user_id: userId, sbc_id: sbcId });
}

export async function getSBCCompletions(userId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('sbc_completions').select('sbc_id').eq('user_id', userId);
  if (error) throw error;
  return (data || []).map((r: any) => r.sbc_id);
}

export async function getSBCCompletionHistory(userId: string): Promise<SBCCompletionRecord[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('sbc_completions')
    .select('sbc_id, created_at')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map((record: any) => ({
    sbcId: record.sbc_id,
    createdAt: record.created_at,
  }));
}
