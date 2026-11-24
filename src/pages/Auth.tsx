import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Volume2, VolumeX } from 'lucide-react';
import loginBg from '../imagens/login/Background.png';
import logo from '../imagens/login/Logo_Fut_SENAI_Cards-removebg-preview.png';
import lofi from '../audio/lofi.mp3';
import { supabase } from '../lib/supabase';
import { signIn, signUp, resetPassword, updatePassword, signInWithGoogle } from '../lib/services/auth';
import { toFriendlyAuthError } from '../lib/authErrors';
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
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [musicMuted, setMusicMuted] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [playerPose] = useState(() => POSES[Math.floor(Math.random() * POSES.length)]);
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);

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
      if (document.hidden) {
        raf = 0;
        return;
      }
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
    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        raf = requestAnimationFrame(draw);
      }
    };
    if (!document.hidden) raf = requestAnimationFrame(draw);
    const onResize = () => {
      w = canvas.width = canvas.clientWidth || canvas.offsetWidth;
      h = canvas.height = canvas.clientHeight || canvas.offsetHeight;
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const startExperience = () => {
    if (started) return;
    setStarted(true);
    const audio = new Audio(lofi);
    audio.loop = true;
    audio.volume = 0.02;
    audio.muted = musicMuted;
    audioRef.current = audio;
    audio.play().then(() => {
      if (audioRef.current !== audio) return;
      let volume = 0.02;
      fadeIntervalRef.current = window.setInterval(() => {
        volume = Math.min(0.4, volume + 0.005);
        audio.volume = volume;
        if (volume >= 0.4 && fadeIntervalRef.current !== null) {
          window.clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;
        }
      }, 200);
    }).catch((playError: unknown) => {
      if (audioRef.current !== audio) return;
      console.error('[auth] failed to start background music:', playError);
      setAudioError('Não foi possível iniciar a música de fundo.');
    });
  };

  const toggleMusicMute = () => {
    setMusicMuted(currentMuted => {
      const nextMuted = !currentMuted;
      if (audioRef.current) audioRef.current.muted = nextMuted;
      return nextMuted;
    });
  };

  useEffect(() => {
    return () => {
      if (fadeIntervalRef.current !== null) {
        window.clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
        audioRef.current = null;
      }
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
        if (error) { setError(toFriendlyAuthError(error)); return; }
      } else {
        const { error } = await signUp(name, email, password);
        if (error) { setError(toFriendlyAuthError(error)); return; }
      }
      navigate('/');
    } catch (err: unknown) {
      console.error('[auth] sign-in failed:', err);
      setError(toFriendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!supabase) { setError('Configure o Supabase.'); return; }
    setLoading(true);
    setError('');
    try {
      const { error } = await signInWithGoogle();
      if (error) { setError(toFriendlyAuthError(error)); setLoading(false); }
    } catch (authError: unknown) {
      console.error('[auth] Google sign-in failed:', authError);
      setError(toFriendlyAuthError(authError));
      setLoading(false);
    }
  };

  const forgotPassword = async () => {
    if (!email) { setError('Digite seu email.'); return; }
    setLoading(true);
    setError('');
    try {
      const { error } = await resetPassword(email);
      if (error) setError(toFriendlyAuthError(error));
      else setError('Email de recuperação enviado.');
    } catch (authError: unknown) {
      console.error('[auth] password recovery failed:', authError);
      setError(toFriendlyAuthError(authError));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { error } = await updatePassword(newPassword);
      if (error) setError(toFriendlyAuthError(error));
      else { setError('Senha atualizada. Faça login.'); setRecovery(false); }
    } catch (authError: unknown) {
      console.error('[auth] password update failed:', authError);
      setError(toFriendlyAuthError(authError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!started && (
        <div onClick={startExperience} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md cursor-pointer">
          <div className="text-white text-lg font-bold">Clique para entrar</div>
        </div>
      )}
      {started && (
        <button
          type="button"
          onClick={toggleMusicMute}
          aria-label={musicMuted ? 'Ativar música de fundo' : 'Mutar música de fundo'}
          aria-pressed={musicMuted}
          className="fixed right-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
        >
          {musicMuted ? <VolumeX className="h-5 w-5" aria-hidden="true" /> : <Volume2 className="h-5 w-5" aria-hidden="true" />}
        </button>
      )}
      <div className="auth-screen">
        <div className="auth-screen__visual relative hidden items-end justify-center overflow-hidden md:flex" style={{ backgroundImage: `url(${loginBg})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
          <canvas ref={canvasRef} className="absolute inset-0 z-0 w-full h-full" />
          <motion.img src={playerPose} alt="Jogador" className="relative z-10" initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.9, delay: 0.15, ease: 'easeOut' }} style={{ width: '100%', height: '90%', objectFit: 'contain', objectPosition: 'center bottom' }} />
        </div>
        <div className="auth-screen__panel">
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6, delay: 0.25 }} className="auth-screen__content">
            <div className="text-center">
              <img src={logo} alt="FutSENAI Cards" className="auth-screen__logo mx-auto object-contain" />
              <div className="text-sm text-[var(--muted)] mt-1">{recovery ? 'Redefinir senha' : (mode === 'login' ? 'Entre na sua conta' : 'Crie sua conta')}</div>
            </div>
            <form onSubmit={recovery ? handleResetPassword : submit} className="auth-screen__form">
              {recovery ? (
                <div className="relative">
                  <input value={newPassword} onChange={e => setNewPassword(e.target.value)} type={passwordVisible ? 'text' : 'password'} autoComplete="new-password" placeholder="Nova senha" className="auth-screen__field w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 pr-12 text-sm" />
                  <button type="button" onClick={() => setPasswordVisible(value => !value)} aria-label={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={passwordVisible} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]">
                    {passwordVisible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                  </button>
                </div>
              ) : (
                <>
                  {mode === 'register' && (
                  <input value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="Nome" className="auth-screen__field w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 text-sm" />
                  )}
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete={mode === 'login' ? 'username' : 'email'} placeholder="Email" className="auth-screen__field w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 text-sm" />
                <div className="relative">
                  <input value={password} onChange={e => setPassword(e.target.value)} type={passwordVisible ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Senha" className="auth-screen__field w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 pr-12 text-sm" />
                  <button type="button" onClick={() => setPasswordVisible(value => !value)} aria-label={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={passwordVisible} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]">
                    {passwordVisible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                  </button>
                </div>
                </>
              )}
              {error && <div role="alert" className="text-xs text-red-600">{error}</div>}
              {audioError && <div role="status" className="text-xs text-[var(--muted)]">{audioError}</div>}
              <button disabled={loading} className="auth-screen__action w-full rounded-xl bg-[var(--red)] text-white font-black disabled:opacity-60">
                {loading ? 'Aguarde...' : (recovery ? 'REDEFINIR SENHA' : (mode === 'login' ? 'ENTRAR' : 'CADASTRAR'))}
              </button>
              {!recovery && (
                <>
                  <button type="button" onClick={handleGoogleLogin} disabled={loading} className="auth-screen__action w-full rounded-xl bg-white border border-[var(--border)] text-[var(--text)] font-bold disabled:opacity-60 flex items-center justify-center gap-2">
                    <span>Entrar com Google</span>
                  </button>
                  {mode === 'login' && (
                    <button type="button" onClick={forgotPassword} className="w-full text-sm text-[var(--muted)] hover:text-[var(--red)]">
                      Esqueci minha senha
                    </button>
                  )}
                </>
              )}
            </form>
            {!recovery && (
              <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="w-full text-sm text-[var(--muted)] hover:text-[var(--red)]">
                {mode === 'login' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}
              </button>
            )}
            <div className="auth-screen__footer border-t border-[var(--border)] text-center">
              <Link to="/about?aba=creditos" className="text-xs font-medium text-[var(--muted)] hover:text-[var(--red)]">
                Créditos
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
}
