import { Link } from 'react-router-dom';
import { useGame } from '../store/useGame';
import { APP_VERSION } from '../lib/appVersion';

export default function Settings() {
  const settings = useGame(s => s.settings);
  const updateSettings = useGame(s => s.updateSettings);
  return (
    <div className="p-4 md:p-8 space-y-4 max-w-2xl">
      <h1 className="text-2xl md:text-3xl font-semibold text-[var(--text)]">Configurações</h1>
      <div className="card-surface p-4 space-y-3">
        <label className="flex items-center justify-between">
          <span className="text-sm text-[var(--text)]">Áudio</span>
          <input type="checkbox" checked={settings.audio} onChange={e => updateSettings({ audio: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm text-[var(--text)]">Animações</span>
          <input type="checkbox" checked={settings.animations} onChange={e => updateSettings({ animations: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm text-[var(--text)]">Alto contraste</span>
          <input type="checkbox" checked={settings.highContrast} onChange={e => updateSettings({ highContrast: e.target.checked })} />
        </label>
      </div>
      <section aria-labelledby="settings-about-title" className="card-surface space-y-3 p-4">
        <div>
          <h2 id="settings-about-title" className="text-base font-semibold text-[var(--text)]">Sobre</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">FutSENAI Cards · versão {APP_VERSION}</p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm font-medium">
          <Link to="/about?aba=creditos" className="text-[var(--red)] hover:underline">Créditos</Link>
          <Link to="/about?aba=novidades" className="text-[var(--red)] hover:underline">Novidades</Link>
        </div>
      </section>
    </div>
  );
}
