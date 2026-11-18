import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJournalNews } from '../lib/services/news';
import type { NewsItem } from '../data/news';

const REFRESH_INTERVAL_MS = 30_000;

export function useJournalNews() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const latestNews = await fetchJournalNews(controller.signal);
      if (controller.signal.aborted) return;
      setNews(latestNews);
      setError(null);
    } catch (fetchError) {
      if (controller.signal.aborted) return;
      console.error('[Home] failed to load journal news:', fetchError);
      setError('Não foi possível atualizar as notícias do Jornal FutSenai.');
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  const retry = useCallback(() => {
    if (news.length === 0) setLoading(true);
    void refresh();
  }, [news.length, refresh]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void refresh();
    });
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void refresh();
    }, REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') void refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      const controller = controllerRef.current;
      controllerRef.current = null;
      controller?.abort();
    };
  }, [refresh]);

  return { news, loading, error, refresh, retry };
}
