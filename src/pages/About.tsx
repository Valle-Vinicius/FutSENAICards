import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowUpRight,
  Code2,
  Copy,
  Heart,
  History,
  MessageCircle,
} from 'lucide-react';
import ChangelogEntryCard from '../components/ChangelogEntryCard';
import FlipCredit from '../components/FlipCredit';
import Skeleton from '../components/Skeleton';
import { acknowledgements, architectureDescription, credits, feedbackUrl, projectTechnologies } from '../data/credits';
import { APP_VERSION } from '../lib/appVersion';
import { toast } from '../store/toast';
import { useChangelog } from '../store/useChangelog';
import { useGame } from '../store/useGame';
import type { PlayerCard } from '../types';

type AboutTab = 'creditos' | 'novidades';

const TAB_ORDER: AboutTab[] = ['creditos', 'novidades'];
const GITHUB_URL = 'https://github.com/Valle-Vinicius/FutSENAICards';

function NewsPanel() {
  const { entries, loading, loadingMore, error, hasMore, refresh, loadMore, markSeen } = useChangelog();
  const animationsEnabled = useGame(state => state.settings.animations);

  useEffect(() => {
    if (entries[0]) markSeen(entries[0].version);
  }, [entries, markSeen]);

  if (loading && entries.length === 0) {
    return (
      <div className="space-y-3" aria-label="Carregando novidades">
        <Skeleton animated={animationsEnabled} className="h-24 w-full" />
        <Skeleton animated={animationsEnabled} className="h-24 w-full" />
      </div>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div role="alert" className="card-surface flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-[var(--muted)]">
        <span>{error}</span>
        <button type="button" onClick={() => void refresh()} className="btn btn-secondary btn-sm">Tentar novamente</button>
      </div>
    );
  }

  if (entries.length === 0) {
    return <p className="card-surface border-dashed p-5 text-sm text-[var(--muted)]">Em breve</p>;
  }

  return (
    <>
      {error && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 text-sm text-[var(--muted)]">
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()} className="btn btn-secondary btn-sm">Tentar novamente</button>
        </div>
      )}
      <ol aria-label="Novidades da mais recente para a mais antiga" className="space-y-3">
        {entries.map(entry => (
          <li key={entry.id}>
            <ChangelogEntryCard entry={entry} compact />
          </li>
        ))}
      </ol>
      {hasMore && (
        <div className="mt-4 text-center">
          <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="btn btn-secondary btn-sm">
            {loadingMore ? 'Carregando…' : 'Carregar mais'}
          </button>
        </div>
      )}
    </>
  );
}

