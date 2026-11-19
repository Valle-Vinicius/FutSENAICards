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
          <Route path="/collection" element={<div>Conteúdo das cartas</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Layout navigation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses the grouped topbar only on the overview page', () => {
    renderLayout('/');

    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
    expect(screen.queryByText('Futsenai')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getAllByRole('link', { name: 'Montar elenco' }).some(link => link.getAttribute('href') === '/squad')).toBe(true);
    expect(screen.getAllByRole('link', { name: 'Leaderboard' }).some(link => link.getAttribute('href') === '/leaderboard')).toBe(true);
  });

  it('keeps the existing page navigation on other routes', () => {
    renderLayout('/collection');

    expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Minhas cartas' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Conteúdo das cartas')).toBeInTheDocument();
  });
});
