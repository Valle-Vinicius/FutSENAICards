import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import Card from '../../src/components/Card';
import type { PlayerCard } from '../../src/types';

jest.mock('../../src/data/players', () => ({ getPlayerImage: () => undefined }));

const card: PlayerCard = {
  uid: 'card-1',
  playerId: 'player-1',
  name: 'Thiago Tavares',
  position: 'Ala',
  sport: 'futsal',
  nationality: 'Brasil',
  age: 20,
  club: 'Leões',
  rarity: 'rare',
  edition: '2025/26',
  special: 'none',
  overall: 80,
  pace: 95,
  shooting: 91,
  passing: 88,
  dribbling: 75,
  defending: 70,
  physical: 68,
  obtainedAt: 0,
  favorite: false,
  isNew: true,
};

describe('fluid collection card', () => {
  it('uses a responsive ratio and keeps the small-card details readable', () => {
    const { container } = render(<Card card={card} size="fluid" isNew />);

    expect(container.firstChild).toHaveClass('w-full', 'aspect-[7/10]');
    expect(screen.getByText('VEL')).toBeInTheDocument();
    expect(screen.getByText('CHU')).toBeInTheDocument();
    expect(screen.getByText('PAS')).toBeInTheDocument();
    expect(screen.queryByText('DRI')).not.toBeInTheDocument();
    expect(screen.getByText('Ala')).toBeInTheDocument();
    expect(screen.queryByText('Leões')).not.toBeInTheDocument();
    expect(screen.queryByText('2025/26')).not.toBeInTheDocument();
    expect(screen.getByText('NOVA')).toBeInTheDocument();
  });
});

describe('custom card presentation', () => {
  it('keeps the existing default position and attributes when no overrides are supplied', () => {
    render(<Card card={card} />);

    expect(screen.getByText('Ala · Leões')).toBeInTheDocument();
    expect(screen.getByText('2025/26')).toBeInTheDocument();
    for (const label of ['VEL', 'CHU', 'PAS', 'DRI', 'DEF', 'FIS']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('renders a custom position and all supplied developer attributes', () => {
    render(
      <Card
        card={card}
        size="fluid"
        positionLabel="Developer"
        attributes={[
          { l: 'FRO', v: 92 },
          { l: 'BAC', v: 84 },
          { l: 'BD', v: 80 },
          { l: 'SEG', v: 74 },
          { l: 'UX', v: 90 },
          { l: 'LOG', v: 86 },
        ]}
      />,
    );

    expect(screen.getByText('Developer · Leões')).toBeInTheDocument();
    expect(screen.getByText('2025/26')).toBeInTheDocument();
    for (const label of ['FRO', 'BAC', 'BD', 'SEG', 'UX', 'LOG']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText('VEL')).not.toBeInTheDocument();
  });

  it('uses the compact credit-only presentation without changing the default card', () => {
    const { container } = render(
      <Card
        card={card}
        size="fluid"
        variant="credit"
        positionLabel="Developer"
        attributes={[
          { l: 'FRO', v: 92 },
          { l: 'BAC', v: 84 },
          { l: 'BD', v: 80 },
          { l: 'SEG', v: 74 },
          { l: 'UX', v: 90 },
          { l: 'LOG', v: 86 },
        ]}
      />,
    );

    expect(screen.getByText('DEVELOPER')).toBeInTheDocument();
    expect(screen.getByText('Developer · Leões')).toBeInTheDocument();
    const attributeBand = container.querySelector('.fc-attr--credit');
    expect(attributeBand).toHaveClass('grid-cols-6', 'bg-black/40');
    expect(attributeBand?.children).toHaveLength(6);
    for (const label of ['FRO', 'BAC', 'BD', 'SEG', 'UX', 'LOG']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe.each([
  ['sm', 'w-36'],
  ['md', 'w-48'],
  ['lg', 'w-60'],
  ['fluid', 'w-full'],
] as const)('Card size %s', (size, widthClass) => {
  it('uses the shared 7:10 ratio without fixed heights', () => {
    const { container } = render(<Card card={card} size={size} />);
    const root = container.firstChild;

    expect(root).toHaveClass(widthClass, 'aspect-[7/10]', 'h-auto', 'shrink-0');
    expect(root).not.toHaveClass('h-52', 'h-64', 'h-84');
  });
});