export default function About({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabValue = searchParams.get('aba');
  const activeTab: AboutTab = tabValue === 'novidades' ? 'novidades' : 'creditos';
  const animationsEnabled = useGame(state => state.settings.animations);
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animationsEnabled && prefersReducedMotion === false;
  const tabButtons = useRef<Record<AboutTab, HTMLButtonElement | null>>({ creditos: null, novidades: null });

  useEffect(() => {
    if (tabValue !== 'creditos' && tabValue !== 'novidades') {
      setSearchParams({ aba: 'creditos' }, { replace: true });
    }
  }, [setSearchParams, tabValue]);

  useEffect(() => {
    const previousTitle = document.title;
    const pageTitle = activeTab === 'creditos' ? 'Créditos · FutSENAI' : 'Sobre · FutSENAI';
    document.title = pageTitle;
    return () => {
      if (document.title === pageTitle) document.title = previousTitle;
    };
  }, [activeTab]);

  const selectTab = (tab: AboutTab) => setSearchParams({ aba: tab });

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentTab: AboutTab) => {
    let nextTab: AboutTab | null = null;
    const currentIndex = TAB_ORDER.indexOf(currentTab);
    if (event.key === 'ArrowRight') nextTab = TAB_ORDER[(currentIndex + 1) % TAB_ORDER.length];
    if (event.key === 'ArrowLeft') nextTab = TAB_ORDER[(currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length];
    if (event.key === 'Home') nextTab = TAB_ORDER[0];
    if (event.key === 'End') nextTab = TAB_ORDER[TAB_ORDER.length - 1];
    if (!nextTab) return;
    event.preventDefault();
    selectTab(nextTab);
    tabButtons.current[nextTab]?.focus();
  };

  const handleCopyLink = async () => {
    if (!navigator.clipboard?.writeText) {
      toast.error('Seu navegador não permite copiar o link automaticamente.');
      return;
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link copiado.');
    } catch (error) {
      console.error('[about] failed to copy page link:', error);
      toast.error('Não foi possível copiar o link.');
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
      {!isAuthenticated && (
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <Link to="/about?aba=creditos" className="text-sm font-black tracking-tight text-[var(--text)]" aria-label="FUTSENAI Sobre">
            <span className="text-[var(--red)]">FUT</span>SENAI
          </Link>
          <Link to="/auth" className="btn btn-secondary btn-sm">Entrar</Link>
        </header>
      )}

      <header className="flex flex-col gap-5 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl border-l-[3px] border-[var(--red)] pl-4 sm:pl-5">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Identidade FUTSENAI</div>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-[var(--text)] sm:text-4xl">Sobre</h1>
          <p className="mt-1 text-sm text-[var(--muted)] sm:text-base">Conheça o FUTSENAI Cards e as pessoas por trás do projeto.</p>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--text)]">
            O FUTSENAI Cards transforma jogadores e partidas em uma experiência de coleção, competição e comunidade.
          </p>
        </div>
        <button type="button" onClick={() => void handleCopyLink()} className="btn btn-secondary btn-sm w-fit">
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copiar link
        </button>
      </header>

      <div role="tablist" aria-label="Seções sobre FutSENAI" className="flex gap-2 border-b border-[var(--border)]">
        <button
          ref={element => { tabButtons.current.creditos = element; }}
          type="button"
          id="about-tab-creditos"
          role="tab"
          aria-selected={activeTab === 'creditos'}
          aria-controls="about-panel-creditos"
          tabIndex={activeTab === 'creditos' ? 0 : -1}
          onClick={() => selectTab('creditos')}
          onKeyDown={event => handleTabKeyDown(event, 'creditos')}
          className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${activeTab === 'creditos' ? 'border-[var(--red)] text-[var(--red)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'}`}
        >
          <Heart className="h-4 w-4" aria-hidden="true" />
          Créditos
        </button>
        <button
          ref={element => { tabButtons.current.novidades = element; }}
          type="button"
          id="about-tab-novidades"
          role="tab"
          aria-selected={activeTab === 'novidades'}
          aria-controls="about-panel-novidades"
          tabIndex={activeTab === 'novidades' ? 0 : -1}
          onClick={() => selectTab('novidades')}
          onKeyDown={event => handleTabKeyDown(event, 'novidades')}
          className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${activeTab === 'novidades' ? 'border-[var(--red)] text-[var(--red)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'}`}
        >
          <History className="h-4 w-4" aria-hidden="true" />
          Novidades
        </button>
      </div>

      <section
        role="tabpanel"
        id="about-panel-creditos"
        aria-labelledby="about-tab-creditos"
        aria-hidden={activeTab !== 'creditos'}
        hidden={activeTab !== 'creditos'}
        inert={activeTab !== 'creditos'}
        tabIndex={0}
        className="outline-none"
      >
        {activeTab === 'creditos' && (
          <div className="space-y-8">
            <section aria-labelledby="about-creators-title">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--red)]">Cartas de autoria</div>
                  <h2 id="about-creators-title" className="mt-1 text-xl font-black uppercase tracking-tight text-[var(--text)] sm:text-2xl">Criadores</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">As pessoas por trás do FUTSENAI.</p>
                </div>
                <span className="border-b-2 border-[var(--red)] px-1 pb-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">
                  {credits.length} criadores
                </span>
              </div>
              <section aria-label="Desenvolvedores" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {credits.map((developer, index) => (
                  <motion.article
                    key={developer.card.name}
                    initial={shouldAnimate ? { opacity: 0, y: 12 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: shouldAnimate ? 0.35 : 0, delay: shouldAnimate ? index * 0.08 : 0 }}
                    className="flex flex-col items-center border-t border-[var(--border)] bg-[var(--panel)] px-3 pb-4 pt-5 sm:px-4"
                  >
                    <div className="w-full max-w-[16rem] sm:max-w-[17rem]">
                      <FlipCredit
                        card={developer.card as unknown as PlayerCard}
                        attributes={developer.attributes}
                        positionLabel="Developer"
                        specialLabel={developer.specialty}
                        projectName={developer.projectName}
                        projectDescription={developer.projectDescription}
                        technologies={developer.technologies}
                        website={developer.website}
                        animationsEnabled={animationsEnabled}
                      />
                    </div>
                    <div className="w-full text-center">
                      <p className="text-sm font-semibold text-[var(--text)]">{developer.role}</p>
                      <a
                        href={developer.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm mt-2"
                      >
                        Abrir projeto
                        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                      </a>
                    </div>
                  </motion.article>
                ))}
              </section>
            </section>

            <section aria-labelledby="about-project-title" className="grid gap-4 border-y border-[var(--border)] bg-[#fbfaf8] px-5 py-5 sm:grid-cols-[minmax(0,1.3fr)_minmax(200px,0.7fr)] sm:items-center sm:px-7">
              <div className="border-l-[3px] border-[var(--red)] pl-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--red)]">A proposta</div>
                <h2 id="about-project-title" className="mt-1 text-lg font-black text-[var(--text)] sm:text-xl">Sobre o FUTSENAI Cards</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
                  Cartas e partidas de futsal da comunidade, reunidas em uma experiência de coleção e competição.
                </p>
              </div>
              <div className="flex items-center gap-3 border-t border-[var(--border)] pt-4 sm:justify-end sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                <span aria-hidden="true" className="h-9 w-1 bg-[var(--red)]" />
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">Projeto</div>
                  <div className="font-black tracking-tight text-[var(--text)]"><span className="text-[var(--red)]">FUT</span>SENAI Cards</div>
                </div>
              </div>
            </section>

            {(projectTechnologies.length > 0 || acknowledgements) && (
              <div className="grid gap-4 lg:grid-cols-2">
                {projectTechnologies.length > 0 && (
                  <section aria-labelledby="about-technologies-title" className="border-t-2 border-[var(--text)] bg-[var(--panel)] px-5 py-5 sm:px-6">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--red)]">Construção</div>
                    <h2 id="about-technologies-title" className="mt-1 text-lg font-black text-[var(--text)]">Tecnologias</h2>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">A stack utilizada no aplicativo, nos dados e na publicação do projeto.</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {projectTechnologies.map(technology => (
                        <span key={technology} className="border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-xs font-semibold text-[var(--text)]">
                          {technology}
                        </span>
                      ))}
                    </div>
                    <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs leading-relaxed text-[var(--muted)]">{architectureDescription}</p>
                  </section>
                )}
                {acknowledgements && (
                  <section aria-labelledby="about-thanks-title" className="flex flex-col justify-between border-t-2 border-[var(--red)] bg-[var(--panel)] px-5 py-5 sm:px-6">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--red)]">Comunidade</div>
                      <h2 id="about-thanks-title" className="mt-1 text-lg font-black text-[var(--text)]">Agradecimentos</h2>
                      <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{acknowledgements}</p>
                    </div>
                    <Heart className="mt-5 h-5 w-5 text-[var(--red)]" aria-hidden="true" />
                  </section>
                )}
              </div>
            )}

            <footer className="flex flex-col gap-4 border-t border-[var(--border)] bg-[#fbfaf8] px-5 py-4 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-xs text-[var(--muted)]">Feito no SENAI · versão {APP_VERSION}</p>
              <nav aria-label="Links sobre FutSENAI" className="flex flex-wrap items-center gap-x-4 gap-y-1 font-semibold">
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--text)] hover:text-[var(--red)]">
                  <Code2 className="h-3.5 w-3.5" aria-hidden="true" /> GitHub
                </a>
                <a href={feedbackUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--text)] hover:text-[var(--red)]">
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> Contato / feedback
                </a>
                <Link to="?aba=novidades" className="inline-flex items-center gap-1 text-[var(--red)] hover:underline">
                  Novidades <History className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </nav>
            </footer>
          </div>
        )}
      </section>
      <section
        role="tabpanel"
        id="about-panel-novidades"
        aria-labelledby="about-tab-novidades"
        aria-hidden={activeTab !== 'novidades'}
        hidden={activeTab !== 'novidades'}
        inert={activeTab !== 'novidades'}
        tabIndex={0}
        className="space-y-3 outline-none"
      >
        {activeTab === 'novidades' && (
          <>
            <div className="mb-4">
              <h2 className="text-xl font-bold text-[var(--text)]">Novidades</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Atualizações, melhorias e correções do FutSENAI Cards.</p>
            </div>
            <NewsPanel />
          </>
        )}
      </section>
    </div>
  );
}
