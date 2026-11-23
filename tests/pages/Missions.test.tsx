import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Achievement, Mission, Transaction } from '../../src/types';
import { useGame } from '../../src/store/useGame';
import { toast } from '../../src/store/toast';
import Missions from '../../src/pages/Missions';

jest.mock('../../src/store/useGame', () => ({ useGame: jest.fn() }));
jest.mock('../../src/store/toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockedUseGame = jest.mocked(useGame);
const mockClaimMission = jest.fn<Promise<boolean>, [string]>();
const mockUpdateMissionProgress = jest.fn();

const missions: Mission[] = [
  {
    id: 'm1',
    title: 'Primeiros passos',
    description: 'Abra 1 pacote',
    target: 1,
    progress: 1,
    reward: 300,
    rewardXp: 50,
    type: 'open_packs',
    completed: true,
    claimed: false,
  },
  {
    id: 'm2',
    title: 'Abridor dedicado',
    description: 'Abra 3 pacotes',
    target: 3,
    progress: 1,
    reward: 800,
    rewardXp: 120,
    type: 'open_packs',
    completed: false,
    claimed: false,
  },
  {
    id: 'm3',
    title: 'Colecionador iniciante',
    description: 'Colecione 10 jogadores',
    target: 10,
    progress: 4,
    reward: 500,
    rewardXp: 80,
    type: 'collect',
    completed: false,
    claimed: false,
  },
  {
    id: 'm4',
    title: 'Elenco completo',
    description: 'Monte um elenco completo',
    target: 5,
    progress: 5,
    reward: 1200,
    rewardXp: 250,
    type: 'futsal_squad',
    completed: true,
    claimed: true,
  },
];

const achievements: Achievement[] = [
  {
    id: 'a1',
    title: 'Primeira carta',
    description: 'Obtenha sua primeira carta',
    unlocked: true,
    unlockedAt: new Date('2026-06-15T12:00:00Z').getTime(),
  },
  {
    id: 'a2',
    title: 'Colecionador',
    description: 'Tenha 20 cartas',
    unlocked: false,
  },
];

const transactions: Transaction[] = [
  {
    id: 'tx1',
    type: 'earn',
    amount: 300,
    reason: 'Missão: Primeiros passos',
    at: new Date('2026-06-15T12:00:00Z').getTime(),
  },
];

describe('Missions page', () => {
  beforeEach(() => {
    const state = {
      missions,
      achievements,
      level: 3,
      xp: 1275,
      coins: 4200,
      transactions,
      claimMission: mockClaimMission,
      updateMissionProgress: mockUpdateMissionProgress,
    };
    mockedUseGame.mockImplementation(selector => selector(state as never));
    mockClaimMission.mockReset().mockResolvedValue(true);
    mockUpdateMissionProgress.mockReset();
    jest.mocked(toast.success).mockReset();
    jest.mocked(toast.error).mockReset();
  });

  it('shows real level progression, balances, and completion counts', () => {
    render(<Missions />);

    expect(screen.getByText('1.275 XP acumulados')).toBeInTheDocument();
    expect(screen.getByText('4.200')).toBeInTheDocument();
    expect(screen.getByText('OBJETIVOS CONCLUÍDOS').parentElement).toHaveTextContent('2 / 4');
    expect(screen.getByLabelText('Progresso para o nível 4')).toHaveAttribute('aria-valuenow', '55');
    expect(mockUpdateMissionProgress).toHaveBeenCalled();
  });

  it('filters only the existing missions by their real categories', () => {
    render(<Missions />);

    fireEvent.click(screen.getByRole('tab', { name: /Coleção/ }));
    expect(screen.getByRole('heading', { name: 'Colecionador iniciante' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Abridor dedicado' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Partidas/ })).not.toBeInTheDocument();
  });

  it('uses the existing claim flow from the highlighted mission and its card', async () => {
    render(<Missions />);

    const claimButtons = screen.getAllByRole('button', { name: 'Resgatar recompensa de Primeiros passos' });
    expect(claimButtons).toHaveLength(2);
    fireEvent.click(claimButtons[1]);

    await waitFor(() => expect(mockClaimMission).toHaveBeenCalledWith('m1'));
    expect(toast.success).toHaveBeenCalledWith('Recompensa da missão resgatada.');
  });

  it('opens achievement details with the actual locked state and unlock date', () => {
    render(<Missions />);

    fireEvent.click(screen.getByRole('button', { name: /Primeira carta, desbloqueada/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Desbloqueada em 15 de jun. de 2026');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Colecionador, bloqueada/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Conquista bloqueada');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Desbloqueada em');
  });
});
