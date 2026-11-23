import { useCallback, useState } from 'react';
import type { PlayerCard } from '../types';
import CardViewer3D from '../components/CardViewer3D';

export function useCardViewer() {
  const [viewingCard, setViewingCard] = useState<PlayerCard | null>(null);
  const openCard = useCallback((card: PlayerCard) => setViewingCard(card), []);
  const closeCard = useCallback(() => setViewingCard(null), []);

  return {
    openCard,
    closeCard,
    viewer: viewingCard ? <CardViewer3D card={viewingCard} onClose={closeCard} /> : null,
  };
}
