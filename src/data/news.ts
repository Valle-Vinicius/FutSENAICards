export interface NewsItem {
  id: string;
  title: string;
  category: string;
  player: string;
  date: string;
  summary: string;
  image?: string;
  url: string;
}

export const JOURNAL_HOME_URL = 'https://pietro-guedes.github.io/FutSenai-Jornal/';
export const JOURNAL_SUPABASE_URL = 'https://jilppyiyrfgechgjgzlk.supabase.co';
const SUMMARY_MAX_LENGTH = 180;
const JOURNAL_IMAGES_PATH = '/storage/v1/object/public/news-images/';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatSummaryLine(line: string): string {
  return line
    .replace(/^>\s*/, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*`_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function limitSummary(summary: string): string {
  const characters = Array.from(summary);
  if (characters.length <= SUMMARY_MAX_LENGTH) return summary;
  const clipped = characters.slice(0, SUMMARY_MAX_LENGTH - 1).join('');
  const lastSpace = clipped.lastIndexOf(' ');
  const readable = lastSpace > SUMMARY_MAX_LENGTH * 0.65 ? clipped.slice(0, lastSpace) : clipped;
  return `${readable.trimEnd()}…`;
}

export function extractNewsSummary(content: string): string {
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || /^#{1,6}\s/.test(line)) {
      continue;
    }

    const summary = formatSummaryLine(line);
    if (!summary || /^(categoria|aluno\/turma envolvida|conteúdo da notícia):/i.test(summary)) continue;
    return limitSummary(summary);
  }
  return '';
}

function safeJournalImage(image: unknown): string | undefined {
  if (typeof image !== 'string' || !image.trim()) return undefined;
  try {
    const parsedUrl = new URL(image, JOURNAL_HOME_URL);
    const isJournalPageImage = parsedUrl.origin === new URL(JOURNAL_HOME_URL).origin;
    const isJournalStorageImage = parsedUrl.origin === JOURNAL_SUPABASE_URL
      && parsedUrl.pathname.startsWith(JOURNAL_IMAGES_PATH);
    if (!isJournalPageImage && !isJournalStorageImage) return undefined;
    return parsedUrl.href;
  } catch {
    return undefined;
  }
}

export function parseJournalNews(payload: unknown): NewsItem[] {
  if (!Array.isArray(payload)) throw new Error('O feed de notícias não retornou uma lista.');

  const items: { news: NewsItem; createdAt: number }[] = [];
  let rejectedItems = 0;
  for (const entry of payload) {
    if (
      !isRecord(entry)
      || typeof entry.id !== 'string'
      || typeof entry.title !== 'string'
      || typeof entry.category !== 'string'
      || typeof entry.player !== 'string'
      || typeof entry.content !== 'string'
      || typeof entry.createdAt !== 'string'
      || Number.isNaN(Date.parse(entry.createdAt))
      || entry.published === false
    ) {
      rejectedItems += 1;
      continue;
    }

    items.push({
      news: {
        id: entry.id,
        title: entry.title,
        category: entry.category,
        player: entry.player,
        date: new Date(entry.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        summary: extractNewsSummary(entry.content),
        image: safeJournalImage(entry.image),
        url: JOURNAL_HOME_URL,
      },
      createdAt: Date.parse(entry.createdAt),
    });
  }

  if (rejectedItems > 0) console.warn(`[news] ignored ${rejectedItems} invalid or unpublished feed item(s).`);
  return items.sort((a, b) => b.createdAt - a.createdAt).map(item => item.news);
}

export function parseSafeJournalNews(payload: unknown): NewsItem[] {
  if (!Array.isArray(payload)) throw new Error('O serviço de notícias não retornou uma lista.');

  return payload.flatMap(entry => {
    if (
      !isRecord(entry)
      || typeof entry.id !== 'string'
      || typeof entry.title !== 'string'
      || typeof entry.category !== 'string'
      || typeof entry.player !== 'string'
      || typeof entry.date !== 'string'
      || typeof entry.summary !== 'string'
      || entry.url !== JOURNAL_HOME_URL
    ) {
      return [];
    }

    return [{
      id: entry.id,
      title: entry.title,
      category: entry.category,
      player: entry.player,
      date: entry.date,
      summary: limitSummary(entry.summary),
      image: safeJournalImage(entry.image),
      url: JOURNAL_HOME_URL,
    }];
  });
}
