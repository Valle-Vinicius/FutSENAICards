import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import loginBg from '../imagens/login/Background.png';
import playerPose from '../imagens/imagensposes/pietrologin-removebg-preview.png';
import { supabase } from '../lib/supabase';
import 'particles.js';

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const w = window as any;
    if (w.particlesJS) {
      w.particlesJS('particles-js', {
        particles: {
          number: { value: 40, density: { enable: true, value_area: 800 } },
          color: { value: '#dc3847' },
          shape: { type: 'circle', stroke: { width: 1, color: '#dc3847' }, polygon: { nb_sides: 6 } },
          opacity: { value: 0.5, random: false, anim: { enable: false, speed: 1, opacity_min: 0.1, sync: false } },
          size: { value: 3, random: true, anim: { enable: false, speed: 40, size_min: 0.1, sync: false } },
          line_linked: { enable: true, distance: 150, color: '#dc3847', opacity: 0.4, width: 1 },
          move: { enable: true, speed: 6, direction: 'none', random: false, straight: false, out_mode: 'out', bounce: false, attract: { enable: false, rotateX: 600, rotateY: 1200 } },
        },
        interactivity: {
          detect_on: 'window',
          events: { onhover: { enable: false, mode: 'repulse' }, onclick: { enable: false, mode: 'push' }, resize: true },
          modes: { grab: { distance: 400, line_linked: { opacity: 1 } }, bubble: { distance: 827.17, size: 40, duration: 2, opacity: 8, speed: 3 }, repulse: { distance: 679.32, duration: 0.4 }, push: { particles_nb: 4 }, remove: { particles_nb: 2 } },
        },
        retina_detect: true,
      });
    }
  }, []);

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
    <div className="h-screen overflow-hidden flex">
      <div className="hidden md:flex md:w-1/2 relative h-full items-end justify-center overflow-hidden" style={{ backgroundImage: `url(${loginBg})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
        <div id="particles-js" className="absolute inset-0 z-0" />
        <img src={playerPose} alt="Jogador" style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center bottom' }} className="relative z-10" />
      </div>
      <div className="w-full md:w-1/2 h-full flex items-center justify-center p-6 bg-white overflow-hidden">
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
