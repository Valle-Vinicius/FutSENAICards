import { parseSafeJournalNews, type NewsItem } from '../../data/news';
import { supabase } from '../supabase';

export async function fetchJournalNews(signal?: AbortSignal): Promise<NewsItem[]> {
  if (!supabase) throw new Error('O feed de notícias requer conexão com o servidor.');
  const { data, error } = await supabase.functions.invoke<unknown>('journal-news', {
    method: 'GET',
    signal,
    timeout: 10_000,
  });
  if (error) throw error;
  return parseSafeJournalNews(data);
}
