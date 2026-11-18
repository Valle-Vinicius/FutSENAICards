import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getHomePendingCounts, type HomePendingCounts } from '../lib/services/home';

const REFRESH_INTERVAL_MS = 30_000;

export function useHomePendingCounts() {
  const [counts, setCounts] = useState<HomePendingCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (document.visibilityState === 'hidden' || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      if (!supabase) throw new Error('As pendências da conta precisam de conexão com o servidor.');
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const userId = data.session?.user?.id;
      if (!userId) throw new Error('Entre na sua conta para consultar suas pendências.');
      const nextCounts = await getHomePendingCounts(userId);
      setCounts(nextCounts);
      setError(null);
    } catch (loadError) {
      console.error('[Home] failed to load pending counts:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as pendências.');
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

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
    };
  }, [refresh, retryKey]);

  return { counts, loading, error, retry: () => setRetryKey(key => key + 1) };
}
