import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return new Response('Unauthorized', { status: 401 });
  // delete user data
  await supabase.from('cards').delete().eq('user_id', user.id);
  await supabase.from('squads').delete().eq('user_id', user.id);
  await supabase.from('matches').delete().eq('user_id', user.id);
  await supabase.from('leaderboard').delete().eq('user_id', user.id);
  await supabase.from('profiles').delete().eq('id', user.id);
  // delete auth user (requires service role)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  await admin.auth.admin.deleteUser(user.id);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
});
