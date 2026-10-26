import { supabase } from '../supabase';
import type { Mission } from '../../types';

export async function getMissions(userId: string): Promise<Mission[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('missions').select('*').eq('user_id', userId);
  if (error) return [];
  return (data || []).map((m: any) => ({
    id: m.mission_id,
    title: m.title,
    description: m.description,
    target: m.target,
    progress: m.progress,
    reward: m.reward,
    rewardXp: m.reward_xp,
    type: m.type,
    completed: m.completed,
    claimed: m.claimed,
    special: false,
  }));
}

export async function upsertMission(userId: string, mission: Mission): Promise<void> {
  if (!supabase) return;
  await supabase.from('missions').upsert({
    user_id: userId,
    mission_id: mission.id,
    title: mission.title,
    description: mission.description,
    target: mission.target,
    progress: mission.progress,
    reward: mission.reward,
    reward_xp: mission.rewardXp,
    type: mission.type,
    completed: mission.completed,
    claimed: mission.claimed,
  }, { onConflict: 'user_id,mission_id' });
}

export async function upsertMissions(userId: string, missions: Mission[]): Promise<void> {
  if (!supabase) return;
  const rows = missions.map(m => ({
    user_id: userId,
    mission_id: m.id,
    title: m.title,
    description: m.description,
    target: m.target,
    progress: m.progress,
    reward: m.reward,
    reward_xp: m.rewardXp,
    type: m.type,
    completed: m.completed,
    claimed: m.claimed,
  }));
  await supabase.from('missions').upsert(rows, { onConflict: 'user_id,mission_id' });
}

export async function claimMissionDb(userId: string, missionId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('missions').update({ claimed: true }).eq('user_id', userId).eq('mission_id', missionId);
}
