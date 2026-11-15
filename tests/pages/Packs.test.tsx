import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_PACKS } from '../../src/lib/game';
import { useGame } from '../../src/store/useGame';
import Packs from '../../src/pages/Packs';

jest.mock('../../src/store/useGame', () => ({ useGame: jest.fn() }));

const mockedUseGame = jest.mocked(useGame);

describe('Packs page layout', () => {
  beforeEach(() => {
    const state = { packConfigs: DEFAULT_PACKS, coins: 500 };
    mockedUseGame.mockImplementation(selector => selector(state as unknown as ReturnType<typeof useGame.getState>));
  });

  it('groups all packs in the requested order and shows localized rarity probabilities', () => {
    render(<MemoryRouter><Packs /></MemoryRouter>);

    expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual([
      'Clássicos',
      'Especiais',
      'Eventos',
    ]);
    expect(screen.getAllByRole('article')).toHaveLength(9);
    expect(screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual(
      DEFAULT_PACKS.map(pack => pack.name.toLocaleUpperCase('pt-BR')),
    );
    expect(screen.getByRole('heading', { name: 'PACOTE OFF-SALE' })).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /Probabilidades:/ })).toHaveLength(9);
    expect(screen.getAllByRole('img', {
      name: /Comum 62\.0%, Incomum 25\.0%, Rara 10\.0%, Épica 2\.5%, Lendária 0\.4%, Ícone 0\.1%/,
    })).toHaveLength(2);
  });

  it('keeps the existing open link and insufficient-balance state', () => {
    render(<MemoryRouter><Packs /></MemoryRouter>);

    expect(screen.getAllByRole('link', { name: 'ABRIR' }).some(link => link.getAttribute('href') === '/open/bronze')).toBe(true);
    expect(screen.getAllByRole('link', { name: 'Saldo insuficiente' }).every(link => link.getAttribute('aria-disabled') === 'true')).toBe(true);
  });
});
