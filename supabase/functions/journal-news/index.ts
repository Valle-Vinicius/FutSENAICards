import { JOURNAL_SUPABASE_URL, parseJournalNews } from '../../../src/data/news.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const JOURNAL_SUPABASE_CONFIG_URL = 'https://raw.githubusercontent.com/Pietro-Guedes/FutSenai-Jornal/main/supabase-config.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function getJournalAnonKey(): Promise<string> {
  const response = await fetch(JOURNAL_SUPABASE_CONFIG_URL, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Journal config returned HTTP ${response.status}.`);
  const config = await response.text();
  const configuredUrl = config.match(/url\s*:\s*["']([^"']+)["']/)?.[1];
  const anonKey = config.match(/anonKey\s*:\s*["']([^"']+)["']/)?.[1];
  if (!configuredUrl || new URL(configuredUrl).origin !== JOURNAL_SUPABASE_URL || !anonKey) {
    throw new Error('Journal public Supabase configuration is invalid.');
  }
  return anonKey;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);

  try {
    const anonKey = await getJournalAnonKey();
    const newsUrl = new URL('/rest/v1/news', JOURNAL_SUPABASE_URL);
    newsUrl.search = new URLSearchParams({
      select: 'id,title,category,player,image,content,created_at,published',
      published: 'eq.true',
      order: 'created_at.desc',
      limit: '3',
    }).toString();
    const response = await fetch(newsUrl, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Journal news API returned HTTP ${response.status}.`);

    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error('Journal news API did not return a list.');
    const feed = rows.map(row => {
      if (typeof row !== 'object' || row === null || !('created_at' in row)) {
        throw new Error('Journal news API returned an invalid row.');
      }
      return { ...row, createdAt: row.created_at };
    });
    const news = parseJournalNews(feed).slice(0, 3);
    return new Response(JSON.stringify(news), {
      headers: {
        ...corsHeaders,
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('[journal-news] failed to load public feed:', error);
    return json({ error: 'Não foi possível carregar as notícias do Jornal FutSenai.' }, 502);
  }
});
