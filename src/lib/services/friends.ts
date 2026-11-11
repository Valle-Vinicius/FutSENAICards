import { supabase } from '../supabase';

export interface FriendUser {
  id: string;
  name: string;
  avatar_url?: string;
  online?: boolean;
  last_seen?: string;
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

function isOnline(lastSeen?: string): boolean {
  if (!lastSeen) return false;
  const diff = Date.now() - new Date(lastSeen).getTime();
  return diff < 5 * 60 * 1000;
}

async function getVisibleProfiles(): Promise<FriendUser[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_visible_friend_profiles');
  if (error) {
    console.error('visible friend profiles query failed', error);
    return [];
  }
  return (data || []).map((u: any) => ({
    id: u.user_id,
    name: u.name,
    avatar_url: u.avatar_url,
    last_seen: u.last_seen,
    online: isOnline(u.last_seen),
  }));
}

export async function searchUsers(query: string): Promise<FriendUser[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('discover_addable_users', {
    p_search: query.trim() || null,
    p_limit: 50,
    p_offset: 0,
  });
  if (error) throw error;
  return (data || []).map((u: any) => ({
    id: u.user_id,
    name: u.name,
    avatar_url: u.avatar_url,
    last_seen: u.last_seen,
    online: isOnline(u.last_seen),
  }));
}

export async function getAddableUsers(offset = 0): Promise<FriendUser[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('discover_addable_users', {
    p_search: null,
    p_limit: 50,
    p_offset: offset,
  });
  if (error) throw error;
  return (data || []).map((u: any) => ({
    id: u.user_id,
    name: u.name,
    avatar_url: u.avatar_url,
    last_seen: u.last_seen,
    online: isOnline(u.last_seen),
  }));
}

export async function getFriends(userId: string): Promise<FriendUser[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  if (error) {
    console.error('friends list query failed', error);
    return [];
  }
  const friendIds = (data || []).map((f: any) => f.requester_id === userId ? f.addressee_id : f.requester_id);
  if (friendIds.length === 0) return [];
  const profiles = await getVisibleProfiles();
  const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
  return friendIds.map(id => profileMap.get(id)).filter((profile): profile is FriendUser => !!profile);
}

export async function getPendingReceived(userId: string): Promise<{ friendship: Friendship; user: FriendUser }[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .eq('addressee_id', userId)
    .eq('status', 'pending');
  if (error) {
    console.error('received friend requests query failed', error);
    return [];
  }
  const requesterIds = (data || []).map((f: any) => f.requester_id);
  if (requesterIds.length === 0) return [];
  const profiles = await getVisibleProfiles();
  const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
  return (data || []).map((f: any) => ({
    friendship: f,
    user: profileMap.get(f.requester_id) ?? { id: f.requester_id, name: 'Usuário' },
  }));
}

export async function getPendingSent(userId: string): Promise<{ friendship: Friendship; user: FriendUser }[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .eq('requester_id', userId)
    .eq('status', 'pending');
  if (error) {
    console.error('sent friend requests query failed', error);
    return [];
  }
  const addresseeIds = (data || []).map((f: any) => f.addressee_id);
  if (addresseeIds.length === 0) return [];
  const profiles = await getVisibleProfiles();
  const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
  return (data || []).map((f: any) => ({
    friendship: f,
    user: profileMap.get(f.addressee_id) ?? { id: f.addressee_id, name: 'Usuário' },
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
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (sessionError || !userId) return false;
  const { data, error } = await supabase.from('friendships')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', friendshipId)
    .eq('addressee_id', userId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  return !error && data !== null;
}

export async function rejectRequest(friendshipId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (sessionError || !userId) return false;
  const { data, error } = await supabase.from('friendships')
    .delete()
    .eq('id', friendshipId)
    .eq('addressee_id', userId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  return !error && data !== null;
}

export async function cancelRequest(friendshipId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (sessionError || !userId) return false;
  const { data, error } = await supabase.from('friendships')
    .delete()
    .eq('id', friendshipId)
    .eq('requester_id', userId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  return !error && data !== null;
}

export async function removeFriend(friendshipId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (sessionError || !userId) return false;
  const { data, error } = await supabase.from('friendships')
    .delete()
    .eq('id', friendshipId)
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .select('id')
    .maybeSingle();
  return !error && data !== null;
}

export function subscribeFriends(userId: string, onChange: () => void) {
  if (!supabase) return () => {};
  const channelName = `friends-changes-${userId}-${Math.random().toString(36).slice(2)}`;
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, (payload: any) => {
      const row = payload.new || payload.old;
      if (row && (row.requester_id === userId || row.addressee_id === userId)) {
        onChange();
      }
    })
    .subscribe();
  return () => { if (supabase) supabase.removeChannel(channel); };
}
