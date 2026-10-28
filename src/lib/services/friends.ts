import { supabase } from '../supabase';

export interface FriendUser {
  id: string;
  name: string;
  avatar_url?: string;
  online?: boolean;
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

export async function searchUsers(query: string, currentUserId: string): Promise<FriendUser[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .ilike('name', `%${query}%`)
    .neq('id', currentUserId)
    .limit(20);
  if (error) return [];
  return (data || []).map((u: any) => ({ id: u.id, name: u.name, avatar_url: u.avatar_url }));
}

export async function getFriends(userId: string): Promise<FriendUser[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  if (error) return [];
  const friendIds = (data || []).map((f: any) => f.requester_id === userId ? f.addressee_id : f.requester_id);
  if (friendIds.length === 0) return [];
  const { data: profiles } = await supabase.from('profiles').select('id, name, avatar_url').in('id', friendIds);
  return (profiles || []).map((u: any) => ({ id: u.id, name: u.name, avatar_url: u.avatar_url }));
}

export async function getPendingReceived(userId: string): Promise<{ friendship: Friendship; user: FriendUser }[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .eq('addressee_id', userId)
    .eq('status', 'pending');
  if (error) return [];
  const requesterIds = (data || []).map((f: any) => f.requester_id);
  if (requesterIds.length === 0) return [];
  const { data: profiles } = await supabase.from('profiles').select('id, name, avatar_url').in('id', requesterIds);
  const profileMap = new Map((profiles || []).map((u: any) => [u.id, u]));
  return (data || []).map((f: any) => ({
    friendship: f,
    user: { id: f.requester_id, name: profileMap.get(f.requester_id)?.name || 'Usuário', avatar_url: profileMap.get(f.requester_id)?.avatar_url },
  }));
}

export async function getPendingSent(userId: string): Promise<{ friendship: Friendship; user: FriendUser }[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .eq('requester_id', userId)
    .eq('status', 'pending');
  if (error) return [];
  const addresseeIds = (data || []).map((f: any) => f.addressee_id);
  if (addresseeIds.length === 0) return [];
  const { data: profiles } = await supabase.from('profiles').select('id, name, avatar_url').in('id', addresseeIds);
  const profileMap = new Map((profiles || []).map((u: any) => [u.id, u]));
  return (data || []).map((f: any) => ({
    friendship: f,
    user: { id: f.addressee_id, name: profileMap.get(f.addressee_id)?.name || 'Usuário', avatar_url: profileMap.get(f.addressee_id)?.avatar_url },
  }));
}

export async function sendRequest(requesterId: string, addresseeId: string): Promise<boolean> {
  if (!supabase || requesterId === addresseeId) return false;
  // check existing
  const { data: existing } = await supabase
    .from('friendships')
    .select('id')
    .or(`and(requester_id.eq.${requesterId},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${requesterId})`);
  if (existing && existing.length > 0) return false;
  const { error } = await supabase.from('friendships').insert({ requester_id: requesterId, addressee_id: addresseeId, status: 'pending' });
  return !error;
}

export async function acceptRequest(friendshipId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('friendships').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', friendshipId);
  return !error;
}

export async function rejectRequest(friendshipId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  return !error;
}

export async function cancelRequest(friendshipId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  return !error;
}

export async function removeFriend(friendshipId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  return !error;
}

export function subscribeFriends(userId: string, onChange: () => void) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel('friends-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, (payload: any) => {
      const row = payload.new || payload.old;
      if (row && (row.requester_id === userId || row.addressee_id === userId)) {
        onChange();
      }
    })
    .subscribe();
  return () => { if (supabase) supabase.removeChannel(channel); };
}
