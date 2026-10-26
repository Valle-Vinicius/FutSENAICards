import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import bg from '../imagens/login/Background.png';
import assuncao from '../imagens/imagensposes/assuncaologin-removebg-preview.png';
import dutra from '../imagens/imagensposes/dutralogin-removebg-preview.png';
import enzo from '../imagens/imagensposes/enzologin-removebg-preview.png';
import gabriel from '../imagens/imagensposes/gabriellogin-removebg-preview.png';
import gustavo from '../imagens/imagensposes/gustavologin-removebg-preview.png';
import heitor from '../imagens/imagensposes/heitorlogin-removebg-preview.png';
import joao from '../imagens/imagensposes/joaologin-removebg-preview.png';
import jonas from '../imagens/imagensposes/jonaslogin-removebg-preview.png';
import matheus from '../imagens/imagensposes/matheuslogin-removebg-preview.png';
import pietro from '../imagens/imagensposes/pietrologin-removebg-preview.png';
import thiago from '../imagens/imagensposes/thiagologin-removebg-preview.png';

const POSES = [assuncao, dutra, enzo, gabriel, gustavo, heitor, joao, jonas, matheus, pietro, thiago];

export default function NotFound() {
  const [left, setLeft] = useState(0);
  const [right, setRight] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const key = 'nf-pose-idx';
    let stored = sessionStorage.getItem(key);
    let a = 0, b = 1;
    if (stored) {
      const parts = stored.split(',');
      a = Number(parts[0]);
      b = Number(parts[1]);
      if (Number.isNaN(a) || Number.isNaN(b) || a === b || a < 0 || b < 0 || a >= POSES.length || b >= POSES.length) {
        a = Math.floor(Math.random() * POSES.length);
        b = Math.floor(Math.random() * POSES.length);
        while (b === a) b = Math.floor(Math.random() * POSES.length);
        sessionStorage.setItem(key, `${a},${b}`);
      }
    } else {
      a = Math.floor(Math.random() * POSES.length);
      b = Math.floor(Math.random() * POSES.length);
      while (b === a) b = Math.floor(Math.random() * POSES.length);
      sessionStorage.setItem(key, `${a},${b}`);
    }
    setLeft(a);
    setRight(b);
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

  return (
    <div className="h-screen overflow-hidden relative flex items-center justify-center" style={{ backgroundImage: `url(${bg})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
      <canvas ref={canvasRef} className="absolute inset-0 z-0 w-full h-full" />
      <img src={POSES[left]} alt="Jogador" className="absolute left-0 bottom-0 z-10 h-[90%] object-contain" />
      <img src={POSES[right]} alt="Jogador" className="absolute right-0 bottom-0 z-10 h-[90%] object-contain" />
      <div className="relative z-20 bg-white rounded-2xl shadow-xl p-8 text-center max-w-md mx-4">
        <div className="text-6xl font-black text-[#E30613]">404</div>
        <div className="text-xl font-semibold text-[#252733] mt-2">Página não encontrada</div>
        <div className="text-sm text-[#858A98] mt-1">A rota que você tentou acessar não existe.</div>
        <Link to="/" className="mt-4 inline-block px-4 py-2 rounded-xl bg-[#E30613] text-white text-sm font-medium">Voltar ao início</Link>
      </div>
    </div>
  );
}
