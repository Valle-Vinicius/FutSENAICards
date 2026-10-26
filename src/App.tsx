import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ToastContainer from './components/ToastContainer';
import LoadingScreen from './components/LoadingScreen';
import { useGame } from './store/useGame';
import { supabase } from './lib/supabase';
import Layout from './components/Layout';
import Tutorial from './components/Tutorial';
import NotFound from './pages/NotFound';
import Home from './pages/Home';
import Packs from './pages/Packs';
import OpenPack from './pages/OpenPack';
import Collection from './pages/Collection';
import CardDetail from './pages/CardDetail';
import Squad from './pages/Squad';
import Match from './pages/Match';
import Compare from './pages/Compare';
import Marketplace from './pages/Marketplace';
import SBC from './pages/SBC';
import Missions from './pages/Missions';
import Shop from './pages/Shop';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Auth from './pages/Auth';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  const [loading, setLoading] = useState(() => {
    const h = window.location.hash.replace('#', '') || '/';
    const known = ['/', '/packs', '/open/', '/collection', '/card/', '/squad', '/match', '/compare', '/market', '/sbc', '/missions', '/shop', '/profile', '/settings', '/auth'];
    return !known.some(k => h === k || h.startsWith(k));
  });
  useEffect(() => {
    useGame.getState().init();
    if (supabase) {
      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session?.user?.id) {
          useGame.getState().syncUserData(session.user.id);
        }
      });
      return () => sub.subscription.unsubscribe();
    }
  }, []);
  return (
    <>
      <ToastContainer />
      <Tutorial />
      {loading && <LoadingScreen onDone={() => setLoading(false)} />}
      {!loading && (
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/packs" element={<Packs />} />
              <Route path="/open/:packId" element={<OpenPack />} />
              <Route path="/collection" element={<Collection />} />
              <Route path="/card/:uid" element={<CardDetail />} />
              <Route path="/squad" element={<Squad />} />
              <Route path="/match" element={<Match />} />
              <Route path="/compare" element={<Compare />} />
              <Route path="/market" element={<Marketplace />} />
              <Route path="/sbc" element={<SBC />} />
              <Route path="/missions" element={<Missions />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      )}
    </>
  );
}
