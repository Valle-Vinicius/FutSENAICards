import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import ChangelogEntryCard from '../components/ChangelogEntryCard';
import Skeleton from '../components/Skeleton';
import { useChangelog } from '../store/useChangelog';
import { useGame } from '../store/useGame';

export default function Changelog() {
  const { entries, loading, loadingMore, error, hasMore, refresh, loadMore, markSeen } = useChangelog();
  const animations = useGame(state => state.settings.animations);

  useEffect(() => {
    document.title = 'Histórico de atualizações | FutSENAI Cards';
  }, []);

  useEffect(() => {
    if (entries[0]) markSeen(entries[0].version);
  }, [entries, markSeen]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:py-7">
      <header className="mb-6 flex items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <Link to="/" aria-label="FUTSENAI - página inicial" className="text-lg font-bold tracking-tight text-[var(--text)]">
          <span className="text-[var(--red)]">FUT</span>SENAI
        </Link>
        <Link to="/" className="btn btn-secondary btn-sm">Entrar / Voltar ao jogo</Link>
      </header>

      <main>
        <h1 className="mb-1 text-xl font-bold text-[var(--text)]">Histórico de atualizações</h1>
        <p className="mb-5 text-sm text-[var(--muted)]">Novidades, melhorias e correções do FutSENAI Cards.</p>

        {error && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 text-sm text-[var(--muted)]">
            <span>{error}</span>
            <button type="button" onClick={() => void refresh()} className="btn btn-secondary btn-sm">Tentar novamente</button>
          </div>
        )}

        {loading && entries.length === 0 ? (
          <div className="space-y-4" aria-label="Carregando histórico">
            {[0, 1, 2].map(item => (
              <div key={item} className="card-surface space-y-3 p-4">
                <Skeleton animated={animations} className="h-4 w-2/5" />
                <Skeleton animated={animations} className="h-5 w-3/4" />
                <Skeleton animated={animations} className="h-10 w-full" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          !error && <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-5 text-sm text-[var(--muted)]">Ainda não há registros.</p>
        ) : (
          <>
            <ol aria-label="Atualizações, da mais recente para a mais antiga" className="relative space-y-4 border-l border-[var(--border)] pl-5">
              {entries.map(entry => (
                <li key={entry.id} className="relative min-w-0">
                  <span aria-hidden="true" className="absolute -left-[1.58rem] top-5 h-3 w-3 rounded-full border-2 border-[var(--red)] bg-[var(--bg)]" />
                  <ChangelogEntryCard entry={entry} />
                </li>
              ))}
            </ol>
            {hasMore && (
              <div className="mt-5 text-center">
                <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="btn btn-secondary">
                  {loadingMore ? 'Carregando…' : 'Carregar mais'}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
