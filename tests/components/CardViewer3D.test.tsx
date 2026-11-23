import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { PlayerCard, ExtraStat } from '../../src/types';
import CardViewer3D from '../../src/components/CardViewer3D';

jest.mock('../../src/components/Card', () => ({ __esModule: true, default: () => null }));

const card: PlayerCard = {
  uid: 'viewer-card',
  playerId: 'player-1',
  name: 'Pietro Guedes',
  position: 'Pivo',
  sport: 'futsal',
  nationality: 'Brasil',
  age: 20,
  club: 'Aurora Futsal',
  rarity: 'rare',
  edition: '2025/26',
  special: 'none',
  overall: 97,
  pace: 97,
  shooting: 99,
  passing: 99,
  dribbling: 94,
  defending: 88,
  physical: 99,
  obtainedAt: 0,
  favorite: false,
  isNew: false,
};

const attributes: ExtraStat[] = [
  { label: 'Velocidade', value: 97 },
  { label: 'Chute', value: 99 },
  { label: 'Passe', value: 99 },
  { label: 'Drible', value: 94 },
  { label: 'Defesa', value: 88 },
  { label: 'Físico', value: 99 },
];

describe('CardViewer3D', () => {
  it('rotates between the original front and rarity back with its controls', () => {
    render(<CardViewer3D card={card} attributes={attributes} onClose={jest.fn()} />);

    const flipper = screen.getByRole('button', { name: /clique para virar e ver o verso/i });
    expect(flipper).toHaveAttribute('data-rarity', 'rare');
    expect(document.querySelector('.card-viewer-face--back img')).toHaveAttribute('alt', 'Verso da carta Rara');

    fireEvent.click(screen.getByRole('button', { name: /virar carta/i }));
    expect(flipper).toHaveAttribute('data-flipped', 'true');
    expect(flipper).toHaveStyle({ '--flip-angle': '180deg' });
    expect(screen.getByRole('button', { name: /voltar para frente/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /voltar para frente/i }));
    expect(flipper).toHaveAttribute('data-flipped', 'false');
    expect(flipper).toHaveStyle({ '--flip-angle': '0deg' });
  });

  it('closes on Escape', () => {
    const onClose = jest.fn();
    render(<CardViewer3D card={card} attributes={attributes} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
