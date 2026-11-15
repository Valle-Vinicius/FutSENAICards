import type { PackDef, Rarity } from '../types';

export const DUPLICATE_CONVERSION_REWARD: Partial<Record<Rarity, number>> = {
  common: 50,
  uncommon: 100,
  rare: 250,
  epic: 600,
  legendary: 1500,
};

export function expectedDuplicateConversionValue(pack: PackDef): number {
  const cardsAwarded = pack.choice ? 1 : pack.cards;
  const valuePerCard = Object.entries(pack.probabilities).reduce((sum, [rarity, probability]) => (
    sum + probability * (DUPLICATE_CONVERSION_REWARD[rarity as Rarity] ?? 0)
  ), 0);
  return cardsAwarded * valuePerCard;
}
