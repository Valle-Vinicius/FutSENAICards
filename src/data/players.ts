import { nanoid } from 'nanoid';
import type { Position, PlayerCard, Rarity } from '../types';

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
import eduardo from '../imagens/eduardo.png';
import enzoantonio from '../imagens/enzoantonio.png';
import rafaelteixeira from '../imagens/rafaelteixeira.png';
import viniciusmonteiro from '../imagens/viniciusmonteiro.png';

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
  baseOverall?: number;
}

const RARITY_MODIFIER: Record<Rarity, number> = {
  common: 0.88,
  uncommon: 1.0,
  rare: 1.05,
  epic: 1.10,
  legendary: 1.15,
  icon: 1.20,
};

const RARITY_OVR_BONUS: Record<Rarity, number> = {
  common: -2,
  uncommon: 0,
  rare: 2,
  epic: 4,
  legendary: 6,
  icon: 8,
};

const SPECIAL_OVR_BONUS: Record<string, number> = {
  none: 0,
  totw: 2,
  potm: 2,
  revelation: 1,
  legend: 3,
  futsal: 2,
};

const TEMPLATES: PlayerTemplate[] = [
  { name: 'Pietro Guedes', position: 'Pivo', nationality: 'Brasil', age: 20, club: 'Aurora Futsal', attributes: { pace: 81, shooting: 88, passing: 83, dribbling: 78, defending: 73, physical: 87 }, image: pietroguedes, baseRarity: 'uncommon', baseOverall: 86 },
  { name: 'Muzy', position: 'Pivo', nationality: 'Brasil', age: 21, club: 'Fênix Futsal', attributes: { pace: 78, shooting: 76, passing: 69, dribbling: 66, defending: 67, physical: 80 }, image: gustavohyppolito, baseRarity: 'uncommon', baseOverall: 75 },
  { name: 'Mateus Lopes', position: 'Pivo', nationality: 'Brasil', age: 19, club: 'Estrela Futsal', attributes: { pace: 41, shooting: 61, passing: 63, dribbling: 61, defending: 50, physical: 55 }, image: matheuslopes, baseRarity: 'uncommon', baseOverall: 57 },
  { name: 'Thiago Tavares', position: 'Ala', nationality: 'Brasil', age: 24, club: 'Leões Futsal', attributes: { pace: 83, shooting: 82, passing: 85, dribbling: 92, defending: 76, physical: 81 }, image: thiagotavares, baseRarity: 'uncommon', baseOverall: 86 },
  { name: 'João Marcos', position: 'Ala', nationality: 'Brasil', age: 23, club: 'Leões Futsal', attributes: { pace: 88, shooting: 77, passing: 75, dribbling: 85, defending: 70, physical: 67 }, image: joaomarcos, baseRarity: 'uncommon', baseOverall: 81 },
  { name: 'Rafael Dutra', position: 'Ala', nationality: 'Brasil', age: 21, club: 'Tigres Futsal', attributes: { pace: 70, shooting: 83, passing: 77, dribbling: 66, defending: 74, physical: 92 }, image: rafaeldutra, baseRarity: 'uncommon', baseOverall: 76 },
  { name: 'Vinícius Assunção', position: 'Ala', nationality: 'Brasil', age: 22, club: 'Aurora Futsal', attributes: { pace: 91, shooting: 71, passing: 73, dribbling: 68, defending: 66, physical: 66 }, image: viniciusassuncao, baseRarity: 'uncommon', baseOverall: 76 },
  { name: 'Enzo Thomas', position: 'Ala', nationality: 'Brasil', age: 19, club: 'Aurora Futsal', attributes: { pace: 79, shooting: 67, passing: 70, dribbling: 84, defending: 58, physical: 65 }, image: enzothomas, baseRarity: 'uncommon', baseOverall: 74 },
  { name: 'Heitor Barbosa', position: 'Fixo', nationality: 'Brasil', age: 22, club: 'Tigres Futsal', attributes: { pace: 75, shooting: 73, passing: 78, dribbling: 67, defending: 89, physical: 77 }, image: heitorbarbosa, baseRarity: 'uncommon', baseOverall: 82 },
  { name: 'Gabriel Ortelan', position: 'Fixo', nationality: 'Brasil', age: 21, club: 'Estrela Futsal', attributes: { pace: 58, shooting: 45, passing: 60, dribbling: 52, defending: 80, physical: 80 }, image: gabrielortelan, baseRarity: 'uncommon', baseOverall: 70 },
  { name: 'Jonas Daniel', position: 'GK', nationality: 'Brasil', age: 18, club: 'Aurora Futsal', attributes: { pace: 45, shooting: 42, passing: 57, dribbling: 40, defending: 70, physical: 75 }, gkAttributes: { reflexes: 74, positioning: 64, handling: 72 }, image: jonasdanieldebritolopes, baseRarity: 'uncommon', baseOverall: 68 },
  { name: 'Rafinha', position: 'GK', nationality: 'Brasil', age: 22, club: 'Aurora Futsal', attributes: { pace: 60, shooting: 30, passing: 70, dribbling: 40, defending: 86, physical: 62 }, gkAttributes: { reflexes: 82, positioning: 90, handling: 80 }, image: rafaelteixeira, baseRarity: 'uncommon', baseOverall: 73 },
  { name: 'Monteiro', position: 'Pivo', nationality: 'Brasil', age: 20, club: 'Fênix Futsal', attributes: { pace: 55, shooting: 30, passing: 50, dribbling: 20, defending: 60, physical: 40 }, image: viniciusmonteiro, baseRarity: 'uncommon', baseOverall: 68 },
  { name: 'Eduardo', position: 'Ala', nationality: 'Brasil', age: 21, club: 'Aurora Futsal', attributes: { pace: 80, shooting: 80, passing: 70, dribbling: 70, defending: 60, physical: 85 }, image: eduardo, baseRarity: 'common', baseOverall: 77 },
  { name: 'Enzo Antonio', position: 'GK', nationality: 'Brasil', age: 20, club: 'Aurora Futsal', attributes: { pace: 60, shooting: 30, passing: 70, dribbling: 40, defending: 70, physical: 70 }, gkAttributes: { reflexes: 78, positioning: 80, handling: 75 }, image: enzoantonio, baseRarity: 'common', baseOverall: 73 },
];

