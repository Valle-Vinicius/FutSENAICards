import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function ProtectedRoute() {
  const [ready, setReady] = useState(!supabase);
  const [authed, setAuthed] = useState(!supabase);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      setAuthed(false);
      return;
    }
    const resolveSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setAuthed(!!data.session);
      } catch {
        setAuthed(false);
      } finally {
        setReady(true);
      }
    };
    resolveSession();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-[#858A98]">Carregando…</div>;
  if (!authed) return <Navigate to="/auth" replace />;
  return <Outlet />;
}
