import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import About from '../../src/pages/About';

jest.mock('../../src/store/useGame', () => ({
  useGame: (selector: (state: { settings: { animations: boolean } }) => unknown) =>
    selector({ settings: { animations: true } }),
}));
jest.mock('../../src/data/players', () => ({ getPlayerImage: () => undefined }));
jest.mock('../../src/store/useChangelog', () => ({
  useChangelog: () => ({
    entries: [],
    loading: false,
    loadingMore: false,
    error: null,
    hasMore: false,
    refresh: jest.fn(),
    loadMore: jest.fn(),
    markSeen: jest.fn(),
  }),
}));

function renderAbout(path = '/about?aba=creditos') {
  function CurrentTab() {
    const [params] = useSearchParams();
    return <output data-testid="active-query-tab">{params.get('aba')}</output>;
  }

  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/about" element={<><About /><CurrentTab /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('About page', () => {
  it('shows the three developers in the requested order with working project links', () => {
    renderAbout();

    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/auth');
    const cards = screen.getByRole('region', { name: 'Desenvolvedores' });
    expect(within(cards).getAllByRole('button', { name: /Virar carta de/ }).map(button => button.getAttribute('aria-label'))).toEqual([
      'Virar carta de Pietro Guedes para ver o projeto Jornal FutSENAI',
      'Virar carta de Vinicius Valle para ver o projeto FutSENAI Cards',
      'Virar carta de Vinicius Assuncao para ver o projeto FutSENAI Score',
    ]);
    expect(within(cards).getByText('Criador do Jornal')).toBeInTheDocument();
    expect(within(cards).queryByRole('heading', { name: 'Vinicius Assuncao' })).not.toBeInTheDocument();
    expect(within(cards).getAllByText('Developer · FutSENAI')).toHaveLength(3);
    expect(within(cards).getAllByText('Criadores')).toHaveLength(3);
    const links = within(cards).getAllByRole('link', { name: 'Abrir projeto' });
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      'https://futsenaijornal.vercel.app/',
      'https://fut-senai-cards.vercel.app/',
      'https://futsenai-score.vercel.app/',
    ]);
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(within(cards).getAllByRole('img')).toHaveLength(3);
    expect(screen.queryByRole('heading', { name: 'Projetos' })).not.toBeInTheDocument();
    expect(screen.getByText('Feito no SENAI · versão 1.0.0')).toBeInTheDocument();
  });

  it('flips a credit card by button and exposes its back link only when visible', () => {
    renderAbout();

    expect(screen.getAllByRole('link', { name: 'Abrir projeto' })).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Virar carta de Pietro Guedes para ver o projeto Jornal FutSENAI' }));

    expect(screen.getByRole('button', { name: 'Virar carta de Pietro Guedes para a frente' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('link', { name: 'Abrir projeto' })).toHaveLength(4);
    expect(screen.getByText('Cartas e partidas de futsal da comunidade.')).toBeInTheDocument();
    const firstCard = within(screen.getByRole('region', { name: 'Desenvolvedores' })).getAllByRole('article')[0];
    expect(within(firstCard).getByText('TypeScript')).toBeInTheDocument();
  });

  it('shows the same technology stack on all three card backs', () => {
    renderAbout();
    const developers = screen.getByRole('region', { name: 'Desenvolvedores' });
    const articles = within(developers).getAllByRole('article');

    for (const article of articles) {
      fireEvent.click(within(article).getByRole('button', { name: /para ver o projeto/ }));
      for (const technology of ['React', 'TypeScript', 'Vite', 'Tailwind CSS', 'Supabase', 'Vercel']) {
        expect(within(article).getByText(technology)).toBeInTheDocument();
      }
    }
  });

  it('switches tabs and displays the empty public-news state', () => {
    renderAbout();

    expect(document.getElementById('about-panel-novidades')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Novidades' }));

    expect(screen.getByRole('tab', { name: 'Novidades' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('active-query-tab')).toHaveTextContent('novidades');
    expect(screen.getByRole('tabpanel', { name: 'Novidades' })).toHaveTextContent('Em breve');
  });

  it('moves between tabs with the arrow keys', () => {
    renderAbout();
    const creditsTab = screen.getByRole('tab', { name: 'Créditos' });
    const newsTab = screen.getByRole('tab', { name: 'Novidades' });

    creditsTab.focus();
    fireEvent.keyDown(creditsTab, { key: 'ArrowRight' });

    expect(newsTab).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(newsTab);
  });
});
