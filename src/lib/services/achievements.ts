import { supabase } from '../supabase';
import type { Achievement } from '../../types';

export async function getAchievements(userId: string): Promise<Achievement[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('achievements').select('*').eq('user_id', userId);
  if (error) {
    console.error('[achievements] load failed', error);
    return null;
  }
  return (data || []).map((a: any) => ({
    id: a.achievement_id,
    title: a.title,
    description: a.description,
    unlocked: a.unlocked,
    unlockedAt: a.unlocked_at ? new Date(a.unlocked_at).getTime() : undefined,
  }));
}

export async function upsertAchievements(userId: string, achievements: Achievement[]): Promise<void> {
  if (!supabase) return;
  const rows = achievements.map(a => ({
    user_id: userId,
    achievement_id: a.id,
    title: a.title,
    description: a.description,
    unlocked: a.unlocked,
    unlocked_at: a.unlockedAt ? new Date(a.unlockedAt).toISOString() : null,
  }));
  await supabase.from('achievements').upsert(rows, { onConflict: 'user_id,achievement_id' });
}

export async function unlockAchievementDb(userId: string, achievementId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('achievements').update({ unlocked: true, unlocked_at: new Date().toISOString() }).eq('user_id', userId).eq('achievement_id', achievementId);
}
