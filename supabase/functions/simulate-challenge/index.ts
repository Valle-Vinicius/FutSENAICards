import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createPlayersFromCards, MATCH_DURATION_MINUTES, MATCH_ENGINE_VERSION, simulateMatch } from '../../../src/engine/match.ts';
import type { Tactic } from '../../../src/engine/match.ts';
import { createAdminExhibitionResult } from '../../../src/engine/pvp-result.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const ADMIN_USER_ID = '35a8dc5f-c5db-4b33-9380-a32739ff6c10';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const token = authorization.replace(/^Bearer\s+/i, '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return json({ error: 'invalid session' }, 401);

  let challengeId: string | null = null;
  let claimToken: string | null = null;
  try {
    let body: { challengeId?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'invalid JSON body' }, 400);
    }
    if (
      typeof body?.challengeId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.challengeId)
    ) return json({ error: 'invalid challengeId' }, 400);
    challengeId = body.challengeId;

    const { data: challenge, error: challengeError } = await supabase
      .from('challenges')
      .select('id,challenger_id,challenged_id,status,seed,result,engine_version,admin_entertainment,wager_type')
      .eq('id', challengeId)
      .single();
    if (challengeError) {
      if (challengeError.code === 'PGRST116') return json({ error: 'challenge not found' }, 404);
      throw challengeError;
    }
    if (!challenge) return json({ error: 'challenge not found' }, 404);
    if (challenge.challenger_id !== user.id && challenge.challenged_id !== user.id) {
      return json({ error: 'not a participant' }, 403);
    }
    if (challenge.admin_entertainment && (
      (challenge.challenger_id !== ADMIN_USER_ID && challenge.challenged_id !== ADMIN_USER_ID)
      || challenge.wager_type !== null
    )) {
      return json({ error: 'invalid admin entertainment challenge' }, 409);
    }
    if (challenge.status === 'completed' && challenge.result) {
      return json({ result: challenge.result });
    }
    if (challenge.engine_version !== MATCH_ENGINE_VERSION) {
      return json({ error: 'Este desafio usa uma versão antiga do motor. Crie um novo desafio para continuar.' }, 409);
    }

    const { data: claimed, error: claimError } = await supabase.rpc('claim_challenge_simulation_v2', {
      p_challenge_id: challengeId,
    });
    if (claimError) throw claimError;
    if (typeof claimed !== 'string') {
      const { data: latest, error: latestError } = await supabase
        .from('challenges')
        .select('status,result,challenger_ready,challenged_ready,engine_version')
        .eq('id', challengeId)
        .single();
      if (latestError) throw latestError;
      if (latest?.status === 'completed' && latest.result) return json({ result: latest.result });
      if (latest?.engine_version !== MATCH_ENGINE_VERSION) {
        return json({ error: 'Este desafio usa uma versão antiga do motor. Crie um novo desafio para continuar.' }, 409);
      }
      if (!latest?.challenger_ready || !latest?.challenged_ready) {
        return json({ error: 'Os dois jogadores precisam estar prontos.' }, 409);
      }
      return json({ pending: true });
    }
    claimToken = claimed;

    const { data: frozenChallenge, error: frozenError } = await supabase
      .from('challenges')
      .select('home_snapshot,away_snapshot,challenger_tactic,challenged_tactic,seed')
      .eq('id', challengeId)
      .single();
    if (frozenError) throw frozenError;
    const home = frozenChallenge?.home_snapshot;
    const away = frozenChallenge?.away_snapshot;
    if (!Array.isArray(home?.cards) || !Array.isArray(away?.cards)) {
      throw new Error('A escalação congelada da partida não está disponível.');
    }
    const validTactics: Tactic[] = ['balanced', 'possession', 'highpress', 'counter', 'compact'];
    const homeTactic = frozenChallenge.challenger_tactic as Tactic;
    const awayTactic = frozenChallenge.challenged_tactic as Tactic;
    if (!validTactics.includes(homeTactic) || !validTactics.includes(awayTactic)) {
      throw new Error('A partida contém uma tática inválida.');
    }
    const seed = Number(frozenChallenge.seed);
    if (!Number.isSafeInteger(seed)) throw new Error('Desafio sem seed válida.');

    const simulatedResult = simulateMatch({
      sport: 'futsal',
      mode: 'pvp',
      homeName: home.name || 'Desafiante',
      awayName: away.name || 'Desafiado',
      homePlayers: createPlayersFromCards(home.cards, 'home', home.formation, 'futsal'),
      awayPlayers: createPlayersFromCards(away.cards, 'away', away.formation, 'futsal'),
      homeFormation: home.formation,
      awayFormation: away.formation,
      homeTactic,
      awayTactic,
      awayDifficulty: 'normal',
      seed,
      minutes: MATCH_DURATION_MINUTES,
    });
    const adminSide = challenge.challenger_id === ADMIN_USER_ID ? 'home' : 'away';
    const result = challenge.admin_entertainment
      ? createAdminExhibitionResult(simulatedResult, adminSide)
      : simulatedResult;

    const { data: officialResult, error: completeError } = await supabase.rpc('complete_challenge', {
      p_challenge_id: challengeId,
      p_claim_token: claimToken,
      p_result: result,
    });
    if (completeError) throw completeError;
    return json({ result: officialResult });
  } catch (error) {
    console.error('simulate-challenge failed', error);
    if (challengeId && claimToken) {
      const { error: releaseError } = await supabase.rpc('release_challenge_simulation', {
        p_challenge_id: challengeId,
        p_claim_token: claimToken,
      });
      if (releaseError) console.error('challenge simulation lease release failed', releaseError);
    }
    return json({ error: error instanceof Error ? error.message : 'Não foi possível simular o desafio.' }, 500);
  }
});
