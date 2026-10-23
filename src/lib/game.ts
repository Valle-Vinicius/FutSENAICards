import type { Rarity, PackDef, Mission, Achievement } from '../types';
import { RARITY_META } from '../types';

export const DEFAULT_PACKS: PackDef[] = [
  {
    id: 'bronze',
    name: 'PACOTE BRONZE',
    price: 500,
    cards: 3,
    probabilities: { common: 0.62, uncommon: 0.25, rare: 0.10, epic: 0.025, legendary: 0.004, icon: 0.001 },
    unlocked: true,
    color: '#cd7f32',
    description: 'Maior chance de cartas comuns. Ideal para começar.',
  },
  {
    id: 'silver',
    name: 'PACOTE PRATA',
    price: 1500,
    cards: 5,
    probabilities: { common: 0.30, uncommon: 0.35, rare: 0.22, epic: 0.10, legendary: 0.025, icon: 0.005 },
    unlocked: true,
    color: '#c0c0c0',
    description: 'Mais chances de incomuns e raras.',
  },
  {
    id: 'gold',
    name: 'PACOTE OURO',
    price: 3000,
    cards: 5,
    probabilities: { common: 0.10, uncommon: 0.25, rare: 0.35, epic: 0.22, legendary: 0.07, icon: 0.01 },
    unlocked: true,
    color: '#f5c542',
    description: 'Mais chances de raras e épicas.',
  },
  {
    id: 'premium',
    name: 'PACOTE PREMIUM',
    price: 7500,
    cards: 5,
    probabilities: { common: 0.05, uncommon: 0.15, rare: 0.35, epic: 0.30, legendary: 0.12, icon: 0.03 },
    unlocked: true,
    color: '#E30613',
    description: 'Pelo menos 2 cartas raras.',
  },
  {
    id: 'rareplayers',
    name: 'PACOTE JOGADORES RAROS',
    price: 5000,
    cards: 3,
    probabilities: { common: 0.0, uncommon: 0.10, rare: 0.40, epic: 0.35, legendary: 0.12, icon: 0.03 },
    unlocked: true,
    color: '#a855f7',
    description: 'Apenas cartas raras ou superiores.',
  },
  {
    id: 'legends',
    name: 'PACOTE LENDAS',
    price: 12000,
    cards: 4,
    probabilities: { common: 0.0, uncommon: 0.0, rare: 0.20, epic: 0.40, legendary: 0.30, icon: 0.10 },
    unlocked: true,
    color: '#f5c542',
    description: 'Lendas e ícones do futebol.',
  },
  {
    id: 'position_gk',
    name: 'PACOTE GOLEIROS',
    price: 4000,
    cards: 3,
    probabilities: { common: 0.20, uncommon: 0.30, rare: 0.30, epic: 0.15, legendary: 0.04, icon: 0.01 },
    unlocked: true,
    color: '#3b82f6',
    description: 'Cartas de goleiros.',
    position: 'GK',
  },
  {
    id: 'choice',
    name: 'ESCOLHA ESPECIAL',
    price: 10000,
    cards: 3,
    probabilities: { common: 0.0, uncommon: 0.0, rare: 0.20, epic: 0.40, legendary: 0.30, icon: 0.10 },
    unlocked: true,
    color: '#b6ff3b',
    description: 'Escolha 1 entre 3 atletas especiais.',
    choice: 3,
  },
];

export function rollRarity(prob: Record<Rarity, number>): Rarity {
  const r = Math.random();
  let acc = 0;
  // build cumulative from highest to lowest? We'll do standard
  const entries = Object.entries(prob) as [Rarity, number][];
  for (const [rar, p] of entries) {
    acc += p;
    if (r < acc) return rar;
  }
  // fallback
  return 'common';
}

export function validateRarityOverall(rarity: Rarity, overall: number): boolean {
  const m = RARITY_META[rarity];
  return overall >= m.minOvr && overall <= m.maxOvr;
}

