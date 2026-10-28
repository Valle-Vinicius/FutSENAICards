import { supabase } from '../supabase';
import type { PlayerCard } from '../../types';
import { allTemplates } from '../../data/players';

export async function getCards(userId: string): Promise<PlayerCard[]> {
  if (!supabase) return [];
  const all: any[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('cards').select('*').eq('user_id', userId).order('created_at', { ascending: false }).range(from, from + pageSize - 1);
    if (error) break;
    const batch = data || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  const cards = all;
  const migrated: any[] = [];
  for (const c of cards) {
    const schemaVersion = c.schema_version ?? 1;
    if (schemaVersion < 4) {
      const t = allTemplates().find((x: any) => x.name === c.name);
      if (t) {
      const mod = ({ common: 0.88, uncommon: 1.0, rare: 1.05, epic: 1.10, legendary: 1.15, icon: 1.20 } as any)[c.rarity] ?? 1.0;
      const attrs = {
          pace: Math.max(0, Math.min(99, Math.round(t.attributes.pace * mod))),
          shooting: Math.max(0, Math.min(99, Math.round(t.attributes.shooting * mod))),
          passing: Math.max(0, Math.min(99, Math.round(t.attributes.passing * mod))),
          dribbling: Math.max(0, Math.min(99, Math.round(t.attributes.dribbling * mod))),
          defending: Math.max(0, Math.min(99, Math.round(t.attributes.defending * mod))),
          physical: Math.max(0, Math.min(99, Math.round(t.attributes.physical * mod))),
        };
        const gk = t.gkAttributes ? {
          reflexes: Math.max(0, Math.min(99, Math.round(t.gkAttributes.reflexes * mod))),
          positioning: Math.max(0, Math.min(99, Math.round(t.gkAttributes.positioning * mod))),
          handling: Math.max(0, Math.min(99, Math.round(t.gkAttributes.handling * mod))),
        } : null;
        const overall = Math.min(99, (t.baseOverall ?? c.overall) + (({ common: -2, uncommon: 0, rare: 2, epic: 4, legendary: 6, icon: 8 } as any)[c.rarity] ?? 0) + (({ none: 0, totw: 2, potm: 2, revelation: 1, legend: 3, futsal: 2 } as any)[c.special] ?? 0));
        const payload: any = { ...attrs, ...(gk || {}), overall, schema_version: 4 };
        await supabase!.from('cards').update(payload).eq('id', c.id);
        migrated.push({ ...c, ...attrs, ...(gk || {}), overall, schema_version: 4 });
      } else {
        migrated.push(c);
      }
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
    schema_version: 4,
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
