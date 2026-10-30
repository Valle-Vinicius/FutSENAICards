import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response(JSON.stringify({ error: 'no auth' }), { status: 401, headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return new Response(JSON.stringify({ error: 'invalid token' }), { status: 401, headers: corsHeaders });

  const { challengeId } = await req.json();
  if (!challengeId) return new Response(JSON.stringify({ error: 'no challengeId' }), { status: 400, headers: corsHeaders });

  const { data: challenge } = await supabase.from('challenges').select('*').eq('id', challengeId).single();
  if (!challenge) return new Response(JSON.stringify({ error: 'challenge not found' }), { status: 404, headers: corsHeaders });

  if (challenge.challenger_id !== user.id && challenge.challenged_id !== user.id) {
    return new Response(JSON.stringify({ error: 'not a participant' }), { status: 403, headers: corsHeaders });
  }

  const fetchSide = async (uid: string) => {
    const { data: sqs } = await supabase.from('squads').select('*').eq('user_id', uid);
    const sq = (sqs && sqs.length > 0) ? (sqs.find((s: any) => s.is_primary) || sqs[0]) : null;
    const formation = sq?.formation || '1-2-1';
    const starterUids: (string | null)[] = Array.isArray(sq?.starters) ? sq.starters : [];
    const { data: cs } = await supabase.from('cards').select('*').eq('user_id', uid);
    const cardMap = new Map((cs || []).map((c: any) => [c.id, c]));
    const starterCards = starterUids.map(uid => uid ? cardMap.get(uid) : null).filter((c: any) => c && c.position);
    const mapped = starterCards.map((c: any) => ({
      uid: c.id, name: c.name, position: c.position, overall: c.overall ?? 70,
      pace: c.pace ?? 50, shooting: c.shooting ?? 50, passing: c.passing ?? 50, dribbling: c.dribbling ?? 50, defending: c.defending ?? 50, physical: c.physical ?? 50,
      reflexes: c.reflexes, positioning: c.positioning, handling: c.handling,
    }));
    return { formation, cards: mapped };
  };

  const home = await fetchSide(challenge.challenger_id);
  const away = await fetchSide(challenge.challenged_id);

  return new Response(JSON.stringify({ challenge, home, away }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
