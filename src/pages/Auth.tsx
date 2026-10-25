import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import loginBg from '../imagens/login/Background.png';
import heitorPose from '../imagens/imagensposes/heitorlogin-removebg-preview.png';
import pietroPose from '../imagens/imagensposes/pietrologin-removebg-preview.png';
import gabrielPose from '../imagens/imagensposes/gabriellogin-removebg-preview.png';
import joaoPose from '../imagens/imagensposes/joaologin-removebg-preview.png';
import dutraPose from '../imagens/imagensposes/dutralogin-removebg-preview.png';
import { supabase } from '../lib/supabase';

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [playerPose] = useState(() => {
    const poses = [heitorPose, pietroPose, gabrielPose, joaoPose, dutraPose];
    return poses[Math.floor(Math.random() * poses.length)];
  });
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = canvas.width = canvas.clientWidth || canvas.offsetWidth;
    let h = canvas.height = canvas.clientHeight || canvas.offsetHeight;
    const particles: { x: number; y: number; vx: number; vy: number }[] = [];
    const count = 40;
    for (let i = 0; i < count; i++) {
      particles.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2 });
    }
    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#dc3847';
        ctx.fill();
      }
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(220,56,71,${0.4 * (1 - dist / 150)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    const onResize = () => {
      w = canvas.width = canvas.clientWidth || canvas.offsetWidth;
      h = canvas.height = canvas.clientHeight || canvas.offsetHeight;
    };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
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
        <canvas ref={canvasRef} className="absolute inset-0 z-0 w-full h-full" />
        <motion.img src={playerPose} alt="Jogador" className="relative z-10" initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.9, delay: 0.15, ease: 'easeOut' }} style={{ width: '100%', height: '90%', objectFit: 'contain', objectPosition: 'center bottom' }} />
      </div>
      <div className="w-full md:w-1/2 h-full flex items-center justify-center p-6 bg-white overflow-hidden">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6, delay: 0.25 }} className="w-full max-w-sm space-y-6">
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
        </motion.div>
      </div>
    </div>
  );
}
