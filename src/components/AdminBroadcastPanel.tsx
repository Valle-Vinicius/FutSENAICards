import { useState, type FormEvent } from 'react';
import { Megaphone, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../store/toast';

const MAX_MESSAGE_LENGTH = 500;

export default function AdminBroadcastPanel() {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedMessage = message.trim();
    const messageLength = Array.from(trimmedMessage).length;
    if (!trimmedMessage || messageLength > MAX_MESSAGE_LENGTH) {
      toast.error('Escreva uma mensagem de até 500 caracteres.');
      return;
    }
    if (!supabase) {
      toast.error('O serviço de mensagens está indisponível.');
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.rpc('admin_broadcast_message', {
        p_message: trimmedMessage,
      });
      if (error) throw error;
      toast.success('Mensagem enviada para os usuários online.');
      setMessage('');
    } catch (error) {
      console.error('[admin broadcast] failed to send message:', error);
      toast.error(error instanceof Error ? `Não foi possível enviar: ${error.message}` : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
      <div className="card-surface space-y-4 p-4 md:p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#FFF0F1] text-[var(--red)]">
            <Megaphone className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-[var(--text)]">Mensagem global</h2>
            <p className="text-sm text-[var(--muted)]">Envie um aviso para quem estiver com o jogo aberto.</p>
          </div>
        </div>

        <form onSubmit={sendMessage} className="space-y-3">
          <label htmlFor="global-announcement" className="block text-xs font-semibold text-[#555B68]">
            Mensagem
          </label>
          <textarea
            id="global-announcement"
            value={message}
            onChange={event => setMessage(event.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={4}
            required
            aria-describedby="global-announcement-hint global-announcement-count"
            placeholder="Digite o aviso que deseja enviar..."
            className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--red)] focus:outline-none focus:ring-4 focus:ring-[var(--red)]/10"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p id="global-announcement-hint" className="text-xs text-[var(--muted)]">
              A mensagem é temporária e só chega a usuários conectados neste momento.
            </p>
            <span id="global-announcement-count" className="text-xs tabular-nums text-[var(--muted)]">
              {Array.from(message).length}/{MAX_MESSAGE_LENGTH}
            </span>
          </div>
          <button type="submit" disabled={sending || !message.trim()} className="btn btn-primary btn-sm inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
            <Send className="size-4" aria-hidden="true" />
            {sending ? 'Enviando...' : 'Enviar para quem está online'}
          </button>
        </form>
      </div>

      <aside aria-label="Prévia da mensagem" className="min-h-48 rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[0_8px_28px_rgba(27,31,42,0.05)]">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
          <Megaphone className="size-3.5 text-[var(--red)]" aria-hidden="true" />
          Prévia para usuários online
        </div>
        <div aria-live="polite" className="mt-4 min-h-24 rounded-xl border border-[#F2C9CC] bg-[#FFF8F8] p-4 text-sm leading-relaxed text-[var(--text)]">
          {message.trim() || <span className="text-[var(--muted)]">A mensagem aparecerá aqui enquanto você digita.</span>}
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">A prévia não envia nem publica a mensagem.</p>
      </aside>
    </section>
  );
}
