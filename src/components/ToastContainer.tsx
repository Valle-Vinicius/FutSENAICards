import { X } from 'lucide-react';
import { useToast } from '../store/toast';

const COLORS: Record<string, string> = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  warning: 'bg-amber-500',
  info: 'bg-sky-600',
};

export default function ToastContainer() {
  const toasts = useToast(s => s.toasts);
  const remove = useToast(s => s.remove);
  return (
    <div className="fixed bottom-24 left-4 right-4 z-[100] flex flex-col gap-2 md:bottom-auto md:left-auto md:top-4 md:right-4 md:w-full md:max-w-sm">
      {toasts.map(t => (
        <div key={t.id} role={t.type === 'error' ? 'alert' : 'status'} aria-live={t.type === 'error' ? 'assertive' : 'polite'} className={`${COLORS[t.type]} flex max-w-full items-center gap-2 rounded-xl px-4 py-2 text-sm text-white shadow-lg animate-[fadeIn_0.2s_ease]`}>
          <span className="min-w-0 flex-1 break-words">{t.message}</span>
          <button onClick={() => remove(t.id)} className="shrink-0 opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      ))}
    </div>
  );
}
