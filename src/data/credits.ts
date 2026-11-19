import type { PlayerCard, Rarity } from '../types';
import pietroGuedesImage from '../imagens/creditosfutsenai/pietroguedes.webp';
import viniciusValleImage from '../imagens/creditosfutsenai/viniciusvalle.webp';
import viniciusAssuncaoImage from '../imagens/creditosfutsenai/viniciusassuncao.webp';

export interface DeveloperAttribute {
  l: string;
  v: number;
}

type DeveloperCard = Omit<PlayerCard, 'position'> & { position: 'Developer' };

export interface CreditPerson {
  card: DeveloperCard;
  attributes: DeveloperAttribute[];
  role: string;
  website: string;
  specialty: string;
  projectName: string;
  projectDescription: string;
  technologies: string[];
}

function calculateOverall(attributes: DeveloperAttribute[]): number {
  if (attributes.length === 0) return 0;
  return Math.round(attributes.reduce((total, attribute) => total + attribute.v, 0) / attributes.length);
}

function createDeveloper(
  name: string,
  role: string,
  projectName: string,
  website: string,
  image: string,
  rarity: Rarity,
  specialty: string,
  projectDescription: string,
  technologies: string[],
  attributes: DeveloperAttribute[],
): CreditPerson {
  return {
    card: {
      uid: '',
      playerId: '',
      name,
      position: 'Developer',
      sport: 'futsal',
      nationality: 'Brasil',
      age: 0,
      club: 'FutSENAI',
      rarity,
      edition: 'Criadores',
      special: 'legend',
      overall: calculateOverall(attributes),
      xp: 0,
      evoPoints: 0,
      upgrades: {},
      evolutionLog: [],
      seasonStats: { matches: 0, goals: 0, assists: 0 },
      pace: 0,
      shooting: 0,
      passing: 0,
      dribbling: 0,
      defending: 0,
      physical: 0,
      obtainedAt: 0,
      favorite: false,
      isNew: false,
      image,
    },
    attributes,
    role,
    website,
    specialty,
    projectName,
    projectDescription,
    technologies,
  };
}

export const projectTechnologies = ['React', 'TypeScript', 'Vite', 'Tailwind CSS', 'Supabase', 'Vercel'];
export const architectureDescription = 'React e TypeScript no app, Supabase nos dados e Vercel na publicação.';
export const acknowledgements = 'Agradecemos ao SENAI, aos professores e a todas as pessoas que testaram os projetos e compartilharam sugestões.';
export const feedbackUrl = 'https://github.com/Valle-Vinicius/FutSENAICards/issues';

export const credits: CreditPerson[] = [
  createDeveloper(
    'Pietro Guedes',
    'Criador do Jornal',
    'Jornal FutSENAI',
    'https://futsenaijornal.vercel.app/',
    pietroGuedesImage,
    'legendary',
    'Mestre do Banco',
    'Notícias do futsal da comunidade.',
    projectTechnologies,
    [
      { l: 'FRO', v: 92 },
      { l: 'BAC', v: 84 },
      { l: 'BD', v: 80 },
      { l: 'SEG', v: 74 },
      { l: 'UX', v: 90 },
      { l: 'LOG', v: 86 },
    ],
  ),
  createDeveloper(
    'Vinicius Valle',
    'Criador do FutSENAI Cards',
    'FutSENAI Cards',
    'https://fut-senai-cards.vercel.app/',
    viniciusValleImage,
    'legendary',
    'Arquiteto',
    'Cartas e partidas de futsal da comunidade.',
    projectTechnologies,
    [
      { l: 'FRO', v: 88 },
      { l: 'BAC', v: 91 },
      { l: 'BD', v: 90 },
      { l: 'SEG', v: 85 },
      { l: 'UX', v: 82 },
      { l: 'LOG', v: 93 },
    ],
  ),
  createDeveloper(
    'Vinicius Assuncao',
    'Criador do Score',
    'FutSENAI Score',
    'https://futsenai-score.vercel.app/',
    viniciusAssuncaoImage,
    'legendary',
    'Caçador de Bugs',
    'Placar e resultados das competições.',
    projectTechnologies,
    [
      { l: 'FRO', v: 86 },
      { l: 'BAC', v: 83 },
      { l: 'BD', v: 78 },
      { l: 'SEG', v: 76 },
      { l: 'UX', v: 88 },
      { l: 'LOG', v: 85 },
    ],
  ),
];
