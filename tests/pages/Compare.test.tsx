import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PlayerCard } from '../../src/types';
import Compare from '../../src/pages/Compare';
import { useGame } from '../../src/store/useGame';

jest.mock('../../src/components/Card', () => ({
  __esModule: true,
  default: ({ card }: { card: PlayerCard }) => <div data-testid="card-face">{card.name}</div>,
}));
jest.mock('../../src/store/useGame', () => ({
  useGame: jest.fn(),
}));

const mockedUseGame = jest.mocked(useGame);

function makeCard(uid: string, name: string, position: PlayerCard['position'], values: Partial<PlayerCard> = {}): PlayerCard {
  return {
    uid,
    playerId: uid,
    name,
    position,
    sport: 'futsal',
    nationality: 'Brasil',
    age: 20,
    club: 'Leões',
    rarity: 'rare',
    edition: '2025/26',
    special: 'none',
    overall: 80,
    pace: 80,
    shooting: 70,
    passing: 75,
    dribbling: 72,
    defending: 68,
    physical: 77,
    reflexes: 91,
    positioning: 85,
    handling: 89,
    obtainedAt: 0,
    favorite: false,
    isNew: false,
    ...values,
  };
}

const cards = [
  makeCard('gk', 'Goleiro', 'GK', { overall: 90, pace: 55, defending: 88, physical: 80 }),
  makeCard('line', 'João Ala', 'Ala', { overall: 85, pace: 90, shooting: 87, defending: 70, physical: 75 }),
  makeCard('gk2', 'Outro Goleiro', 'GK', {
    overall: 89,
    reflexes: 80,
    positioning: 70,
    handling: 95,
    pace: 80,
    defending: 68,
    physical: 77,
  }),
];

function renderCompare(
  entry = '/compare',
  history: { aUid: string; bUid: string; at: number }[] = [],
  compareCards = cards,
) {
  const state = {
    cards: compareCards,
    compareHistory: history,
    addCompareHistory: jest.fn(),
  };
  mockedUseGame.mockImplementation(selector => selector(state as unknown as ReturnType<typeof useGame.getState>));
  return {
    state,
    ...render(<MemoryRouter initialEntries={[entry]}><Compare /></MemoryRouter>),
  };
}

