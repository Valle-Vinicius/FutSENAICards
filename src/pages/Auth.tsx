import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import loginBg from '../imagens/login/Background.png';
import playerPose from '../imagens/imagensposes/pietrologin-removebg-preview.png';
import { supabase } from '../lib/supabase';

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) { setError('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.'); return; }
    setLoading(true);
    setError('');
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
        if (error) throw error;
      }
      navigate('/');
    } catch (err: any) {
      setError(err?.message ?? 'Erro de autenticação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden items-end justify-center" style={{ backgroundImage: `url(${loginBg})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
        <img src={playerPose} alt="Jogador" className="relative z-10 object-contain drop-shadow-2xl" style={{ height: '610px', width: 'auto' }} />
      </div>
      <div className="w-full md:w-1/2 flex items-center justify-center p-6 bg-white">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="text-3xl font-black text-[#E30613]">FutSENAI</div>
            <div className="text-sm text-[#858A98] mt-1">{mode === 'login' ? 'Entre na sua conta' : 'Crie sua conta'}</div>
          </div>
          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome" className="w-full bg-[#F7F7F9] border border-[#E9EAF0] rounded-xl px-4 py-3 text-sm" />
            )}
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" className="w-full bg-[#F7F7F9] border border-[#E9EAF0] rounded-xl px-4 py-3 text-sm" />
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Senha" className="w-full bg-[#F7F7F9] border border-[#E9EAF0] rounded-xl px-4 py-3 text-sm" />
            {error && <div className="text-xs text-red-600">{error}</div>}
            <button disabled={loading} className="w-full py-3 rounded-xl bg-[#E30613] text-white font-black disabled:opacity-60">
              {loading ? 'Aguarde...' : (mode === 'login' ? 'ENTRAR' : 'CADASTRAR')}
            </button>
          </form>
          <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="w-full text-sm text-[#858A98] hover:text-[#E30613]">
            {mode === 'login' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
