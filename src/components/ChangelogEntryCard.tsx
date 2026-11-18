import type { ChangelogCategory, ChangelogEntry } from '../lib/services/changelog';
import MarkdownBody from './MarkdownBody';

const CATEGORY_LABELS: Record<ChangelogCategory, string> = {
  novo: 'Novo',
  melhoria: 'Melhoria',
  correcao: 'Correção',
  seguranca: 'Segurança',
  balanceamento: 'Balanceamento',
};

const CATEGORY_STYLES: Record<ChangelogCategory, string> = {
  novo: 'bg-emerald-100 text-emerald-800',
  melhoria: 'bg-sky-100 text-sky-800',
  correcao: 'bg-amber-100 text-amber-900',
  seguranca: 'bg-rose-100 text-rose-800',
  balanceamento: 'bg-violet-100 text-violet-800',
};

function ChangelogCategoryBadge({ category }: { category: ChangelogCategory }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${CATEGORY_STYLES[category]}`}>
      {CATEGORY_LABELS[category]}
    </span>
  );
}

export default function ChangelogEntryCard({
  entry,
  compact = false,
}: {
  entry: ChangelogEntry;
  compact?: boolean;
}) {
  return (
    <article className={`card-surface min-w-0 ${compact ? 'space-y-2 p-3' : 'space-y-3 p-4'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[var(--soft)] px-2 py-0.5 text-xs font-bold text-[var(--red)]">v{entry.version}</span>
        <ChangelogCategoryBadge category={entry.category} />
        <time className="ml-auto text-xs text-[var(--muted)]" dateTime={entry.published_at}>
          {new Date(entry.published_at).toLocaleDateString('pt-BR')}
        </time>
      </div>
      <h2 className={`font-semibold text-[var(--text)] ${compact ? 'text-sm' : 'text-base'}`}>{entry.title}</h2>
      <MarkdownBody body={entry.body} />
    </article>
  );
}
