import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'no auth' }, 401);

  const token = authorization.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!token) return json({ error: 'missing bearer token' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    console.error('get-challenge-data is missing Supabase server configuration');
    return json({ error: 'challenge service configuration error' }, 500);
  }

  const authClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) {
    console.error('get-challenge-data session verification failed', {
      status: authError?.status,
      code: authError?.code,
      message: authError?.message,
    });
    return json({
      error: authError?.message || 'invalid token',
      authCode: authError?.code ?? null,
      authStatus: authError?.status ?? null,
    }, 401);
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new RequestError('invalid JSON body', 400);
    }

    const challengeId = (body as { challengeId?: unknown } | null)?.challengeId;
    if (typeof challengeId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(challengeId)) {
      throw new RequestError('invalid challengeId', 400);
    }

    const { data: challenge, error: challengeError } = await adminClient
      .from('challenges')
      .select('id,challenger_id,challenged_id,status,seed,challenger_ready,challenged_ready,home_formation,away_formation,home_snapshot,away_snapshot,challenger_tactic,challenged_tactic,created_at,updated_at')
      .eq('id', challengeId)
      .single();
    if (challengeError) {
      if (challengeError.code === 'PGRST116') throw new RequestError('challenge not found', 404);
      throw challengeError;
    }
    if (!challenge) throw new RequestError('challenge not found', 404);
    if (challenge.challenger_id !== user.id && challenge.challenged_id !== user.id) {
      throw new RequestError('not a participant', 403);
    }
    if (!['accepted', 'completed'].includes(challenge.status)) {
      throw new RequestError('challenge is not ready for lineup preview', 409);
    }

    const loadTeam = async (userId: string) => {
      const { data: squads, error: squadsError } = await adminClient
        .from('squads')
        .select('formation,starters,is_primary,updated_at')
        .eq('user_id', userId)
        .order('is_primary', { ascending: false })
        .order('updated_at', { ascending: false });
      if (squadsError) throw squadsError;

      const squad = squads?.[0];
      const starterIds: string[] = Array.isArray(squad?.starters)
        ? squad.starters.filter((id: unknown): id is string => typeof id === 'string')
        : [];
      if (starterIds.length !== 5 || new Set(starterIds).size !== 5) {
        throw new RequestError('Cada jogador precisa ter exatamente cinco titulares válidos.', 422);
      }

      const { data: cards, error: cardsError } = await adminClient
        .from('cards')
        .select('id,name,position,overall,pace,shooting,passing,dribbling,defending,physical,reflexes,positioning,handling,pack_group')
        .eq('user_id', userId)
        .in('id', starterIds);
      if (cardsError) throw cardsError;
      if (cards?.some(card => card.pack_group === 'off_sale')) {
        throw new RequestError('Cartas Off-Sale não podem ser usadas no X1. Troque-as no seu elenco e tente novamente.', 422);
      }

      const cardsById = new Map((cards ?? []).map((card: any) => [card.id, card]));
      const orderedCards = starterIds
        .map(id => cardsById.get(id))
        .filter((card: any) => card?.position)
        .map((card: any) => ({
          uid: card.id,
          name: card.name,
          position: card.position,
          overall: card.overall ?? 70,
          pace: card.pace ?? 50,
          shooting: card.shooting ?? 50,
          passing: card.passing ?? 50,
          dribbling: card.dribbling ?? 50,
          defending: card.defending ?? 50,
          physical: card.physical ?? 50,
          reflexes: card.reflexes,
          positioning: card.positioning,
          handling: card.handling,
        }));
      if (orderedCards.length !== 5 || orderedCards.filter(card => card.position === 'GK').length !== 1) {
        throw new RequestError('O elenco precisa ter cinco titulares válidos, incluindo exatamente um goleiro.', 422);
      }

      return {
        formation: squad?.formation || '1-2-1',
        cards: orderedCards,
      };
    };

    const hasHomeSnapshot = challenge.home_snapshot !== null;
    const hasAwaySnapshot = challenge.away_snapshot !== null;
    if (
      (hasHomeSnapshot && (!Array.isArray(challenge.home_snapshot?.cards) || challenge.home_snapshot.cards.length !== 5))
      || (hasAwaySnapshot && (!Array.isArray(challenge.away_snapshot?.cards) || challenge.away_snapshot.cards.length !== 5))
      || (hasHomeSnapshot && !challenge.challenger_ready)
      || (hasAwaySnapshot && !challenge.challenged_ready)
      || (hasHomeSnapshot && !hasAwaySnapshot && challenge.challenged_ready)
      || (!hasHomeSnapshot && hasAwaySnapshot && challenge.challenger_ready)
    ) {
      throw new RequestError('Os snapshots congelados do desafio estão inconsistentes.', 409);
    }
    if (challenge.status === 'completed' && (!hasHomeSnapshot || !hasAwaySnapshot)) {
      throw new RequestError('A partida concluída não possui snapshots oficiais.', 409);
    }

    let home = challenge.home_snapshot;
    let away = challenge.away_snapshot;
    if (challenge.status !== 'completed' && (!hasHomeSnapshot || !hasAwaySnapshot)) {
      const [homeRoster, awayRoster, profiles] = await Promise.all([
        hasHomeSnapshot ? Promise.resolve(null) : loadTeam(challenge.challenger_id),
        hasAwaySnapshot ? Promise.resolve(null) : loadTeam(challenge.challenged_id),
        adminClient.from('profiles').select('id,name').in('id', [challenge.challenger_id, challenge.challenged_id]),
      ]);
      if (profiles.error) throw profiles.error;
      const names = new Map((profiles.data ?? []).map((profile: any) => [profile.id, profile.name]));
      home ??= {
        ...homeRoster!,
        name: names.get(challenge.challenger_id) || 'Desafiante',
      };
      away ??= {
        ...awayRoster!,
        name: names.get(challenge.challenged_id) || 'Desafiado',
      };
    }

    const snapshotCards = [...(home?.cards ?? []), ...(away?.cards ?? [])];
    const cardIds = [...new Set(snapshotCards
      .map((card: any) => card?.uid)
      .filter((id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))];
    const cardDetailsById: Record<string, unknown> = {};
    if (cardIds.length > 0) {
      const { data: cardDetails, error: cardDetailsError } = await adminClient
        .from('cards')
        .select('id,nationality,age,club,rarity,edition,special,image,xp,pack_group')
        .in('id', cardIds);
      if (cardDetailsError) throw cardDetailsError;
      if (cardDetails?.some(card => card.pack_group === 'off_sale')) {
        throw new RequestError('Cartas Off-Sale não podem ser usadas no X1. Troque-as no seu elenco e tente novamente.', 422);
      }
      for (const card of cardDetails ?? []) {
        cardDetailsById[card.id] = card;
      }
    }

    return json({ challenge, home, away, cardDetailsById });
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    console.error('get-challenge-data failed', error);
    return json({ error: 'Não foi possível carregar os elencos do desafio.' }, 500);
  }
});
