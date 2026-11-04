import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  const token = authorization?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!token) return json({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('delete-account is missing Supabase server configuration');
    return json({ error: 'Account deletion is temporarily unavailable.' }, 500);
  }

  let accountDataCleaned = false;
  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json({ error: 'unauthorized' }, 401);

    const { error: cleanupError } = await admin.rpc('delete_account_owned_data', {
      p_user_id: user.id,
    });
    if (cleanupError) {
      console.error('delete-account data cleanup failed', cleanupError);
      return json({ error: 'Unable to delete account data.' }, 500);
    }
    accountDataCleaned = true;

    const { error: accountError } = await admin.auth.admin.deleteUser(user.id);
    if (accountError) {
      console.error('delete-account auth deletion failed after data cleanup', accountError);
      return json({
        error: 'Account data was removed, but account deletion could not be completed. Retry the request.',
      }, 500);
    }

    return json({ ok: true });
  } catch (error) {
    console.error('delete-account request failed', error);
    if (accountDataCleaned) {
      return json({
        error: 'Account data was removed, but account deletion could not be completed. Retry the request.',
      }, 500);
    }
    return json({ error: 'Unable to process account deletion. Retry the request.' }, 500);
  }
});
