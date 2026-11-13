import { supabase } from '../supabase';
import type { PlayerCard } from '../../types';
import { allTemplates, getPlayerImage, applyTemplateToCard } from '../../data/players';

export async function getCards(userId: string): Promise<PlayerCard[] | null> {
  if (!supabase) return null;
  const all: any[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('cards').select('*').eq('user_id', userId).order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, from + pageSize - 1);
    // erro no meio da paginação: devolve null (e não uma lista parcial como se fosse completa)
    if (error) {
      console.error('[cards] getCards failed', error);
      return null;
    }
    const batch = data || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all.map((c: any) => {
    const card: PlayerCard = {
      uid: c.id,
      playerId: c.player_id,
      name: c.name,
      position: c.position,
      sport: c.sport,
      nationality: c.nationality ?? 'Brasil',
      age: c.age ?? 20,
      club: c.club ?? 'Clube',
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
      extraStats: c.extra_stats ?? undefined,
      xp: c.xp,
      evoPoints: c.evo_points,
      upgrades: c.upgrades,
      evolutionLog: c.evolution_log,
      seasonStats: c.season_stats,
      image: getPlayerImage(c.name) || c.image,
      favorite: c.favorite,
      isNew: c.is_new,
      obtainedAt: new Date(c.obtained_at).getTime(),
      schemaVersion: c.schema_version,
    };
    // cartas de versões antigas do schema: recalcula em memória a partir do template
    // (não escreve no banco dentro de uma função de leitura)
    if ((c.schema_version ?? 1) < 4) {
      const t = allTemplates().find((x: any) => x.name === c.name);
      if (t) return applyTemplateToCard(card, t);
    }
    return card;
  });
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
    extra_stats: card.extraStats ?? [],
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
  // a tabela `cards` não aceita UPDATE direto do cliente (revoke na migration restrict_rls);
  // favorito e "vista" passam por RPCs (ver migration 20261107070000)
  let ok = true;
  if (updates.favorite !== undefined) {
    const { error } = await supabase.rpc('set_card_favorite', { p_card_id: cardId, p_favorite: updates.favorite });
    if (error) ok = false;
  }
  if (updates.isNew === false) {
    const { error } = await supabase.rpc('mark_cards_seen', { p_card_ids: [cardId] });
    if (error) ok = false;
  }
  return ok ? { id: cardId } : null;
}

export async function deleteCard(cardId: string) {
  if (!supabase) return false;
  const { error } = await supabase.rpc('delete_owned_cards', { p_card_ids: [cardId] });
  return !error;
}