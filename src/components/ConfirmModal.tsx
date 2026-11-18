import { useEffect } from 'react';

export default function ConfirmModal({ open, title, message, onConfirm, onCancel, confirmLabel = 'Confirmar', confirmVariant = 'primary', confirmDisabled = false }: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  confirmDisabled?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[150] bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="card-surface max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto p-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-[var(--text)] mb-2">{title}</h3>
        <p className="text-sm text-[var(--muted)] mb-4">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="btn btn-secondary btn-sm">Cancelar</button>
          <button onClick={onConfirm} disabled={confirmDisabled} className={`btn btn-${confirmVariant} btn-sm`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
