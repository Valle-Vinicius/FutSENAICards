import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import loginBg from '../imagens/login/Background.png';
import logo from '../imagens/login/Logo_Fut_SENAI_Cards-removebg-preview.png';
import lofi from '../audio/lofi.mp3';
import { supabase } from '../lib/supabase';
import { signIn, signUp, resetPassword, updatePassword, signInWithGoogle } from '../lib/services/auth';
import { POSES } from '../data/poses';

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [started, setStarted] = useState(false);
  const [playerPose] = useState(() => POSES[Math.floor(Math.random() * POSES.length)]);
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (window.location.hash.includes('type=recovery')) setRecovery(true);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = canvas.width = canvas.clientWidth || canvas.offsetWidth;
    let h = canvas.height = canvas.clientHeight || canvas.offsetHeight;
    const particles: { x: number; y: number; vx: number; vy: number }[] = [];
    for (let i = 0; i < 40; i++) particles.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2 });
    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
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

  const startExperience = () => {
    if (started) return;
    setStarted(true);
    const audio = new Audio(lofi);
    audio.loop = true;
    audio.volume = 0.02;
    audioRef.current = audio;
    audio.play().catch(() => {});
    let vol = 0.02;
    const fade = setInterval(() => {
      vol = Math.min(0.4, vol + 0.005);
      audio.volume = vol;
      if (vol >= 0.4) clearInterval(fade);
    }, 200);
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) { setError('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.'); return; }
    setLoading(true);
    setError('');
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) throw new Error(error);
      } else {
        const { error } = await signUp(name, email, password);
        if (error) throw new Error(error);
      }
      navigate('/');
    } catch (err: any) {
      setError(err?.message ?? 'Erro de autenticação.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!supabase) { setError('Configure o Supabase.'); return; }
    setLoading(true);
    setError('');
    const { error } = await signInWithGoogle();
    if (error) { setError(error); setLoading(false); }
  };

  const forgotPassword = async () => {
    if (!email) { setError('Digite seu email.'); return; }
    setLoading(true);
    setError('');
    const { error } = await resetPassword(email);
    if (error) setError(error);
    else setError('Email de recuperação enviado.');
    setLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await updatePassword(newPassword);
    if (error) setError(error);
    else { setError('Senha atualizada. Faça login.'); setRecovery(false); }
    setLoading(false);
  };

  return (
    <>
      {!started && (
        <div onClick={startExperience} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md cursor-pointer">
          <div className="text-white text-lg font-bold">Clique para entrar</div>
        </div>
      )}
      <div className="h-screen overflow-hidden flex">
        <div className="hidden md:flex md:w-1/2 relative h-full items-end justify-center overflow-hidden" style={{ backgroundImage: `url(${loginBg})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
          <canvas ref={canvasRef} className="absolute inset-0 z-0 w-full h-full" />
          <motion.img src={playerPose} alt="Jogador" className="relative z-10" initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.9, delay: 0.15, ease: 'easeOut' }} style={{ width: '100%', height: '90%', objectFit: 'contain', objectPosition: 'center bottom' }} />
        </div>
        <div className="w-full md:w-1/2 h-full flex items-center justify-center p-6 bg-white overflow-hidden">
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6, delay: 0.25 }} className="w-full max-w-sm space-y-6">
            <div className="text-center">
              <img src={logo} alt="FutSENAI Cards" className="mx-auto h-64 object-contain" />
              <div className="text-sm text-[#858A98] mt-1">{recovery ? 'Redefinir senha' : (mode === 'login' ? 'Entre na sua conta' : 'Crie sua conta')}</div>
            </div>
            <form onSubmit={recovery ? handleResetPassword : submit} className="space-y-4">
              {recovery ? (
                <input value={newPassword} onChange={e => setNewPassword(e.target.value)} type="password" placeholder="Nova senha" className="w-full bg-[#F7F7F9] border border-[#E9EAF0] rounded-xl px-4 py-3 text-sm" />
              ) : (
                <>
                  {mode === 'register' && (
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome" className="w-full bg-[#F7F7F9] border border-[#E9EAF0] rounded-xl px-4 py-3 text-sm" />
                  )}
                  <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" className="w-full bg-[#F7F7F9] border border-[#E9EAF0] rounded-xl px-4 py-3 text-sm" />
                  <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Senha" className="w-full bg-[#F7F7F9] border border-[#E9EAF0] rounded-xl px-4 py-3 text-sm" />
                </>
              )}
              {error && <div className="text-xs text-red-600">{error}</div>}
              <button disabled={loading} className="w-full py-3 rounded-xl bg-[#E30613] text-white font-black disabled:opacity-60">
                {loading ? 'Aguarde...' : (recovery ? 'REDEFINIR SENHA' : (mode === 'login' ? 'ENTRAR' : 'CADASTRAR'))}
              </button>
              {!recovery && (
                <>
                  <button type="button" onClick={handleGoogleLogin} disabled={loading} className="w-full py-3 rounded-xl bg-white border border-[#E9EAF0] text-[#252733] font-bold disabled:opacity-60 flex items-center justify-center gap-2">
                    <span>Entrar com Google</span>
                  </button>
                  {mode === 'login' && (
                    <button type="button" onClick={forgotPassword} className="w-full text-sm text-[#858A98] hover:text-[#E30613]">
                      Esqueci minha senha
                    </button>
                  )}
                </>
              )}
            </form>
            {!recovery && (
              <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="w-full text-sm text-[#858A98] hover:text-[#E30613]">
                {mode === 'login' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}
              </button>
            )}
          </motion.div>
        </div>
      </div>
    </>
  );
}
