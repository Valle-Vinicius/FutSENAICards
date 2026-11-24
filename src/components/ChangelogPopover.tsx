import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, X } from 'lucide-react';
import { summarizeChangelogBody } from '../lib/changelogFormat';
import Skeleton from './Skeleton';
import { useChangelog } from '../store/useChangelog';
import { useGame } from '../store/useGame';

export default function ChangelogPopover() {
  const { entries, loading, error, hasNew, markSeen, refresh } = useChangelog();
  const animations = useGame(state => state.settings.animations);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    if (entries[0]) markSeen(entries[0].version);
  }, [open, entries, markSeen]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const closePopover = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={hasNew ? 'Novidades do FutSENAI, há novidades não vistas' : 'Novidades do FutSENAI'}
        className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[var(--soft)] text-[var(--red)] hover:bg-[var(--bg)]"
      >
        <History className="h-4 w-4" aria-hidden="true" />
        {hasNew && <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-[var(--red)]" aria-hidden="true" />}
      </button>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Novidades do FutSENAI"
          className="fixed bottom-3 left-3 right-3 z-[120] mx-auto max-h-[70vh] w-auto max-w-sm overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-2xl sm:absolute sm:bottom-auto sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-[var(--text)]">Novidades</h2>
            <button
              ref={closeRef}
              type="button"
              onClick={closePopover}
              aria-label="Fechar novidades"
              className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--bg)]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {loading && entries.length === 0 ? (
            <div className="space-y-2" aria-label="Carregando novidades">
              <Skeleton animated={animations} className="h-20" />
              <Skeleton animated={animations} className="h-20" />
            </div>
          ) : error && entries.length === 0 ? (
            <div className="space-y-2 text-sm text-[var(--muted)]">
              <p>{error}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void refresh()}>Tentar novamente</button>
            </div>
          ) : entries.length === 0 ? (
            <p className="py-2 text-sm text-[var(--muted)]">Ainda não há registros.</p>
          ) : (
            <div className="space-y-2">
              {entries.slice(0, 5).map(entry => (
                <Link
                  key={entry.id}
                  to="/about?aba=novidades"
                  onClick={() => setOpen(false)}
                  className="block rounded-xl outline-none transition-colors hover:bg-[var(--bg)] focus-visible:ring-2 focus-visible:ring-[var(--red)]"
                >
                  <div className="flex items-center justify-between gap-2 px-2 pt-2">
                    <span className="text-xs font-bold text-[var(--red)]">v{entry.version}</span>
                    <time className="text-[10px] text-[var(--muted)]" dateTime={entry.published_at}>
                      {new Date(entry.published_at).toLocaleDateString('pt-BR')}
                    </time>
                  </div>
                  <div className="px-2 pb-2">
                    <div className="truncate text-xs font-semibold text-[var(--text)]">{entry.title}</div>
                    <div className="mt-0.5 line-clamp-1 text-[11px] text-[var(--muted)]">{summarizeChangelogBody(entry.body, 90)}</div>
                  </div>
                </Link>
              ))}
              <Link to="/about?aba=novidades" onClick={() => setOpen(false)} className="block border-t border-[var(--border)] pt-2 text-center text-xs font-semibold text-[var(--red)] hover:underline">
                Ver histórico completo
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
