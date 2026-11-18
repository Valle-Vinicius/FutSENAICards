import pietroGuedesImage from '../imagens/creditosfutsenai/pietroguedes.png';
import viniciusValleImage from '../imagens/creditosfutsenai/viniciusvalle.png';
import viniciusAssuncaoImage from '../imagens/creditosfutsenai/viniciusassuncao.png';

const credits = [
  {
    name: 'Pietro Guedes',
    website: 'https://futsenaijornal.vercel.app/',
    image: pietroGuedesImage,
  },
  {
    name: 'Vinicius Valle',
    website: 'https://fut-senai-cards.vercel.app/',
    image: viniciusValleImage,
  },
  {
    name: 'Vinicius Assuncao',
    website: 'https://futsenai-score.vercel.app/',
    image: viniciusAssuncaoImage,
  },
];

export default function Credits() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-7 text-center">
        <h1 className="text-2xl font-bold text-[var(--text)]">Créditos</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Conheça quem está por trás dos projetos FutSENAI.</p>
      </header>

      <section aria-label="Responsáveis pelos projetos" className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-6">
        {credits.map(({ name, website, image }, index) => (
          <article
            key={name}
            className={`card-surface overflow-hidden p-3 sm:p-4 ${index === 1 ? 'sm:-translate-y-2 sm:border-[var(--red)]' : ''}`}
          >
            <img
              src={image}
              alt={`Foto de ${name}`}
              loading="lazy"
              decoding="async"
              className="aspect-[4/5] w-full rounded-xl bg-[var(--bg)] object-cover object-top"
            />
            <div className="px-1 pb-1 pt-4 text-center">
              <h2 className="text-lg font-bold text-[var(--text)]">{name}</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">Responsável pelo projeto</p>
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block break-all text-sm font-semibold text-[var(--red)] hover:underline"
              >
                {website.replace(/^https:\/\//, '').replace(/\/$/, '')}
              </a>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
