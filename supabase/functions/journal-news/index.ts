import { parseJournalNews, JOURNAL_RAW_NEWS_URL } from '../../../src/data/news.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);

  try {
    const response = await fetch(JOURNAL_RAW_NEWS_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Journal feed returned HTTP ${response.status}.`);

    const news = parseJournalNews(await response.json()).slice(0, 3);
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
