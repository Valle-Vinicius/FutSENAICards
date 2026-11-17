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
