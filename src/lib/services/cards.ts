import { supabase } from '../supabase';
import type { PlayerCard } from '../../types';

function calcOverall(c: any): number {
  if (c.position === 'GK') {
    return Math.round((c.reflexes ?? 50) * 0.30 + (c.positioning ?? 50) * 0.25 + (c.defending ?? 0) * 0.20 + (c.passing ?? 0) * 0.10 + (c.physical ?? 0) * 0.10 + (c.pace ?? 0) * 0.05);
  }
  if (c.position === 'Fixo') {
    return Math.round((c.defending ?? 0) * 0.35 + (c.physical ?? 0) * 0.20 + (c.passing ?? 0) * 0.20 + (c.pace ?? 0) * 0.10 + (c.dribbling ?? 0) * 0.08 + (c.shooting ?? 0) * 0.07);
  }
  if (c.position === 'Ala') {
    return Math.round((c.pace ?? 0) * 0.25 + (c.passing ?? 0) * 0.22 + (c.dribbling ?? 0) * 0.20 + (c.shooting ?? 0) * 0.13 + (c.defending ?? 0) * 0.12 + (c.physical ?? 0) * 0.08);
  }
  return Math.round((c.shooting ?? 0) * 0.32 + (c.physical ?? 0) * 0.22 + (c.dribbling ?? 0) * 0.18 + (c.passing ?? 0) * 0.12 + (c.pace ?? 0) * 0.10 + (c.defending ?? 0) * 0.06);
}

export async function getCards(userId: string): Promise<PlayerCard[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('cards').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) return [];
  return (data || []).map((c: any) => ({
    uid: c.id,
    playerId: c.player_id,
    name: c.name,
    position: c.position,
    sport: c.sport,
    rarity: c.rarity,
    edition: c.edition,
    special: c.special,
    overall: calcOverall(c),
    pace: c.pace,
    shooting: c.shooting,
    passing: c.passing,
    dribbling: c.dribbling,
    defending: c.defending,
    physical: c.physical,
    reflexes: c.reflexes,
    positioning: c.positioning,
    handling: c.handling,
    xp: c.xp,
    evoPoints: c.evo_points,
    upgrades: c.upgrades,
    evolutionLog: c.evolution_log,
    seasonStats: c.season_stats,
    image: c.image,
    favorite: c.favorite,
    isNew: c.is_new,
    obtainedAt: new Date(c.obtained_at).getTime(),
  })) as PlayerCard[];
}

export async function addCard(userId: string, card: PlayerCard): Promise<PlayerCard | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('cards').insert({
    user_id: userId,
    player_id: card.playerId,
    name: card.name,
    position: card.position,
    sport: card.sport,
    rarity: card.rarity,
    edition: card.edition,
    special: card.special,
    overall: calcOverall(card),
    pace: card.pace,
    shooting: card.shooting,
    passing: card.passing,
    dribbling: card.dribbling,
    defending: card.defending,
    physical: card.physical,
    reflexes: card.reflexes,
    positioning: card.positioning,
    handling: card.handling,
    xp: card.xp,
    evo_points: card.evoPoints,
    upgrades: card.upgrades,
    evolution_log: card.evolutionLog,
    season_stats: card.seasonStats,
    image: card.image,
    favorite: card.favorite,
    is_new: card.isNew,
    obtained_at: new Date(card.obtainedAt).toISOString(),
  }).select().single();
  if (error) return null;
  return { ...card, uid: data.id };
}

export async function updateCard(cardId: string, updates: Partial<PlayerCard>) {
  if (!supabase) return null;
  const payload: any = {};
  if (updates.favorite !== undefined) payload.favorite = updates.favorite;
  if (updates.isNew !== undefined) payload.is_new = updates.isNew;
  if (updates.xp !== undefined) payload.xp = updates.xp;
  if (updates.overall !== undefined) payload.overall = updates.overall;
  const { data, error } = await supabase.from('cards').update(payload).eq('id', cardId).select().single();
  if (error) return null;
  return data;
}

export async function deleteCard(cardId: string) {
  if (!supabase) return false;
  const { error } = await supabase.from('cards').delete().eq('id', cardId);
  return !error;
}