describe('Compare page', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('presents the comparison as a duel and summarizes attribute wins and draws', async () => {
    renderCompare('/compare?a=gk&b=line');

    expect(screen.getByRole('heading', { name: 'Comparar jogadores' })).toBeInTheDocument();
    expect(screen.getByText('Compare atributos, desempenho e vantagens entre dois atletas.')).toBeInTheDocument();
    expect(screen.getByLabelText('contra')).toHaveTextContent('VS');
    expect(screen.getByRole('heading', { name: 'Análise da comparação' })).toBeInTheDocument();
    expect(screen.getByLabelText('2 vitórias para jogador A, 1 vitórias para jogador B')).toBeInTheDocument();
    expect(screen.getByText('EMPATES').nextElementSibling).toHaveTextContent('0');
  });

  it('compares only shared attributes for a goalkeeper and a field player', async () => {
    renderCompare('/compare?a=gk&b=line');

    const comparison = await screen.findByRole('heading', { name: 'Atributos em comparação' });
    const content = within(comparison.parentElement as HTMLElement);
    expect(content.getByText('Velocidade')).toBeInTheDocument();
    expect(content.getByText('Defesa')).toBeInTheDocument();
    expect(content.getByText('Físico')).toBeInTheDocument();
    expect(content.queryByText('Reflexos')).not.toBeInTheDocument();
    expect(content.queryByText('Chute')).not.toBeInTheDocument();
    expect(screen.getByText('Goleiros e jogadores de linha só têm 3 atributos em comum.')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === 'Goleiro vence em 2 de 3 atributos.')).toBeInTheDocument();
  });

  it('compares all six goalkeeper attributes when both players are goalkeepers', async () => {
    renderCompare('/compare?a=gk&b=gk2');

    const comparison = await screen.findByRole('heading', { name: 'Atributos em comparação' });
    const content = within(comparison.parentElement as HTMLElement);
    expect(content.getByText('Reflexos')).toBeInTheDocument();
    expect(content.getByText('Posicionamento')).toBeInTheDocument();
    expect(content.getByText('Manuseio')).toBeInTheDocument();
    expect(content.queryByText('Goleiros e jogadores de linha só têm 3 atributos em comum.')).not.toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === 'Goleiro vence em 4 de 6 atributos.')).toBeInTheDocument();
  });

  it('distinguishes copies of the same player by rarity in results and analysis', () => {
    const differentRarities = [
      makeCard('icon', 'Thiago Tavares', 'Ala', {
        playerId: 'thiago',
        rarity: 'icon',
        overall: 95,
        pace: 95,
        shooting: 90,
        passing: 90,
        dribbling: 90,
        defending: 90,
        physical: 75,
      }),
      makeCard('legendary', 'Thiago Tavares', 'Ala', {
        playerId: 'thiago',
        rarity: 'legendary',
        overall: 92,
        pace: 80,
        shooting: 80,
        passing: 80,
        dribbling: 80,
        defending: 80,
        physical: 75,
      }),
    ];
    renderCompare('/compare?a=icon&b=legendary', [], differentRarities);

    const summary = screen.getByRole('status');
    expect(summary).toHaveTextContent('Thiago Tavares (Ícone) vence em 5 de 6 atributos.');
    expect(summary).toHaveTextContent('Thiago Tavares (Ícone) tem o maior overall (95).');

    const analysis = screen.getByRole('heading', { name: 'Análise da comparação' }).parentElement as HTMLElement;
    expect(analysis).toHaveTextContent('Thiago Tavares (Ícone)');
    expect(analysis).toHaveTextContent('Thiago Tavares (Lendária)');
    expect(within(analysis).getAllByText('Thiago Tavares (Ícone)')[0]).toHaveClass('rgb-text');
    expect(within(analysis).getAllByText('Thiago Tavares (Lendária)')[0]).toHaveStyle({ color: 'rgb(245, 197, 66)' });
  });

  it('disables selecting the other side, searches without accents and restores focus on Escape', async () => {
    renderCompare('/compare?a=gk');
    const openButton = await screen.findByRole('button', { name: 'Selecionar jogador' });
    fireEvent.click(openButton);

    const dialog = await screen.findByRole('dialog');
    const search = within(dialog).getByRole('searchbox', { name: 'Buscar jogador' });
    await waitFor(() => expect(search).toHaveFocus());
    expect(within(dialog).getByRole('button', { name: 'Selecionar Goleiro, já está do outro lado' })).toBeDisabled();

    fireEvent.change(search, { target: { value: 'joao' } });
    expect(within(dialog).getByRole('button', { name: 'Selecionar João Ala' })).toBeEnabled();
    expect(within(dialog).queryByRole('button', { name: 'Selecionar Outro Goleiro' })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(openButton).toHaveFocus());
  });

  it('renders a limited page of cards and searches the complete collection', async () => {
    const largeCollection = Array.from({ length: 65 }, (_, index) =>
      makeCard(`athlete-${index + 1}`, `Atleta ${index + 1}`, 'Ala', { overall: 99 - index }));
    renderCompare('/compare', [], largeCollection);

    fireEvent.click((await screen.findAllByRole('button', { name: 'Selecionar jogador' }))[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByRole('button', { name: /^Selecionar Atleta/ })).toHaveLength(30);
    expect(within(dialog).getByText('Exibindo 30 de 65 cartas')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Carregar mais cartas' }));
    expect(within(dialog).getAllByRole('button', { name: /^Selecionar Atleta/ })).toHaveLength(60);

    fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Buscar jogador' }), {
      target: { value: 'Atleta 65' },
    });
    expect(within(dialog).getByRole('button', { name: 'Selecionar Atleta 65' })).toBeInTheDocument();
    expect(within(dialog).getByText('Exibindo 1 de 1 cartas')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Carregar mais cartas' })).not.toBeInTheDocument();
  });

  it('restores a recent comparison from its shortcut', async () => {
    renderCompare('/compare', [{ aUid: 'gk', bUid: 'line', at: 1 }]);

    fireEvent.click(await screen.findByRole('button', { name: 'Goleiro × João Ala' }));
    expect(await screen.findByRole('heading', { name: 'Atributos em comparação' })).toBeInTheDocument();
  });
});
