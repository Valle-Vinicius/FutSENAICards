import { useEffect, useState } from 'react';

export default function LoadingScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setProgress(p => Math.min(100, p + 8)), 80);
    const done = setTimeout(() => { clearInterval(t); onDone(); }, 1300);
    return () => { clearInterval(t); clearTimeout(done); };
  }, [onDone]);
  return (
    <div className="fixed inset-0 z-[200] bg-[#F7F7F9] flex flex-col items-center justify-center gap-6">
      <div className="text-4xl font-black"><span className="text-[#E30613]">FUT</span><span className="text-[#252733]">SENAI</span> <span className="text-[#858A98] text-lg">CARDS</span></div>
      <div className="w-64 h-2 bg-[#E9EAF0] rounded-full overflow-hidden">
        <div className="h-full bg-[#E30613] transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div className="text-xs text-[#858A98]">Carregando...</div>
    </div>
  );
}
