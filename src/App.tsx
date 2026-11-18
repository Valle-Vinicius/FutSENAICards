import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { loadDbTemplates, allTemplates } from './data/players';
import React, { Suspense, lazy } from 'react';
import ToastContainer from './components/ToastContainer';
import { useGame } from './store/useGame';
import { supabase } from './lib/supabase';
import { subscribeUserPresence } from './lib/services/friends';
import Layout from './components/Layout';
import Tutorial from './components/Tutorial';
import NotFound from './pages/NotFound';
import Home from './pages/Home';
import Packs from './pages/Packs';
import OpenPack from './pages/OpenPack';
import Collection from './pages/Collection';
import CardDetail from './pages/CardDetail';
import Squad from './pages/Squad';
import Compare from './pages/Compare';
import Marketplace from './pages/Marketplace';
import SBC from './pages/SBC';
import Missions from './pages/Missions';
import Shop from './pages/Shop';
import Profile from './pages/Profile';
import FriendProfile from './pages/FriendProfile';
import Friends from './pages/Friends';
import Settings from './pages/Settings';
import Auth from './pages/Auth';
import ProtectedRoute from './components/ProtectedRoute';
import Leaderboard from './pages/Leaderboard';
import CompetitiveProfile from './pages/CompetitiveProfile';
import Credits from './pages/Credits';
const Match = lazy(() => import('./pages/Match'));
const Pool = lazy(() => import('./pages/Pool'));
const Admin = lazy(() => import('./pages/Admin'));
const Changelog = lazy(() => import('./pages/Changelog'));

function RouteLoading() {
  return <div className="flex min-h-[50dvh] items-center justify-center text-[var(--muted)]">Carregando…</div>;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (this.state.err) {
      return <div className="p-8 text-sm text-[var(--muted)]">Algo deu errado. <button onClick={() => location.reload()} className="text-[var(--red)]">Recarregar</button></div>;
    }
    return this.props.children;
  }
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    useGame.getState().init();
    const initTemplates = async () => {
      await loadDbTemplates();
      console.log('[App] templates carregados, allTemplates:', allTemplates().length);
    };
    initTemplates();
    if (!supabase) {
      setAuthReady(true);
      setAuthed(false);
      return;
    }
    const resolveSession = async () => {
      try {
        const { data } = await supabase!.auth.getSession();
        setAuthed(!!data.session);
        setCurrentUserId(data.session?.user.id ?? null);
      } catch {
        setAuthed(false);
        setCurrentUserId(null);
      } finally {
        setAuthReady(true);
      }
    };
    resolveSession();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user?.id) {
        useGame.getState().syncUserData(session.user.id);
      }
      setAuthed(!!session);
      setCurrentUserId(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !currentUserId) return;
    let active = true;
    const markActive = async () => {
      if (document.visibilityState === 'hidden') return;
      const { error } = await supabase!
        .from('profiles')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', currentUserId);
      if (error && active) console.error('[presence] failed to update last_seen:', error);
    };

    void markActive();
    const interval = window.setInterval(() => void markActive(), 60_000);
    document.addEventListener('visibilitychange', markActive);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', markActive);
    };
  }, [currentUserId]);
  useEffect(() => {
    if (!currentUserId) return;
    return subscribeUserPresence(currentUserId);
  }, [currentUserId]);
  return (
    <ErrorBoundary>
      <ToastContainer />
      {authReady && authed && <Tutorial />}
      <BrowserRouter basename={typeof window !== 'undefined' && window.location.pathname.startsWith('/FutSENAICards') ? '/FutSENAICards' : undefined}>
        <Routes>
        <Route path="/changelog" element={<Suspense fallback={<div className="mx-auto max-w-2xl px-4 py-6 text-sm text-[var(--muted)]">Carregando histórico…</div>}><Changelog /></Suspense>} />
        {!authReady ? (
          <Route path="*" element={<RouteLoading />} />
        ) : (
          <>
            <Route path="/auth" element={<Auth />} />
            {!authed ? (
              <Route path="*" element={<Navigate to="/auth" replace />} />
            ) : (
              <>
                <Route element={<ProtectedRoute />}>
                  <Route element={<Layout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/packs" element={<Packs />} />
                  <Route path="/open/:packId" element={<OpenPack />} />
                  <Route path="/collection" element={<Collection />} />
                  <Route path="/card/:uid" element={<CardDetail />} />
                  <Route path="/squad" element={<Squad />} />
                  <Route path="/match" element={<Suspense fallback={<RouteLoading />}><Match /></Suspense>} />
                  <Route path="/pool/:matchId" element={<Suspense fallback={<RouteLoading />}><Pool /></Suspense>} />
                  <Route path="/compare" element={<Compare />} />
                  <Route path="/market" element={<Marketplace />} />
                  <Route path="/sbc" element={<SBC />} />
                  <Route path="/missions" element={<Missions />} />
                  <Route path="/shop" element={<Shop />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/friends" element={<Friends />} />
                  <Route path="/profile/:userId" element={<FriendProfile />} />
                  <Route path="/leaderboard" element={<Leaderboard />} />
                  <Route path="/leaderboard/player/:userId" element={<CompetitiveProfile />} />
                  <Route path="/credits" element={<Credits />} />
                  <Route path="/admin" element={<Suspense fallback={<RouteLoading />}><Admin /></Suspense>} />
                  </Route>
                </Route>
                <Route path="*" element={<NotFound />} />
              </>
            )}
          </>
        )}
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}