import type { ExtraStat, PlayerCard } from '../types';

export function getCardAttributes(card: PlayerCard): ExtraStat[] {
  const attributes = card.position === 'GK'
    ? [
        { label: 'Reflexos', value: card.reflexes ?? 0 },
        { label: 'Posicionamento', value: card.positioning ?? 0 },
        { label: 'Manuseio', value: card.handling ?? 0 },
        { label: 'Velocidade', value: card.pace },
        { label: 'Defesa', value: card.defending },
        { label: 'Físico', value: card.physical },
      ]
    : [
        { label: 'Velocidade', value: card.pace },
        { label: 'Chute', value: card.shooting },
        { label: 'Passe', value: card.passing },
        { label: 'Drible', value: card.dribbling },
        { label: 'Defesa', value: card.defending },
        { label: 'Físico', value: card.physical },
      ];

  return [...attributes, ...(card.extraStats ?? [])].slice(0, 6);
}
