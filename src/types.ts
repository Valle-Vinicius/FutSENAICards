export type Position = 'GK' | 'Fixo' | 'Ala' | 'Pivo';

export type Sport = 'futsal';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'icon';

export const RARITY_META: Record<Rarity, { label: string; color: string; glow: string; minOvr: number; maxOvr: number }> = {
  common: { label: 'Comum', color: '#9ca3af', glow: 'rgba(255,255,255,0.4)', minOvr: 50, maxOvr: 69 },
  uncommon: { label: 'Incomum', color: '#b6ff3b', glow: 'rgba(182,255,59,0.5)', minOvr: 60, maxOvr: 74 },
  rare: { label: 'Rara', color: '#3b82f6', glow: 'rgba(59,130,246,0.5)', minOvr: 70, maxOvr: 79 },
  epic: { label: 'Épica', color: '#a855f7', glow: 'rgba(168,85,247,0.6)', minOvr: 80, maxOvr: 87 },
  legendary: { label: 'Lendária', color: '#f5c542', glow: 'rgba(245,197,66,0.7)', minOvr: 88, maxOvr: 94 },
  icon: { label: 'Ícone', color: '#fbbf24', glow: 'rgba(251,191,36,0.8)', minOvr: 95, maxOvr: 99 },
};

export type SpecialEdition = 'none' | 'totw' | 'potm' | 'revelation' | 'legend' | 'futsal';

export const SPECIAL_META: Record<SpecialEdition, { label: string; color: string }> = {
  none: { label: '', color: '' },
  totw: { label: 'Time da Semana', color: '#3b82f6' },
  potm: { label: 'Craque da Rodada', color: '#f5c542' },
  revelation: { label: 'Revelação da Temporada', color: '#b6ff3b' },
  legend: { label: 'Lenda do Futebol', color: '#fbbf24' },
  futsal: { label: 'Especial Futsal', color: '#a855f7' },
};

export interface PlayerCard {
  uid: string; // unique instance id
  playerId: string;
  name: string;
  position: Position;
  sport: Sport;
  nationality: string;
  age: number;
  club: string;
  rarity: Rarity;
  edition: string; // season
  special: SpecialEdition;
  overall: number;
  xp?: number;
  evoPoints?: number;
  upgrades?: { pace: number; shooting: number; passing: number; dribbling: number; defending: number; physical: number };
  evolutionLog?: { attr: string; at: number }[];
  seasonStats?: { matches: number; goals: number; assists: number };
  photo?: string;
  image?: string;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
  // gk extras
  reflexes?: number;
  positioning?: number;
  handling?: number;
  obtainedAt: number;
  favorite: boolean;
  isNew: boolean;
}

export interface PackDef {
  id: string;
  name: string;
  price: number;
  cards: number;
  probabilities: Record<Rarity, number>;
  legendaryOnly?: boolean;
  unlocked: boolean;
  color: string;
  description: string;
  choice?: number; // pick 1 of N
  position?: Position; // for position-specific packs
  sport?: Sport;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  reward: number;
  rewardXp: number;
  type: 'open_packs' | 'collect' | 'rarity' | 'squad' | 'futsal_squad' | 'daily_login';
  completed: boolean;
  claimed: boolean;
  special?: boolean;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: number;
}

export interface Transaction {
  id: string;
  type: 'earn' | 'spend';
  amount: number;
  reason: string;
  at: number;
}

export interface SquadSlot {
  position: Position;
  uid: string | null;
}

export interface Squad {
  sport: 'futsal';
  formation: string;
  starters: SquadSlot[];
  bench: (string | null)[];
}

export interface SavedSquad {
  id: string;
  name: string;
  sport: 'futsal';
  formation: string;
  starters: (string | null)[];
  bench: (string | null)[];
  createdAt: number;
  isPrimary: boolean;
}

export interface Listing {
  id: string;
  cardUid: string;
  seller: 'user' | 'npc';
  sellerName: string;
  price: number;
  buyNow: number;
  bids: { amount: number; at: number }[];
  createdAt: number;
  expiresAt: number;
  status: 'active' | 'sold' | 'expired' | 'cancelled';
  cardName?: string;
  cardOverall?: number;
  cardPosition?: string;
  cardRarity?: string;
  cardImage?: string;
}

export interface SBC {
  id: string;
  title: string;
  description: string;
  requirements: { minOverall?: number; position?: string; rarity?: string; count: number; sameClub?: boolean };
  reward: { type: 'pack' | 'coins' | 'card'; value: string | number };
  repeatable: boolean;
}
export interface CompareEntry {
  aUid: string;
}

export interface GameState {
  coins: number;
  xp: number;
  level: number;
  cards: PlayerCard[];
  packsOpened: number;
  missions: Mission[];
  achievements: Achievement[];
  transactions: Transaction[];
  squads: { futsal: Squad };
  savedSquads: SavedSquad[];
  compareHistory: { aUid: string; bUid: string; at: number }[];
  matchHistory: { id: string; date: number; sport: string; homeScore: number; awayScore: number; opponent: string }[];
  listings: Listing[];
  sbcs: SBC[];
  priceHistory: { cardName: string; price: number; at: number }[];
  recentTransfers: { cardName: string; price: number; at: number; type: 'buy' | 'sell' }[];
  settings: { audio: boolean; animations: boolean; highContrast: boolean };
  lastDailyClaim: number | null;
  events: { id: string; name: string; endsAt: number; reward: string }[];
  eventHistory: string[];
  favorites: string[];
  newCardUids: string[];
  packConfigs: PackDef[];
}
