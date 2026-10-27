import { nanoid } from 'nanoid';
import type { Position, PlayerCard, Rarity } from '../types';
import { RARITY_META } from '../types';

import enzothomas from '../imagens/enzothomas.jpg';
import gabrielortelan from '../imagens/gabrielortelan.jpg';
import gustavohyppolito from '../imagens/gustavohyppolito.jpg';
import heitorbarbosa from '../imagens/heitorbarbosa.jpg';
import joaomarcos from '../imagens/joaomarcos.jpg';
import jonasdanieldebritolopes from '../imagens/jonasdanieldebritolopes.jpg';
import matheuslopes from '../imagens/matheuslopes.jpg';
import pietroguedes from '../imagens/pietroguedes.jpg';
import rafaeldutra from '../imagens/rafaeldutra.jpg';
import thiagotavares from '../imagens/thiagotavares.jpg';
import viniciusassuncao from '../imagens/viniciusassuncao.jpg';

interface PlayerTemplate {
  name: string;
  position: Position;
  nationality: string;
  age: number;
  club: string;
  attributes: { pace: number; shooting: number; passing: number; dribbling: number; defending: number; physical: number };
  gkAttributes?: { reflexes: number; positioning: number; handling: number };
  image: string;
  baseRarity: Rarity;
}

const TEMPLATES: PlayerTemplate[] = [
  {
    name: 'Pietro Guedes',
    position: 'Pivo',
    nationality: 'Brasil',
    age: 20,
    club: 'Aurora Futsal',
    attributes: { pace: 85, shooting: 92, passing: 75, dribbling: 75, defending: 65, physical: 90 },
    image: pietroguedes,
    baseRarity: 'rare',
  },
  {
    name: 'Mateus Lopes',
    position: 'Pivo',
    nationality: 'Brasil',
    age: 19,
    club: 'Estrela Futsal',
    attributes: { pace: 40, shooting: 76, passing: 70, dribbling: 83, defending: 65, physical: 73 },
    image: matheuslopes,
    baseRarity: 'common',
  },
  {
    name: 'Muzy',
    position: 'Pivo',
    nationality: 'Brasil',
    age: 21,
    club: 'Fênix Futsal',
    attributes: { pace: 70, shooting: 78, passing: 75, dribbling: 75, defending: 68, physical: 80 },
    image: gustavohyppolito,
    baseRarity: 'common',
  },
  {
    name: 'Thiago Tavares',
    position: 'Ala',
    nationality: 'Brasil',
    age: 24,
    club: 'Leões Futsal',
    attributes: { pace: 84, shooting: 84, passing: 85, dribbling: 94, defending: 70, physical: 80 },
    image: thiagotavares,
    baseRarity: 'rare',
  },
  {
    name: 'Rafael Dutra',
    position: 'Ala',
    nationality: 'Brasil',
    age: 21,
    club: 'Tigres Futsal',
    attributes: { pace: 73, shooting: 90, passing: 84, dribbling: 70, defending: 70, physical: 94 },
    image: rafaeldutra,
    baseRarity: 'uncommon',
  },
  {
    name: 'João Marcos',
    position: 'Ala',
    nationality: 'Brasil',
    age: 23,
    club: 'Leões Futsal',
    attributes: { pace: 85, shooting: 78, passing: 80, dribbling: 85, defending: 60, physical: 60 },
    image: joaomarcos,
    baseRarity: 'uncommon',
  },
  {
    name: 'Enzo Thomas',
    position: 'Ala',
    nationality: 'Brasil',
    age: 19,
    club: 'Aurora Futsal',
    attributes: { pace: 82, shooting: 78, passing: 75, dribbling: 90, defending: 55, physical: 60 },
    image: enzothomas,
    baseRarity: 'common',
  },
  {
    name: 'Vinícius Assunção',
    position: 'Ala',
    nationality: 'Brasil',
    age: 22,
    club: 'Aurora Futsal',
    attributes: { pace: 94, shooting: 72, passing: 76, dribbling: 65, defending: 68, physical: 60 },
    image: viniciusassuncao,
    baseRarity: 'common',
  },
  {
    name: 'Heitor Barbosa',
    position: 'Fixo',
    nationality: 'Brasil',
    age: 22,
    club: 'Tigres Futsal',
    attributes: { pace: 70, shooting: 75, passing: 80, dribbling: 65, defending: 85, physical: 65 },
    image: heitorbarbosa,
    baseRarity: 'common',
  },
  {
    name: 'Jonas Daniel',
    position: 'GK',
    nationality: 'Brasil',
    age: 18,
    club: 'Aurora Futsal',
    attributes: { pace: 40, shooting: 60, passing: 60, dribbling: 60, defending: 65, physical: 72 },
    gkAttributes: { reflexes: 75, positioning: 90, handling: 75 },
    image: jonasdanieldebritolopes,
    baseRarity: 'common',
  },
  {
    name: 'Gabriel Ortelan',
    position: 'Fixo',
    nationality: 'Brasil',
    age: 21,
    club: 'Estrela Futsal',
    attributes: { pace: 45, shooting: 30, passing: 55, dribbling: 45, defending: 90, physical: 75 },
    image: gabrielortelan,
    baseRarity: 'common',
  },
];

