import { supabase } from '../supabase';
import type { PlayerCard } from '../../types';
import { allTemplates, getPlayerImage, applyTemplateToCard } from '../../data/players';

const CARD_PAGE_SIZE = 1000;
const CARD_COLUMNS =
  'id,player_id,name,position,sport,nationality,age,club,rarity,edition,special,overall,pace,shooting,passing,dribbling,defending,physical,reflexes,positioning,handling,extra_stats,xp,evo_points,upgrades,evolution_log,season_stats,image,favorite,is_new,obtained_at,schema_version,created_at';

export async function getCards(userId: string): Promise<PlayerCard[] | null> {
  if (!supabase) return null;
  const all: any[] = [];
  let cursor: { createdAt: string | null; id: string } | null = null;
  let pastNullTimestamps = false;

  while (true) {
    let query = supabase
      .from('cards')
      .select(CARD_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false, nullsFirst: true })
      .order('id', { ascending: true })
      .limit(CARD_PAGE_SIZE);

    if (cursor?.createdAt === null) {
      query = query.is('created_at', null).gt('id', cursor.id);
    } else if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`,
      );
    } else if (pastNullTimestamps) {
      query = query.not('created_at', 'is', null);
    }

    const { data, error } = await query;
    // erro no meio da paginação: devolve null (e não uma lista parcial como se fosse completa)
    if (error) {
      console.error('[cards] getCards failed', error);
      return null;
    }
    const batch = data || [];
    all.push(...batch);

    if (cursor?.createdAt === null && batch.length < CARD_PAGE_SIZE) {
      cursor = null;
      pastNullTimestamps = true;
      continue;
    }

    if (batch.length < CARD_PAGE_SIZE) break;
    const lastCard = batch[batch.length - 1];
    cursor = { createdAt: lastCard.created_at, id: lastCard.id };
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