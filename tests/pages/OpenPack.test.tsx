import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode, Ref } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PlayerCard } from '../../src/types';
import OpenPack from '../../src/pages/OpenPack';

const mockOpenPack = jest.fn();
const mockPreviewPack = jest.fn();
const mockClaimPreviewedCard = jest.fn();
const mockGameState = {
  packConfigs: [{
    id: 'bronze',
    name: 'Pacote Bronze',
    price: 500,
    cards: 1,
    unlocked: true,
    sport: 'futsal',
    color: '#cd7f32',
    description: 'Pacote de teste',
    probabilities: { common: 1 },
  }],
  settings: { audio: false, animations: true },
  cards: [] as PlayerCard[],
  coins: 1000000,
  openPack: mockOpenPack,
  previewPack: mockPreviewPack,
  claimPreviewedCard: mockClaimPreviewedCard,
};
jest.mock('../../src/store/useGame', () => ({
  useGame: Object.assign(
    (selector: (state: typeof mockGameState) => unknown) => selector(mockGameState),
    { getState: () => mockGameState },
  ),
}));
jest.mock('../../src/lib/sound', () => ({
  playBurst: jest.fn(),
  playCharge: jest.fn(),
  playFlip: jest.fn(),
  playRareReveal: jest.fn(),
}));
jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: '35a8dc5f-c5db-4b33-9380-a32739ff6c10' } } },
        error: null,
      }),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
  },
}));
jest.mock('../../src/components/Card', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ card }: { card: { name: string } }) => React.createElement('div', null, card.name),
  };
});
jest.mock('framer-motion', () => {
  const React = require('react');
  const components = new Map<string, unknown>();
  const createMotionElement = (tag: string) => React.forwardRef((
    {
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      whileHover: _whileHover,
      whileTap: _whileTap,
      ...props
    }: Record<string, unknown>,
    ref: Ref<HTMLElement>,
  ) => React.createElement(tag, { ...props, ref }));
  return {
    motion: new Proxy({}, {
      get: (_target, tag: string) => {
        if (!components.has(tag)) components.set(tag, createMotionElement(tag));
        return components.get(tag);
      },
    }),
    AnimatePresence: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
  };
});

const card: PlayerCard = {
  uid: 'opened-card',
  playerId: 'player-1',
  name: 'Atleta de teste',
  position: 'Ala',
  sport: 'futsal',
  nationality: 'Brasil',
  age: 20,
  club: 'SENAI',
  rarity: 'common',
  edition: '2026',
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

function renderOpenPack() {
  return render(
    <MemoryRouter initialEntries={['/open/bronze']}>
      <Routes>
        <Route path="/open/:packId" element={<OpenPack />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OpenPack loading and animation timing', () => {
  beforeEach(() => {
    mockOpenPack.mockReset();
    mockPreviewPack.mockReset();
    mockClaimPreviewedCard.mockReset();
    mockGameState.cards = [];
    mockGameState.settings = { audio: false, animations: true };
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => null,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses a discreet loading state for skipped animation while the server is pending', async () => {
    const request = deferred<{ cards: PlayerCard[] } | null>();
    mockOpenPack.mockReturnValue(request.promise);
    renderOpenPack();

    fireEvent.click(screen.getByLabelText('Pular animação'));
    fireEvent.click(screen.getByRole('button', { name: 'ABRIR PACOTE' }));

    expect(screen.getByRole('status')).toHaveTextContent('Abrindo pacote…');
    expect(screen.queryByText('ABRINDO...')).not.toBeInTheDocument();

    await act(async () => { request.resolve({ cards: [card] }); });
    expect(await screen.findByText('PACOTE ABERTO COM SUCESSO!')).toBeInTheDocument();
  });

  it('goes directly to card reveal in fast mode after the RPC returns', async () => {
    const request = deferred<{ cards: PlayerCard[] } | null>();
    mockOpenPack.mockReturnValue(request.promise);
    renderOpenPack();

    fireEvent.click(screen.getByLabelText('Modo rápido'));
    fireEvent.click(screen.getByRole('button', { name: 'ABRIR PACOTE' }));
    expect(screen.getByRole('status')).toHaveTextContent('Abrindo pacote…');

    await act(async () => { request.resolve({ cards: [card] }); });
    expect(await screen.findByText('Clique nas cartas para revelar')).toBeInTheDocument();
    expect(screen.queryByText('PACOTE ABERTO!')).not.toBeInTheDocument();
  });

  it('lets the designated account select a bulk quantity and opens directly to the summary', async () => {
    mockOpenPack.mockResolvedValue({
      cards: Array.from({ length: 15 }, (_, index) => ({
        ...card,
        uid: `opened-${index}`,
        playerId: `player-${index}`,
        name: `Atleta ${index + 1}`,
      })),
    });
    renderOpenPack();

    fireEvent.click(await screen.findByRole('button', { name: '5' }));
    expect(screen.getByRole('button', { name: 'ABRIR 5 PACOTES' })).toBeInTheDocument();
    expect(screen.getByText('5 cartas · 2.500 moedas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ABRIR 5 PACOTES' }));

    expect(mockOpenPack).toHaveBeenCalledWith('bronze', 5);
    expect(await screen.findByText('PACOTE ABERTO COM SUCESSO!')).toBeInTheDocument();
    expect(screen.getByText('Mostrando 12 de 15 cartas; todas foram adicionadas à coleção.')).toBeInTheDocument();
  });

  it('subtracts the time spent waiting for the RPC from the charge animation', async () => {
    jest.useFakeTimers();
    const request = deferred<{ cards: PlayerCard[] } | null>();
    mockOpenPack.mockReturnValue(request.promise);
    renderOpenPack();

    fireEvent.click(screen.getByRole('button', { name: 'ABRIR PACOTE' }));
    await act(async () => { await jest.advanceTimersByTimeAsync(700); });
    await act(async () => { request.resolve({ cards: [card] }); });

    expect(screen.getByText('ABRINDO...')).toBeInTheDocument();
    await act(async () => { await jest.advanceTimersByTimeAsync(399); });
    expect(screen.getByText('ABRINDO...')).toBeInTheDocument();
    await act(async () => { await jest.advanceTimersByTimeAsync(1); });
    expect(screen.getByText('PACOTE ABERTO!')).toBeInTheDocument();
    await act(async () => { await jest.advanceTimersByTimeAsync(900); });
    expect(screen.getByText('Clique nas cartas para revelar')).toBeInTheDocument();
  });
});
