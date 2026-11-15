import type { PackDef, Position } from '../types';
import { DEFAULT_PACKS } from './game';

export const SECRET_ELIGIBLE_PACK_IDS = [
  'bronze',
  'silver',
  'gold',
  'premium',
  'rareplayers',
  'legends',
  'position_gk',
] as const;

const SECRET_ODDS_PACK_IDS = [...SECRET_ELIGIBLE_PACK_IDS, 'choice', 'off_sale'] as const;
const CONFIDENCE_LEVELS = [0.5, 0.9, 0.99] as const;

export interface SecretPackOdds {
  pack: PackDef;
  eligible: boolean;
  chancePerPack: number | null;
  oneIn: number | null;
  averageCost: number | null;
  costFor50: number | null;
  costFor90: number | null;
  costFor99: number | null;
}

function costForConfidence(price: number, chancePerPack: number, confidence: number): number {
  return Math.log1p(-confidence) / Math.log1p(-chancePerPack) * price;
}

export function calculateSecretPackOdds(chancePercent: number, position: Position): SecretPackOdds[] {
  const validChance = Number.isFinite(chancePercent) && chancePercent >= 0.0001 && chancePercent <= 5;
  const chancePerCard = validChance ? chancePercent / 100 : 0;

  return DEFAULT_PACKS
    .filter(pack => SECRET_ODDS_PACK_IDS.includes(pack.id as typeof SECRET_ODDS_PACK_IDS[number]))
    .map(pack => {
      const eligible = SECRET_ELIGIBLE_PACK_IDS.includes(pack.id as typeof SECRET_ELIGIBLE_PACK_IDS[number])
        && (pack.id !== 'position_gk' || position === 'GK');
      if (!eligible) {
        return {
          pack,
          eligible: false,
          chancePerPack: null,
          oneIn: null,
          averageCost: null,
          costFor50: null,
          costFor90: null,
          costFor99: null,
        };
      }
      if (!validChance) {
        return {
          pack,
          eligible: true,
          chancePerPack: null,
          oneIn: null,
          averageCost: null,
          costFor50: null,
          costFor90: null,
          costFor99: null,
        };
      }

      const chancePerPack = 1 - (1 - chancePerCard) ** pack.cards;
      const costs = CONFIDENCE_LEVELS.map(confidence => costForConfidence(pack.price, chancePerPack, confidence));
      return {
        pack,
        eligible: true,
        chancePerPack,
        oneIn: 1 / chancePerPack,
        averageCost: pack.price / chancePerPack,
        costFor50: costs[0],
        costFor90: costs[1],
        costFor99: costs[2],
      };
    });
}

export function formatSecretPercent(probability: number): string {
  return `${(probability * 100).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 5 })}%`;
}

export function formatSecretCoins(coins: number): string {
  return `${Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(coins)} moedas`;
}

export function cheapestSecretPackFor99(odds: SecretPackOdds[]): SecretPackOdds | null {
  return odds
    .filter(row => row.eligible && row.costFor99 !== null)
    .reduce<SecretPackOdds | null>((cheapest, row) => (
      !cheapest || row.costFor99! < cheapest.costFor99! ? row : cheapest
    ), null);
}
