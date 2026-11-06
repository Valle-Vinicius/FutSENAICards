import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const ADMIN_USER_ID = '35a8dc5f-c5db-4b33-9380-a32739ff6c10';

export default function Admin() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="p-8 text-[#858A98]">Carregando...</div>;

  if (userId !== ADMIN_USER_ID) {
    return (
      <div className="p-8 text-center text-[#858A98]">
        <div className="text-lg font-bold text-[#252733] mb-2">Acesso restrito</div>
        <div className="text-sm">Esta página é exclusiva para administradores.</div>
        <button onClick={() => navigate('/')} className="mt-4 px-4 py-2 rounded-xl bg-[#E30613] text-white text-sm">Voltar</button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <h1 className="text-2xl font-bold text-[#252733]">Painel Administrador</h1>
      <div className="card-surface p-4">
        <div className="text-sm text-[#858A98]">Bem-vindo, administrador.</div>
        <div className="text-xs text-[#858A98] mt-2">ID: {userId}</div>
      </div>
    </div>
  );
}
