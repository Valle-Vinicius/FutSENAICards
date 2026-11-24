import { Link } from 'react-router-dom';
import { APP_VERSION } from '../lib/appVersion';
import { useGame } from '../store/useGame';

type PreferenceSwitchProps = {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

function PreferenceSwitch({ title, description, checked, onChange }: PreferenceSwitchProps) {
  return (
    <label className="flex min-h-[76px] cursor-pointer items-center justify-between gap-5 border-b border-[var(--border)] py-4 last:border-b-0">
      <span className="min-w-0">
        <span className="block text-sm font-bold text-[var(--text)]">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-[var(--muted)]">{description}</span>
      </span>
      <span className="relative inline-flex shrink-0 items-center">
        <input
          type="checkbox"
          role="switch"
          aria-label={title}
          aria-checked={checked}
          checked={checked}
          onChange={event => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="relative h-7 w-12 rounded-full bg-[#d7d9df] transition-colors after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-[var(--red)] peer-checked:after:translate-x-5 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--red)] motion-reduce:transition-none motion-reduce:after:transition-none"
        />
      </span>
    </label>
  );
}

export default function Settings() {
  const settings = useGame(state => state.settings);
  const updateSettings = useGame(state => state.updateSettings);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="border-b border-[var(--border)] pb-5">
        <div className="border-l-[3px] border-[var(--red)] pl-4">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Sua experiência</div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-[var(--text)] sm:text-3xl">Configurações</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Personalize sua experiência no FUTSENAI.</p>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.8fr)]">
        <section aria-labelledby="settings-accessibility-title" className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)]">
          <div className="border-b border-[var(--border)] px-5 py-5 sm:px-6">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--red)]">Preferências</div>
            <h2 id="settings-accessibility-title" className="mt-1 text-lg font-black text-[var(--text)]">Acessibilidade</h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              Ajuste a interface para deixar sua experiência mais confortável.
            </p>
          </div>
          <div className="px-5 sm:px-6">
            <PreferenceSwitch
              title="Áudio"
              description="Controla os sons nas partidas e na abertura de pacotes."
              checked={settings.audio}
              onChange={audio => updateSettings({ audio })}
            />
            <PreferenceSwitch
              title="Animações"
              description="Controla as animações nas telas compatíveis."
              checked={settings.animations}
              onChange={animations => updateSettings({ animations })}
            />
            <PreferenceSwitch
              title="Alto contraste"
              description="Preferência de contraste da interface."
              checked={settings.highContrast}
              onChange={highContrast => updateSettings({ highContrast })}
            />
          </div>
        </section>

        <section aria-labelledby="settings-about-title" className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)]">
          <div className="h-1 bg-[var(--red)]" />
          <div className="p-5 sm:p-6">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--red)]">Institucional</div>
            <h2 id="settings-about-title" className="mt-1 text-lg font-black text-[var(--text)]">Sobre o FUTSENAI</h2>

            <div className="mt-5 flex items-center justify-between gap-3 border-y border-[var(--border)] py-4">
              <div>
                <div className="font-black tracking-tight text-[var(--text)]">
                  <span className="text-[var(--red)]">FUT</span>SENAI Cards
                </div>
                <div className="mt-1 text-xs text-[var(--muted)]">Plataforma de cartas e competição</div>
              </div>
              <span className="shrink-0 border border-[var(--border)] px-2.5 py-1 text-[10px] font-bold tabular-nums text-[var(--muted)]">
                v{APP_VERSION}
              </span>
            </div>

            <nav aria-label="Informações do FUTSENAI" className="mt-1">
              <Link
                to="/about?aba=creditos"
                className="flex min-h-11 items-center justify-between border-b border-[var(--border)] text-sm font-semibold text-[var(--text)] transition-colors hover:text-[var(--red)]"
              >
                Créditos <span aria-hidden="true" className="text-lg text-[var(--red)]">→</span>
              </Link>
              <Link
                to="/about?aba=novidades"
                className="flex min-h-11 items-center justify-between text-sm font-semibold text-[var(--text)] transition-colors hover:text-[var(--red)]"
              >
                Novidades <span aria-hidden="true" className="text-lg text-[var(--red)]">→</span>
              </Link>
            </nav>
          </div>
        </section>
      </div>
    </div>
  );
}
