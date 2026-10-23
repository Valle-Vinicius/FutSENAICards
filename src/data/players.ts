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
  baseOverall: number;
  image: string;
  isGK?: boolean;
}

const TEMPLATES: PlayerTemplate[] = [
  { name: 'Enzo Thomas', position: 'ST', nationality: 'Brasil', age: 19, club: 'Aurora FC', baseOverall: 84, image: enzothomas },
  { name: 'Gabriel Ortelan', position: 'CAM', nationality: 'Brasil', age: 21, club: 'Estrela do Norte', baseOverall: 86, image: gabrielortelan },
  { name: 'Gustavo Hyppolito', position: 'CM', nationality: 'Brasil', age: 20, club: 'Fênix SC', baseOverall: 79, image: gustavohyppolito },
  { name: 'Heitor Barbosa', position: 'CB', nationality: 'Brasil', age: 22, club: 'Tigres FC', baseOverall: 82, image: heitorbarbosa },
  { name: 'João Marcos', position: 'GK', nationality: 'Brasil', age: 23, club: 'Leões FC', baseOverall: 80, image: joaomarcos, isGK: true },
  { name: 'Jonas Daniel', position: 'LW', nationality: 'Brasil', age: 18, club: 'Aurora FC', baseOverall: 81, image: jonasdanieldebritolopes },
  { name: 'Matheus Lopes', position: 'RW', nationality: 'Brasil', age: 19, club: 'Estrela do Norte', baseOverall: 78, image: matheuslopes },
  { name: 'Pietro Guedes', position: 'LB', nationality: 'Brasil', age: 20, club: 'Fênix SC', baseOverall: 77, image: pietroguedes },
  { name: 'Rafael Dutra', position: 'RB', nationality: 'Brasil', age: 21, club: 'Tigres FC', baseOverall: 76, image: rafaeldutra },
  { name: 'Thiago Tavares', position: 'CDM', nationality: 'Brasil', age: 24, club: 'Leões FC', baseOverall: 83, image: thiagotavares },
  { name: 'Vinícius Assunção', position: 'ST', nationality: 'Brasil', age: 22, club: 'Aurora FC', baseOverall: 88, image: viniciusassuncao },
];

const GK_POSITIONS = new Set(['GK','FutsalGK']);

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function jitter(base: number, spread = 6) { return base + (Math.random() * spread * 2 - spread); }

function attrsFor(t: PlayerTemplate, ovr: number) {
  const isGK = t.isGK || GK_POSITIONS.has(t.position);
  const isDef = ['CB','LB','RB','CDM'].includes(t.position);
  const isMid = ['CM','CAM','CDM'].includes(t.position);
  const isAtt = ['ST','LW','RW'].includes(t.position);

  if (isGK) {
    const reflexes = clamp(Math.round(jitter(ovr, 4)), 40, 99);
    const positioning = clamp(Math.round(jitter(ovr, 4)), 40, 99);
    const handling = clamp(Math.round(jitter(ovr, 4)), 40, 99);
    return {
      pace: clamp(Math.round(jitter(ovr - 20, 5)), 30, 70),
      shooting: clamp(Math.round(jitter(ovr - 30, 5)), 20, 60),
      passing: clamp(Math.round(jitter(ovr - 10, 5)), 40, 80),
      dribbling: clamp(Math.round(jitter(ovr - 15, 5)), 35, 75),
      defending: clamp(Math.round(jitter(ovr - 5, 4)), 50, 90),
      physical: clamp(Math.round(jitter(ovr - 5, 4)), 50, 90),
      reflexes, positioning, handling,
    };
  }
  let pace = ovr, shooting = ovr, passing = ovr, dribbling = ovr, defending = ovr, physical = ovr;
  if (isDef) { defending += 8; physical += 5; shooting -= 10; }
  if (isMid) { passing += 6; dribbling += 4; }
  if (isAtt) { shooting += 8; pace += 5; defending -= 12; }
  if (t.position === 'LW' || t.position === 'RW') { pace += 4; dribbling += 6; }
  if (t.position === 'ST') { shooting += 6; physical += 4; }
  if (t.position === 'CDM') { defending += 6; passing += 4; }
  const j = (v: number) => clamp(Math.round(jitter(v, 5)), 30, 99);
  return {
    pace: j(pace),
    shooting: j(shooting),
    passing: j(passing),
    dribbling: j(dribbling),
    defending: j(defending),
    physical: j(physical),
  };
}

const SEASONS = ['2025/26'];

export function generatePlayerCard(t: PlayerTemplate, rarity: Rarity, special: 'none'|'totw'|'potm'|'revelation'|'legend'|'futsal' = 'none'): PlayerCard {
  const meta = RARITY_META[rarity];
  let ovr = clamp(Math.round(jitter(t.baseOverall, 2)), meta.minOvr, meta.maxOvr);
  ovr = clamp(ovr, meta.minOvr, meta.maxOvr);
  const attrs = attrsFor(t, ovr);
  const overall = Math.round((attrs.pace + attrs.shooting + attrs.passing + attrs.dribbling + attrs.defending + attrs.physical) / 6);
  const finalOvr = clamp(overall, meta.minOvr, meta.maxOvr);
  return {
    uid: nanoid(10),
    playerId: t.name.toLowerCase().replace(/\s+/g, '-') + '-' + rarity,
    name: t.name,
    position: t.position,
    nationality: t.nationality,
    age: t.age,
    club: t.club,
    rarity,
    edition: SEASONS[0],
    special: special as any,
    overall: finalOvr,
    image: t.image,
    ...attrs,
    obtainedAt: Date.now(),
    favorite: false,
    isNew: true,
    xp: 0,
    evoPoints: 0,
    upgrades: { pace: 0, shooting: 0, passing: 0, dribbling: 0, defending: 0, physical: 0 },
  };
}

export function allTemplates() { return TEMPLATES; }

export function randomTemplate(positionFilter?: Position): PlayerTemplate {
  const pool = positionFilter ? TEMPLATES.filter(t => t.position === positionFilter) : TEMPLATES;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function generateIconCard(): PlayerCard {
  const t = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  const rarity: Rarity = Math.random() < 0.5 ? 'icon' : 'legendary';
  const special: any = rarity === 'icon' ? 'legend' : 'none';
  const card = generatePlayerCard(t, rarity, special);
  card.overall = clamp(card.overall + 3, RARITY_META[rarity].minOvr, RARITY_META[rarity].maxOvr);
  return card;
}
