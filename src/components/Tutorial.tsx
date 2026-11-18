import { useEffect, useState } from 'react';

const STEPS = [
  'Bem-vindo ao Futsenai Cards! Abra pacotes para obter cartas.',
  'Monte seu elenco na página "Montar elenco".',
  'Compare jogadores e dispute partidas simuladas.',
  'Use o mercado e os desafios (SBC) para evoluir.',
];

export default function Tutorial() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!localStorage.getItem('futsenai_tutorial_done')) setOpen(true);
  }, []);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[160] bg-black/40 flex items-center justify-center p-4">
      <div className="card-surface w-full max-w-md p-6 space-y-4">
        <div className="text-lg font-semibold text-[var(--text)]">Tutorial ({step + 1}/{STEPS.length})</div>
        <p className="text-sm text-[var(--muted)]">{STEPS[step]}</p>
        <div className="flex justify-between">
          <button onClick={() => { localStorage.setItem('futsenai_tutorial_done', '1'); setOpen(false); }} className="text-xs text-[var(--muted)]">Pular</button>
          <button
            onClick={() => {
              if (step < STEPS.length - 1) setStep(s => s + 1);
              else { localStorage.setItem('futsenai_tutorial_done', '1'); setOpen(false); }
            }}
            className="px-3 py-1.5 rounded-xl bg-[var(--red)] text-white text-sm font-medium"
          >
            {step < STEPS.length - 1 ? 'Próximo' : 'Concluir'}
          </button>
        </div>
      </div>
    </div>
  );
}
