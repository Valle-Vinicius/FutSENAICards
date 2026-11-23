import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { PlayerCard } from '../../src/types';
import { useGame } from '../../src/store/useGame';
import SBC from '../../src/pages/SBC';

jest.mock('../../src/components/Card', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/store/useGame', () => ({ useGame: jest.fn() }));
jest.mock('../../src/lib/supabase', () => ({ supabase: null }));
jest.mock('../../src/lib/services/sbc', () => ({ getSBCCompletionHistory: jest.fn() }));

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
    overall: 80,
    pace: 80,
    shooting: 80,
    passing: 80,
    dribbling: 80,
    defending: 80,
    physical: 80,
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
          id: 'sbc1',
          title: 'Desafio Ouro',
          description: 'Desafio de teste',
          requirements: { minOverall: 75, count: 5 },
          reward: { type: 'pack' as const, value: 'gold' },
          repeatable: false,
        },
        {
          id: 'sbc2',
          title: 'Desafio Futsal',
          description: 'Outro desafio de teste',
          requirements: { position: 'any', count: 5 },
          reward: { type: 'coins' as const, value: 2000 },
          repeatable: true,
        },
      ],
      cards: Array.from({ length: 4000 }, (_, index) => makeCard(index)),
      listings: [],
      squads: { futsal: { starters: [], bench: [] } },
      savedSquads: [],
      packConfigs: [],
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
    expect(container.textContent).toContain('1 CARTA');
  });

  it('preserves independent selections when switching challenges', () => {
    render(<SBC />);
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Jogador 0, overall 80' }));
    fireEvent.click(screen.getByRole('tab', { name: /Desafio Futsal/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Jogador 1, overall 80' }));
    fireEvent.click(screen.getByRole('tab', { name: /Desafio Ouro/ }));

    expect(screen.getByText('1 de 5 selecionadas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover Jogador 0, overall 80' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows why a card cannot be added after the required position slots are filled', () => {
    render(<SBC />);
    fireEvent.click(screen.getByRole('tab', { name: /Desafio Futsal/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Jogador 0, overall 80' }));
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Jogador 1, overall 80' }));

    expect(screen.getByRole('button', {
      name: 'Indisponível Jogador 2, overall 80: As vagas de Ala já foram preenchidas.',
    })).toBeDisabled();
    expect(screen.getAllByText('As vagas de Ala já foram preenchidas.').length).toBeGreaterThan(0);
  });

  it('requires confirmation before submitting the selected player cards', async () => {
    render(<SBC />);
    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: `Selecionar Jogador ${index}, overall 80` }));
    }

    fireEvent.click(screen.getByRole('button', { name: /ENTREGAR DESAFIO/ }));
    expect(screen.getByText(/As cartas abaixo serão consumidas permanentemente/)).toBeInTheDocument();
    expect(mockCompleteSBC).not.toHaveBeenCalled();

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Entregar desafio' }));
    await waitFor(() => expect(mockCompleteSBC).toHaveBeenCalledWith(
      'sbc1',
      ['card-0', 'card-1', 'card-2', 'card-3', 'card-4'],
    ));
  });
});