const SEASONS = ['2025/26'];

function applyModifier(value: number, mod: number): number {
  return Math.max(0, Math.min(99, Math.round(value * mod)));
}

function calculateOverall(t: PlayerTemplate): number {
  if (t.baseOverall !== undefined) return t.baseOverall;
  const a = t.attributes;
  if (t.position === 'GK') {
    const gk = t.gkAttributes ?? { reflexes: 50, positioning: 50, handling: 50 };
    return Math.round(gk.reflexes * 0.30 + gk.positioning * 0.25 + a.defending * 0.20 + a.passing * 0.10 + a.physical * 0.10 + a.pace * 0.05);
  }
  if (t.position === 'Fixo') return Math.round(a.defending * 0.35 + a.physical * 0.20 + a.passing * 0.20 + a.pace * 0.10 + a.dribbling * 0.08 + a.shooting * 0.07);
  if (t.position === 'Ala') return Math.round(a.pace * 0.25 + a.passing * 0.22 + a.dribbling * 0.20 + a.shooting * 0.13 + a.defending * 0.12 + a.physical * 0.08);
  return Math.round(a.shooting * 0.32 + a.physical * 0.22 + a.dribbling * 0.18 + a.passing * 0.12 + a.pace * 0.10 + a.defending * 0.06);
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

  const overall = Math.min(99, (t.baseOverall ?? calculateOverall(t)) + (RARITY_OVR_BONUS[rarity] ?? 0) + (SPECIAL_OVR_BONUS[special] ?? 0));

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
