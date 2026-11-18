import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import ChangelogEntryCard from './ChangelogEntryCard';
import {
  adminDeleteChangelogEntry,
  adminSaveChangelogEntry,
  type ChangelogCategory,
  type ChangelogEntry,
} from '../lib/services/changelog';
import { toast } from '../store/toast';
import { useChangelog } from '../store/useChangelog';

const CATEGORIES: { value: ChangelogCategory; label: string }[] = [
  { value: 'novo', label: 'Novo' },
  { value: 'melhoria', label: 'Melhoria' },
  { value: 'correcao', label: 'Correção' },
  { value: 'seguranca', label: 'Segurança' },
  { value: 'balanceamento', label: 'Balanceamento' },
];

interface ChangelogForm {
  version: string;
  title: string;
  body: string;
  category: ChangelogCategory;
  publishedAt: string;
}

const EMPTY_FORM: ChangelogForm = {
  version: '',
  title: '',
  body: '',
  category: 'novo',
  publishedAt: '',
};

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function AdminChangelogPanel() {
  const { entries, loading, loadingMore, error, hasMore, refresh, loadMore } = useChangelog();
  const [form, setForm] = useState<ChangelogForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChangelogEntry | null>(null);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const startEditing = (entry: ChangelogEntry) => {
    setEditingId(entry.id);
    setForm({
      version: entry.version,
      title: entry.title,
      body: entry.body,
      category: entry.category,
      publishedAt: toLocalDateTime(entry.published_at),
    });
  };

  const saveEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const version = form.version.trim();
    const title = form.title.trim();
    const body = form.body.trim();
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) || version.length > 20) {
      toast.error('Use uma versão semântica no formato x.y.z, com até 20 caracteres.');
      return;
    }
    if (!title || [...title].length > 120) {
      toast.error('O título deve ter entre 1 e 120 caracteres.');
      return;
    }
    if (!body || [...body].length > 4000) {
      toast.error('O conteúdo deve ter entre 1 e 4.000 caracteres.');
      return;
    }

    setSaving(true);
    try {
      await adminSaveChangelogEntry({
        id: editingId,
        version,
        title,
        body,
        category: form.category,
        published_at: form.publishedAt ? new Date(form.publishedAt).toISOString() : null,
      });
      toast.success(editingId ? 'Atualização editada com sucesso.' : 'Atualização publicada com sucesso.');
      resetForm();
      await refresh();
    } catch (saveError) {
      console.error('[admin changelog] failed to save entry:', saveError);
      toast.error(saveError instanceof Error ? `Não foi possível salvar: ${saveError.message}` : 'Não foi possível salvar a atualização.');
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const deleted = await adminDeleteChangelogEntry(deleteTarget.id);
      if (!deleted) {
        toast.error('A atualização não foi encontrada ou já foi excluída.');
        return;
      }
      toast.success('Atualização excluída.');
      if (editingId === deleteTarget.id) resetForm();
      setDeleteTarget(null);
      await refresh();
    } catch (deleteError) {
      console.error('[admin changelog] failed to delete entry:', deleteError);
      toast.error(deleteError instanceof Error ? `Não foi possível excluir: ${deleteError.message}` : 'Não foi possível excluir a atualização.');
    } finally {
      setDeleting(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)]';

  return (
    <section className="space-y-5">
      <form onSubmit={saveEntry} className="card-surface space-y-4 p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-[var(--text)]">{editingId ? 'Editar atualização' : 'Nova atualização'}</h2>
          {editingId && <button type="button" onClick={resetForm} className="btn btn-secondary btn-sm">Cancelar edição</button>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold text-[var(--muted)]">
            Versão
            <input required value={form.version} onChange={event => setForm({ ...form, version: event.target.value })} maxLength={20} placeholder="1.4.0" className={inputClass} />
          </label>
          <label className="space-y-1 text-xs font-semibold text-[var(--muted)]">
            Categoria
            <select value={form.category} onChange={event => setForm({ ...form, category: event.target.value as ChangelogCategory })} className={inputClass}>
              {CATEGORIES.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold text-[var(--muted)] sm:col-span-2">
            Título
            <input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} className={inputClass} />
          </label>
          <label className="space-y-1 text-xs font-semibold text-[var(--muted)] sm:col-span-2">
            Conteúdo (Markdown simples)
            <textarea required value={form.body} onChange={event => setForm({ ...form, body: event.target.value })} rows={5} className={`${inputClass} resize-y`} />
            <span className="block text-right font-normal">{[...form.body].length}/4000 caracteres</span>
          </label>
          <label className="space-y-1 text-xs font-semibold text-[var(--muted)] sm:col-span-2">
            Data de publicação (opcional)
            <input type="datetime-local" value={form.publishedAt} onChange={event => setForm({ ...form, publishedAt: event.target.value })} className={inputClass} />
          </label>
        </div>
        <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Salvando…' : editingId ? 'Salvar edição' : 'Publicar atualização'}
        </button>
      </form>

      <div className="space-y-3">
        <h2 className="text-base font-bold text-[var(--text)]">Atualizações publicadas</h2>
        {error && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] p-3 text-sm text-[var(--muted)]">
            <span>{error}</span>
            <button type="button" onClick={() => void refresh()} className="btn btn-secondary btn-sm">Tentar novamente</button>
          </div>
        )}
        {loading && entries.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Carregando atualizações…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Ainda não há registros.</p>
        ) : (
          <div className="space-y-3">
            {entries.map(entry => (
              <div key={entry.id} className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <ChangelogEntryCard entry={entry} compact />
                <div className="flex justify-end gap-2 sm:pt-1">
                  <button type="button" onClick={() => startEditing(entry)} aria-label={`Editar ${entry.title}`} className="btn btn-secondary btn-sm">
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar
                  </button>
                  <button type="button" onClick={() => setDeleteTarget(entry)} aria-label={`Excluir ${entry.title}`} className="btn btn-danger btn-sm">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {hasMore && (
          <div className="text-center">
            <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="btn btn-secondary btn-sm">
              {loadingMore ? 'Carregando…' : 'Carregar mais'}
            </button>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        title="Excluir atualização?"
        message={deleteTarget ? `A versão ${deleteTarget.version} — ${deleteTarget.title} será removida do histórico público.` : ''}
        onConfirm={() => void deleteEntry()}
        onCancel={() => !deleting && setDeleteTarget(null)}
        confirmLabel={deleting ? 'Excluindo…' : 'Excluir'}
        confirmVariant="danger"
        confirmDisabled={deleting}
      />
    </section>
  );
}