const SEASONS = ['2025/26'];

const RARITY_MODIFIER: Record<Rarity, number> = {
  common: 0.88,
  uncommon: 1.0,
  rare: 1.05,
  epic: 1.10,
  legendary: 1.15,
  icon: 1.20,
};

const SPECIAL_BONUS: Record<string, number> = {
  none: 0,
  totw: 2,
  potm: 2,
  revelation: 1,
  legend: 3,
  futsal: 2,
};

function applyModifier(value: number, mod: number): number {
  return Math.max(0, Math.min(99, Math.round(value * mod)));
}

function calculateOverall(t: PlayerTemplate): number {
  const a = t.attributes;
  if (t.position === 'GK') {
    const gk = t.gkAttributes ?? { reflexes: 50, positioning: 50, handling: 50 };
    const w = gk.reflexes * 0.30 + gk.positioning * 0.25 + a.defending * 0.20 + a.passing * 0.10 + a.physical * 0.10 + a.pace * 0.05;
    return Math.round(w);
  }
  if (t.position === 'Fixo') {
    const w = a.defending * 0.35 + a.physical * 0.20 + a.passing * 0.20 + a.pace * 0.10 + a.dribbling * 0.08 + a.shooting * 0.07;
    return Math.round(w);
  }
  if (t.position === 'Ala') {
    const w = a.pace * 0.25 + a.passing * 0.22 + a.dribbling * 0.20 + a.shooting * 0.13 + a.defending * 0.12 + a.physical * 0.08;
    return Math.round(w);
  }
  // Pivo
  const w = a.shooting * 0.32 + a.physical * 0.22 + a.dribbling * 0.18 + a.passing * 0.12 + a.pace * 0.10 + a.defending * 0.06;
  return Math.round(w);
}

export function generatePlayerCard(t: PlayerTemplate, rarity: Rarity, special: 'none'|'totw'|'potm'|'revelation'|'legend'|'futsal' = 'none'): PlayerCard {
  const mod = RARITY_MODIFIER[rarity];
  const a = t.attributes;
  const attrs = {
    pace: applyModifier(a.pace, mod),
    shooting: applyModifier(a.shooting, mod),
    passing: applyModifier(a.passing, mod),
    dribbling: applyModifier(a.dribbling, mod),
    defending: applyModifier(a.defending, mod),
    physical: applyModifier(a.physical, mod),
  };
  const gk = t.gkAttributes ? {
    reflexes: applyModifier(t.gkAttributes.reflexes, mod),
    positioning: applyModifier(t.gkAttributes.positioning, mod),
    handling: applyModifier(t.gkAttributes.handling, mod),
  } : undefined;

  const templateWithAttrs: PlayerTemplate = { ...t, attributes: attrs, gkAttributes: gk };
  let overall = calculateOverall(templateWithAttrs);
  const bonus = SPECIAL_BONUS[special] ?? 0;
  overall = Math.min(99, overall + bonus);

  const meta = RARITY_META[rarity];
  overall = Math.max(meta.minOvr, Math.min(meta.maxOvr, overall));

  return {
    uid: nanoid(10),
    playerId: t.name.toLowerCase().replace(/\s+/g, '-') + '-' + rarity,
    name: t.name,
    position: t.position,
    sport: 'futsal',
    nationality: t.nationality,
    age: t.age,
    club: t.club,
    rarity,
    edition: SEASONS[0],
    special: special as any,
    overall,
    image: t.image,
    pace: attrs.pace,
    shooting: attrs.shooting,
    passing: attrs.passing,
    dribbling: attrs.dribbling,
    defending: attrs.defending,
    physical: attrs.physical,
    ...(gk ? { reflexes: gk.reflexes, positioning: gk.positioning, handling: gk.handling } : {}),
    obtainedAt: Date.now(),
    favorite: false,
    isNew: true,
    xp: 0,
    evoPoints: 0,
    upgrades: { pace: 0, shooting: 0, passing: 0, dribbling: 0, defending: 0, physical: 0 },
  };
}

export function futsalTemplates() { return TEMPLATES; }
export function allTemplates() { return TEMPLATES; }

export function randomTemplate(positionFilter?: Position): PlayerTemplate {
  const pool = positionFilter ? TEMPLATES.filter(t => t.position === positionFilter) : TEMPLATES;
  if (pool.length === 0) return TEMPLATES[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function generateIconCard(): PlayerCard {
  const t = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  const rarity: Rarity = Math.random() < 0.5 ? 'icon' : 'legendary';
  const special: any = rarity === 'icon' ? 'legend' : 'none';
  const card = generatePlayerCard(t, rarity, special);
  return card;
}
