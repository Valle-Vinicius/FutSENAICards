import { supabase } from '../supabase';

export interface ListingRecord {
  id: string;
  sellerId: string;
  cardUid: string;
  cardName: string;
  cardOverall?: number;
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
  const { data, error } = await supabase.from('listings').select('*, cards(*)').eq('status', 'active').order('created_at', { ascending: false });
  if (error) return [];
  return (data || []).map((l: any) => {
    const c = Array.isArray(l.cards) ? l.cards[0] : l.cards;
    return {
      id: l.id,
      sellerId: l.seller_id,
      cardUid: l.card_id || '',
      cardName: l.card_name || c?.name || 'Carta',
      cardOverall: c?.overall,
      cardPosition: c?.position,
      cardRarity: c?.rarity,
      cardImage: c?.image,
      seller: l.seller_id ? 'user' : 'npc',
      sellerName: l.seller_id ? 'Usuário' : 'NPC',
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
