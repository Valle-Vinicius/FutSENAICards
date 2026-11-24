import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useGame } from '../../src/store/useGame';
import Layout from '../../src/components/Layout';

jest.mock('../../src/store/useGame', () => ({ useGame: jest.fn() }));
jest.mock('../../src/lib/supabase', () => ({ supabase: null }));
jest.mock('../../src/components/ChangelogPopover', () => ({ __esModule: true, default: () => null }));

const mockedUseGame = jest.mocked(useGame);
const gameState = {
  avatarUrl: null,
  coins: 1200,
  xp: 100,
  level: 1,
  newCardUids: [],
  pendingFriends: 0,
  transactions: [],
  missions: [],
  listings: [],
  cards: [],
};

function renderLayout(path: string) {
  mockedUseGame.mockImplementation(selector => selector(gameState as never));
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<div>Conteúdo da visão geral</div>} />
          <Route path="/packs" element={<div>Conteúdo da loja de pacotes</div>} />
          <Route path="/open/:packId" element={<div>Conteúdo da abertura</div>} />
          <Route path="/collection" element={<div>Conteúdo das cartas</div>} />
          <Route path="/squad" element={<div>Conteúdo do elenco</div>} />
          <Route path="/compare" element={<div>Conteúdo da comparação</div>} />
          <Route path="/match" element={<div>Conteúdo da partida</div>} />
          <Route path="/sbc" element={<div>Conteúdo dos desafios</div>} />
          <Route path="/missions" element={<div>Conteúdo das missões</div>} />
          <Route path="/friends" element={<div>Conteúdo das amizades</div>} />
          <Route path="/profile" element={<div>Conteúdo do meu perfil</div>} />
          <Route path="/profile/:userId" element={<div>Conteúdo do perfil do jogador</div>} />
          <Route path="/leaderboard" element={<div>Conteúdo do leaderboard</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Layout navigation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses the grouped topbar on the overview page', () => {
    renderLayout('/');

    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
    expect(screen.queryByText('Futsenai')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getAllByRole('link', { name: 'Montar elenco' }).some(link => link.getAttribute('href') === '/squad')).toBe(true);
    expect(screen.getAllByRole('link', { name: 'Leaderboard' }).some(link => link.getAttribute('href') === '/leaderboard')).toBe(true);
  });

  it('uses the Home topbar and hides the sidebar on the collection route', () => {
    renderLayout('/collection');

    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
    expect(document.querySelector('aside')).not.toBeInTheDocument();
    expect(document.querySelector('.home-layout')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo das cartas')).toBeInTheDocument();
  });

  it('uses the Home topbar and hides the sidebar on the squad route', () => {
    renderLayout('/squad');

    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
    expect(document.querySelector('aside')).not.toBeInTheDocument();
    expect(document.querySelector('.home-layout')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo do elenco')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getAllByRole('link', { name: 'Montar elenco' }).some(link => link.getAttribute('href') === '/squad')).toBe(true);
  });

  it('uses the Home topbar and hides the sidebar on the compare route', () => {
    renderLayout('/compare');

    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
    expect(document.querySelector('aside')).not.toBeInTheDocument();
    expect(document.querySelector('.home-layout')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo da comparação')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getAllByRole('link', { name: 'Comparar jogadores' }).some(link => link.getAttribute('href') === '/compare')).toBe(true);
  });

  it('uses the Home topbar and hides the sidebar on the pack opening route', () => {
    renderLayout('/open/bronze');

    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
    expect(screen.queryByText('Futsenai')).not.toBeInTheDocument();
    expect(screen.getByText('Conteúdo da abertura')).toBeInTheDocument();
    expect(document.querySelector('.home-layout')).not.toHaveClass('home-layout--packs');
    expect(screen.getByText('Conteúdo da abertura').closest('main')).not.toHaveClass('home-layout__main--packs');
  });

  it('uses the global topbar with coins and no sidebar on the match route', () => {
    renderLayout('/match');

    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
    expect(document.querySelector('aside')).not.toBeInTheDocument();
    expect(document.querySelector('.home-layout')).toBeInTheDocument();
    expect(screen.getByLabelText('1.200 moedas')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo da partida')).toBeInTheDocument();
  });

  it('uses the global topbar with coins and no sidebar on the SBC route', () => {
    renderLayout('/sbc');

    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
    expect(document.querySelector('aside')).not.toBeInTheDocument();
    expect(screen.getByLabelText('1.200 moedas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
    expect(screen.getByText('Conteúdo dos desafios')).toBeInTheDocument();
  });

  it('uses the global topbar with coins and no sidebar on the missions route', () => {
    renderLayout('/missions');

    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
    expect(document.querySelector('aside')).not.toBeInTheDocument();
    expect(screen.getByLabelText('1.200 moedas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
    expect(screen.getByText('Conteúdo das missões')).toBeInTheDocument();
  });

  it('uses the global topbar and hides the sidebar on the friends route', () => {
    renderLayout('/friends');

    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
    expect(document.querySelector('aside')).not.toBeInTheDocument();
    expect(screen.getByText('Conteúdo das amizades')).toBeInTheDocument();
  });

  it('uses the global topbar and hides the sidebar on another player profile', () => {
    renderLayout('/profile/player-1');

    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
    expect(document.querySelector('aside')).not.toBeInTheDocument();
    expect(screen.getByText('Conteúdo do perfil do jogador')).toBeInTheDocument();
  });

  it('uses the global topbar and hides the sidebar on my profile', () => {
    renderLayout('/profile');

    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
    expect(document.querySelector('aside')).not.toBeInTheDocument();
    expect(screen.getByText('Conteúdo do meu perfil')).toBeInTheDocument();
  });

  it('uses the global topbar and hides the sidebar on the leaderboard route', () => {
    renderLayout('/leaderboard');

    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
    expect(document.querySelector('aside')).not.toBeInTheDocument();
    expect(document.querySelector('.home-layout')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo do leaderboard')).toBeInTheDocument();
  });

  it('uses the Home topbar on the pack store route', () => {
    renderLayout('/packs');

    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
    expect(screen.queryByText('Futsenai')).not.toBeInTheDocument();
    expect(screen.getByText('Conteúdo da loja de pacotes')).toBeInTheDocument();
    expect(document.querySelector('.home-layout')).toHaveClass('home-layout--packs');
    expect(screen.getByText('Conteúdo da loja de pacotes').closest('main')).toHaveClass('home-layout__main--packs');
  });
});