export const DEFAULT_MISSIONS: Mission[] = [
  { id: 'm1', title: 'Primeiros passos', description: 'Abra 1 pacote', target: 1, progress: 0, reward: 300, rewardXp: 50, type: 'open_packs', completed: false, claimed: false },
  { id: 'm2', title: 'Colecionador iniciante', description: 'Colecione 10 jogadores', target: 10, progress: 0, reward: 500, rewardXp: 80, type: 'collect', completed: false, claimed: false },
  { id: 'm3', title: 'Abridor dedicado', description: 'Abra 3 pacotes', target: 3, progress: 0, reward: 800, rewardXp: 120, type: 'open_packs', completed: false, claimed: false },
  { id: 'm4', title: 'Carta épica', description: 'Consiga uma carta Épica ou superior', target: 1, progress: 0, reward: 1000, rewardXp: 200, type: 'rarity', completed: false, claimed: false },
  { id: 'm5', title: 'Elenco completo', description: 'Monte um elenco de futebol completo (11 titulares)', target: 11, progress: 0, reward: 1200, rewardXp: 250, type: 'squad', completed: false, claimed: false },
  { id: 'm6', title: 'Futsal na veia', description: 'Monte um elenco de futsal completo (5 titulares)', target: 5, progress: 0, reward: 900, rewardXp: 180, type: 'futsal_squad', completed: false, claimed: false },
  { id: 'm7', title: 'Colecionador avançado', description: 'Colecione 25 jogadores', target: 25, progress: 0, reward: 1500, rewardXp: 300, type: 'collect', completed: false, claimed: false },
  { id: 'm8', title: 'Lendário', description: 'Consiga uma carta Lendária', target: 1, progress: 0, reward: 2000, rewardXp: 400, type: 'rarity', completed: false, claimed: false, special: true },
  { id: 'm9', title: 'Login diário', description: 'Receba a recompensa diária', target: 1, progress: 0, reward: 200, rewardXp: 30, type: 'daily_login', completed: false, claimed: false },
  { id: 'm10', title: 'Mestre das cartas', description: 'Abra 10 pacotes', target: 10, progress: 0, reward: 3000, rewardXp: 600, type: 'open_packs', completed: false, claimed: false },
];

export const DEFAULT_ACHIEVEMENTS: Achievement[] = [
  { id: 'a1', title: 'Primeira carta', description: 'Obtenha sua primeira carta', unlocked: false },
  { id: 'a2', title: 'Colecionador', description: 'Tenha 20 cartas', unlocked: false },
  { id: 'a3', title: 'Milhonário', description: 'Acumule 10.000 moedas', unlocked: false },
  { id: 'a4', title: 'Elenco montado', description: 'Complete um elenco de futebol', unlocked: false },
  { id: 'a5', title: 'Sortudo', description: 'Obtenha uma carta Lendária', unlocked: false },
  { id: 'a6', title: 'Ícone', description: 'Obtenha uma carta Ícone', unlocked: false },
];

export const XP_PER_LEVEL = 500;
export function levelFromXp(xp: number) { return Math.floor(xp / XP_PER_LEVEL) + 1; }

export const FORMATIONS_FOOTBALL: Record<string, string[]> = {
  '4-3-3': ['GK','LB','CB','CB','RB','CM','CM','CM','LW','ST','RW'],
  '4-4-2': ['GK','LB','CB','CB','RB','LM','CM','CM','RM','ST','ST'],
  '4-2-3-1': ['GK','LB','CB','CB','RB','CDM','CDM','CAM','LW','ST','RW'],
  '3-5-2': ['GK','CB','CB','CB','LWB','CM','CM','CM','RWB','ST','ST'],
  '4-3-2-1': ['GK','LB','CB','CB','RB','CM','CM','CM','CAM','CAM','ST'],
};
export const FORMATIONS_FUTSAL: Record<string, string[]> = {
  '1-2-1': ['FutsalGK','Fixo','Ala','Ala','Pivo'],
  '2-2': ['FutsalGK','Fixo','Fixo','Ala','Pivo'],
  '3-1': ['FutsalGK','Fixo','Ala','Ala','Pivo'],
  '4-0': ['FutsalGK','Fixo','Ala','Ala','Pivo'],
};

export function uid() { return Math.random().toString(36).slice(2, 10); }
