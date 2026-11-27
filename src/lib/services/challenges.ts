import { supabase } from '../supabase';
import type { Tactic } from '../../engine/match';

export interface Challenge {
  id: string;
  challenger_id: string;
  challenged_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'completed' | 'cancelled' | 'abandoned';
  admin_entertainment?: boolean;
  wager_type?: string | null;
  challenger_ready?: boolean;
  challenged_ready?: boolean;
  home_formation?: string;
  away_formation?: string;
  home_score?: number;
  away_score?: number;
  result?: any;
  engine_version?: number;
  playback_state?: MatchPlaybackState;
  challenger_tactic?: Tactic;
  challenged_tactic?: Tactic;
  home_snapshot?: ChallengeTeamSnapshot;
  away_snapshot?: ChallengeTeamSnapshot;
  created_at: string;
}

export interface ChallengeTeamSnapshot {
  name: string;
  formation: string;
  cards: {
    uid: string;
    name: string;
    position: string;
    overall: number;
    pace: number;
    shooting: number;
    passing: number;
    dribbling: number;
    defending: number;
    physical: number;
    reflexes?: number | null;
    positioning?: number | null;
    handling?: number | null;
  }[];
}

export interface ChallengeCardDetails {
  id: string;
  nationality?: string | null;
  age?: number | null;
  club?: string | null;
  rarity?: string | null;
  edition?: string | null;
  special?: string | null;
  image?: string | null;
  xp?: number | null;
}

export interface ChallengeDataResponse {
  challenge: Challenge;
  home: ChallengeTeamSnapshot;
  away: ChallengeTeamSnapshot;
  cardDetailsById: Record<string, ChallengeCardDetails>;
}

export interface MatchPlaybackState {
  status: 'waiting' | 'playing' | 'paused' | 'finished';
  currentFrame: number;
  speed: 1 | 2 | 4;
  startedAt: string | null;
  pausedAt: string | null;
  serverNow?: string | null;
  receivedAt?: number;
}

interface FunctionHttpContext {
  status: number;
  clone: () => { json: () => Promise<unknown> };
}

function getFunctionHttpContext(error: unknown): FunctionHttpContext | null {
  if (typeof error !== 'object' || error === null || !('context' in error)) return null;
  const context = error.context;
  if (typeof context !== 'object' || context === null) return null;

  const candidate = context as { status?: unknown; clone?: unknown };
  if (typeof candidate.status !== 'number' || typeof candidate.clone !== 'function') return null;
  return context as FunctionHttpContext;
}

async function getFunctionErrorMessage(error: unknown): Promise<string> {
  const context = getFunctionHttpContext(error);
  if (context) {
    const body = await context.clone().json();
    if (
      typeof body === 'object'
      && body !== null
      && 'error' in body
      && typeof body.error === 'string'
    ) return body.error;
  }
  return error instanceof Error ? error.message : 'Não foi possível carregar os dados do desafio.';
}

export async function getChallengeData(challengeId: string): Promise<ChallengeDataResponse> {
  if (!supabase) throw new Error('Serviço de partidas indisponível.');

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  if (!sessionData.session) throw new Error('Sua sessão expirou. Entre novamente.');

  const invoke = (accessToken: string) => supabase!.functions.invoke<ChallengeDataResponse>('get-challenge-data', {
    body: { challengeId },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  let { data, error } = await invoke(sessionData.session.access_token);
  if (error && getFunctionHttpContext(error)?.status === 401) {
    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshedData.session) {
      throw new Error('Sua sessão expirou. Entre novamente.');
    }
    ({ data, error } = await invoke(refreshedData.session.access_token));
  }

  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (!data) throw new Error('A Edge Function não retornou os dados do desafio.');

  const response = data as ChallengeDataResponse & { error?: unknown };
  if (typeof response.error === 'string') throw new Error(response.error);
  return response;
}

export async function createChallenge(challengerId: string, challengedId: string): Promise<Challenge | null> {
  if (!supabase || challengerId === challengedId) return null;
  const { data, error } = await supabase.rpc('create_challenge', {
    p_challenged_id: challengedId,
  });
  if (error) throw error;
  return data;
}

export async function acceptChallenge(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('accept_challenge', { p_challenge_id: id });
  if (error) return false;
  return data === true;
}

export async function setReady(id: string, tactic: Tactic): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('set_challenge_ready', { p_challenge_id: id, p_tactic: tactic });
  if (error) throw new Error(error.message);
  return data === true;
}

export async function setAdminEntertainment(id: string, enabled: boolean): Promise<boolean> {
  if (!supabase) throw new Error('Serviço de partidas indisponível.');
  const { data, error } = await supabase.rpc('set_admin_challenge_entertainment', {
    p_challenge_id: id,
    p_enabled: enabled,
  });
  if (error) throw error;
  return data === true;
}

export async function abandonChallenge(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('abandon_challenge', { p_challenge_id: id });
  return !error && data === true;
}

export async function rejectChallenge(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('reject_challenge', { p_challenge_id: id });
  return !error && data === true;
}

export async function simulateChallenge(id: string): Promise<{ result: any | null; pending: boolean }> {
  if (!supabase) throw new Error('Serviço de partidas indisponível.');
  const { data, error } = await supabase.functions.invoke('simulate-challenge', { body: { challengeId: id } });
  if (error) {
    if (error.context instanceof Response) {
      const body = await error.context.clone().json().catch(() => null) as { error?: unknown } | null;
      if (typeof body?.error === 'string') throw new Error(body.error);
    }
    throw error;
  }
  if (!data || (!data.pending && !data.result)) {
    throw new Error(data?.error || 'O servidor não retornou o resultado oficial.');
  }
  return { result: data.result ?? null, pending: !!data.pending };
}

export async function updateChallengePlayback(
  id: string,
  action: 'play' | 'pause' | 'speed' | 'finish',
  speed?: 1 | 2 | 4,
): Promise<MatchPlaybackState> {
  if (!supabase) throw new Error('Serviço de partidas indisponível.');
  const { data, error } = await supabase.rpc('update_challenge_playback', {
    p_challenge_id: id,
    p_action: action,
    p_speed: speed ?? null,
  });
  if (error) throw error;
  return data as MatchPlaybackState;
}

export async function getChallenge(id: string): Promise<Challenge | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('challenges').select('*').eq('id', id).single();
  if (error) return null;
  return data;
}

export async function getPendingChallenges(userId: string): Promise<Challenge[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('challenges').select('*').eq('challenged_id', userId).eq('status', 'pending');
  if (error) return [];
  return data || [];
}

export function subscribeChallenges(userId: string, onChange: () => void) {
  if (!supabase) return () => {};
  const channel = supabase.channel(`challenges-${userId}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges' }, (payload: any) => {
      const row = payload.new || payload.old;
      if (row && (row.challenger_id === userId || row.challenged_id === userId)) onChange();
    })
    .subscribe();
  return () => { if (supabase) supabase.removeChannel(channel); };
}
