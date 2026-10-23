import { useToast } from '../store/toast';

const COLORS: Record<string, string> = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  warning: 'bg-yellow-500',
  info: 'bg-[#E30613]',
};

export default function ToastContainer() {
  const toasts = useToast(s => s.toasts);
  const remove = useToast(s => s.remove);
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id} className={`${COLORS[t.type]} text-white px-4 py-2 rounded-xl shadow-lg text-sm flex items-center gap-2 animate-[fadeIn_0.2s_ease]`}>
          <span>{t.message}</span>
          <button onClick={() => remove(t.id)} className="opacity-70 hover:opacity-100">✕</button>
        </div>
      ))}
    </div>
  );
}
