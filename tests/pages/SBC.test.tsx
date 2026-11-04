import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { PlayerCard } from '../../src/types';
import { useGame } from '../../src/store/useGame';
import SBC from '../../src/pages/SBC';

jest.mock('../../src/components/Card', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/store/useGame', () => ({ useGame: jest.fn() }));

const mockedUseGame = jest.mocked(useGame);
const mockCompleteSBC = jest.fn(() => true);

function makeCard(index: number): PlayerCard {
  return {
    uid: `card-${index}`,
    playerId: `player-${index}`,
    name: `Jogador ${index}`,
    position: 'Ala',
    sport: 'futsal',
    nationality: 'Brasil',
    age: 20,
    club: 'Clube',
    rarity: 'common',
    edition: '2025/26',
    special: 'none',
    overall: 60,
    pace: 60,
    shooting: 60,
    passing: 60,
    dribbling: 60,
    defending: 60,
    physical: 60,
    obtainedAt: 0,
    favorite: false,
    isNew: false,
  };
}

describe('SBC page', () => {
  beforeEach(() => {
    const state = {
      sbcs: [
        {
          id: 'gold',
          title: 'Desafio Ouro',
          description: 'Desafio de teste',
          requirements: { minOverall: 75, count: 5 },
          reward: { type: 'pack' as const, value: 'gold' },
          repeatable: false,
        },
        {
          id: 'futsal',
          title: 'Desafio Futsal',
          description: 'Outro desafio de teste',
          requirements: { count: 5 },
          reward: { type: 'coins' as const, value: 2000 },
          repeatable: true,
        },
      ],
      cards: Array.from({ length: 4000 }, (_, index) => makeCard(index)),
      completeSBC: mockCompleteSBC,
    };
    mockedUseGame.mockImplementation(selector => selector(state as unknown as ReturnType<typeof useGame.getState>));
    mockCompleteSBC.mockClear();
  });

  it('renders only the active challenge card page and searches the shared collection', () => {
    const { container } = render(<SBC />);
    expect(screen.getAllByRole('button', { name: /^Selecionar Jogador/ })).toHaveLength(48);

    fireEvent.click(screen.getByRole('tab', { name: /Desafio Futsal/ }));
    expect(screen.getAllByRole('button', { name: /^Selecionar Jogador/ })).toHaveLength(48);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar cartas' }), {
      target: { value: 'Jogador 3999' },
    });
    expect(screen.getAllByRole('button', { name: /^Selecionar Jogador/ })).toHaveLength(1);
    expect(container.textContent).toContain('1 cartas');
  });

  it('preserves independent selections when switching challenges', () => {
    render(<SBC />);
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Jogador 0, overall 60' }));
    fireEvent.click(screen.getByRole('tab', { name: /Desafio Futsal/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Jogador 1, overall 60' }));
    fireEvent.click(screen.getByRole('tab', { name: /Desafio Ouro/ }));

    expect(screen.getByText('1 selecionadas · Mostrando 1–48 de 4000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover Jogador 0, overall 60' })).toHaveAttribute('aria-pressed', 'true');
  });
});
