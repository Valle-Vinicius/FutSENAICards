import { supabase } from '../supabase';
import { getPlayerImage } from '../data/players';

export interface ListingRecord {
  id: string;
  sellerId: string;
  cardUid: string;
  cardName: string;
  cardOverall?: number;
  cardAttributes?: { pace:number; shooting:number; passing:number; dribbling:number; defending:number; physical:number; reflexes?:number; positioning?:number; handling?:number };
  cardPosition?: string;
  cardRarity?: string;
  cardImage?: string;
  seller?: string;
  sellerName?: string;
  price: number;
  buyNow: number;
  expiresAt: string;
  status: string;
  createdAt: string;
}

export async function getListings(): Promise<ListingRecord[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('listings').select('*, cards(*), profiles:seller_id(name)').eq('status', 'active').order('created_at', { ascending: false });
  if (error) return [];
  return (data || []).map((l: any) => {
    const c = Array.isArray(l.cards) ? l.cards[0] : l.cards;
    const sellerProfile = Array.isArray(l.profiles) ? l.profiles[0] : l.profiles;
    return {
      id: l.id,
      sellerId: l.seller_id,
      cardUid: l.card_id || '',
      cardName: l.card_name || c?.name || 'Carta',
      cardOverall: l.card_overall ?? c?.overall ?? 70,
      cardPosition: l.card_position || c?.position || 'Ala',
      cardRarity: l.card_rarity || c?.rarity || 'common',
      cardImage: getPlayerImage(l.card_name) || l.card_image || c?.image,
      cardAttributes: l.card_attributes || (c ? { pace:c.pace, shooting:c.shooting, passing:c.passing, dribbling:c.dribbling, defending:c.defending, physical:c.physical, reflexes:c.reflexes, positioning:c.positioning, handling:c.handling } : undefined),
      seller: l.seller_id ? 'user' : 'npc',
      sellerName: sellerProfile?.name || (l.seller_id ? 'Usuário' : 'NPC'),
      price: l.price,
      buyNow: l.buy_now,
      expiresAt: l.expires_at,
      status: l.status,
      createdAt: l.created_at,
    };
  });
}

export async function createListing(listing: Omit<ListingRecord, 'id' | 'createdAt'>): Promise<ListingRecord | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('listings').insert({
    seller_id: listing.sellerId,
    card_id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(listing.cardUid) ? listing.cardUid : null,
    card_name: listing.cardName,
    card_overall: listing.cardOverall,
    card_position: listing.cardPosition,
    card_rarity: listing.cardRarity,
    card_image: listing.cardImage,
    card_attributes: listing.cardAttributes,
    price: listing.price,
    buy_now: listing.buyNow,
    expires_at: listing.expiresAt,
    status: listing.status,
  }).select().single();
  if (error) return null;
  return {
    id: data.id,
    sellerId: data.seller_id,
    cardUid: data.card_id,
    cardName: data.card_name,
    cardOverall: data.card_overall,
    cardPosition: data.card_position,
    cardRarity: data.card_rarity,
    cardImage: data.card_image,
    cardAttributes: data.card_attributes,
    price: data.price,
    buyNow: data.buy_now,
    expiresAt: data.expires_at,
    status: data.status,
    createdAt: data.created_at,
  };
}

export async function cancelListing(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('listings').update({ status: 'cancelled' }).eq('id', id);
  return !error;
}

export async function buyListing(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('listings').update({ status: 'sold' }).eq('id', id).eq('status', 'active');
  return !error;
}
