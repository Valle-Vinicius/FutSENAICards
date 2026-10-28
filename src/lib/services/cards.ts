import { supabase } from '../supabase';
import type { PlayerCard } from '../../types';

export async function getCards(userId: string): Promise<PlayerCard[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('cards').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10000);
  if (error) return [];
  const cards = data || [];
  const migrated: any[] = [];
  for (const c of cards) {
    if ((c.schema_version ?? 1) < 2) {
      // migrate: apply rarity modifier + special bonus
      const mod = ({ common: 0.88, uncommon: 1.0, rare: 1.05, epic: 1.10, legendary: 1.15, icon: 1.20 } as any)[c.rarity] ?? 1.0;
      const bonus = ({ none: 0, totw: 2, potm: 2, revelation: 1, legend: 3, futsal: 2 } as any)[c.special] ?? 0;
      const attrs = {
        pace: Math.max(0, Math.min(99, Math.round(c.pace * mod))),
        shooting: Math.max(0, Math.min(99, Math.round(c.shooting * mod))),
        passing: Math.max(0, Math.min(99, Math.round(c.passing * mod))),
        dribbling: Math.max(0, Math.min(99, Math.round(c.dribbling * mod))),
        defending: Math.max(0, Math.min(99, Math.round(c.defending * mod))),
        physical: Math.max(0, Math.min(99, Math.round(c.physical * mod))),
      };
      const gk = c.reflexes ? {
        reflexes: Math.max(0, Math.min(99, Math.round(c.reflexes * mod))),
        positioning: Math.max(0, Math.min(99, Math.round(c.positioning * mod))),
        handling: Math.max(0, Math.min(99, Math.round(c.handling * mod))),
      } : null;
      // calculate overall with weights
      let overall = 0;
      if (c.position === 'GK') {
        overall = Math.round((gk?.reflexes ?? 50) * 0.30 + (gk?.positioning ?? 50) * 0.25 + (attrs.defending) * 0.20 + (attrs.passing) * 0.10 + (attrs.physical) * 0.10 + (attrs.pace) * 0.05);
      } else if (c.position === 'Fixo') {
        overall = Math.round(attrs.defending * 0.35 + attrs.physical * 0.20 + attrs.passing * 0.20 + attrs.pace * 0.10 + attrs.dribbling * 0.08 + attrs.shooting * 0.07);
      } else if (c.position === 'Ala') {
        overall = Math.round(attrs.pace * 0.25 + attrs.passing * 0.22 + attrs.dribbling * 0.20 + attrs.shooting * 0.13 + attrs.defending * 0.12 + attrs.physical * 0.08);
      } else {
        overall = Math.round(attrs.shooting * 0.32 + attrs.physical * 0.22 + attrs.dribbling * 0.18 + attrs.passing * 0.12 + attrs.pace * 0.10 + attrs.defending * 0.06);
      }
      overall = Math.min(99, overall + bonus);
      // update DB
      await supabase!.from('cards').update({ ...attrs, ...(gk || {}), overall, schema_version: 2 }).eq('id', c.id);
      migrated.push({ ...c, ...attrs, ...(gk || {}), overall, schema_version: 2 });
    } else {
      migrated.push(c);
    }
  }
  return migrated.map((c: any) => ({
    uid: c.id,
    playerId: c.player_id,
    name: c.name,
    position: c.position,
    sport: c.sport,
    rarity: c.rarity,
    edition: c.edition,
    special: c.special,
    overall: c.overall,
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
    overall: card.overall,
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
    schema_version: 2,
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
