import { useGame } from '../store/useGame';

export default function Settings() {
  const settings = useGame(s => s.settings);
  const updateSettings = useGame(s => s.updateSettings);
  return (
    <div className="p-4 md:p-8 space-y-4 max-w-2xl">
      <h1 className="text-2xl md:text-3xl font-semibold text-[#252733]">Configurações</h1>
      <div className="card-surface p-4 space-y-3">
        <label className="flex items-center justify-between">
          <span className="text-sm text-[#252733]">Áudio</span>
          <input type="checkbox" checked={settings.audio} onChange={e => updateSettings({ audio: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm text-[#252733]">Animações</span>
          <input type="checkbox" checked={settings.animations} onChange={e => updateSettings({ animations: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm text-[#252733]">Alto contraste</span>
          <input type="checkbox" checked={settings.highContrast} onChange={e => updateSettings({ highContrast: e.target.checked })} />
        </label>
      </div>
    </div>
  );
}
