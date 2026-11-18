import { extractNewsSummary, parseJournalNews, parseSafeJournalNews, JOURNAL_HOME_URL } from '../../src/data/news';

describe('journal news feed', () => {
  it('extracts a short introduction and never returns the article body', () => {
    const summary = extractNewsSummary(`# Título\n\n**Uma introdução importante para a comunidade.**\n\nTexto completo que não deve ser exibido.`);

    expect(summary).toBe('Uma introdução importante para a comunidade.');
    expect(summary).not.toContain('Texto completo');
  });

  it('limits summaries and returns only safe public fields in newest-first order', () => {
    const content = `Esta é uma notícia com uma introdução longa o suficiente para servir de resumo. ${'Detalhe. '.repeat(30)}\n\nCorpo completo da notícia.`;
    const items = parseJournalNews([
      { id: 'old', title: 'Mais antiga', category: 'Esporte', player: 'Turma A', createdAt: '2026-01-01T10:00:00Z', content },
      { id: 'new', title: 'Mais recente', category: 'Evento', player: 'Turma B', createdAt: '2026-01-02T10:00:00Z', content, image: 'https://example.com/image.jpg' },
    ]);

    expect(items.map(item => item.id)).toEqual(['new', 'old']);
    expect(items[0].summary.length).toBeLessThanOrEqual(180);
    expect(items[0].image).toBeUndefined();
    expect(items[0]).not.toHaveProperty('content');
  });

  it('accepts only safe fields from the server-side news proxy', () => {
    const [item] = parseSafeJournalNews([{
      id: 'public-item',
      title: 'Título',
      category: 'Evento',
      player: 'Turma A',
      date: '23/10/2026',
      summary: 'Introdução da matéria. '.repeat(20),
      url: JOURNAL_HOME_URL,
      content: 'Corpo completo não deve passar para o frontend.',
    }]);

    expect(item).toMatchObject({ id: 'public-item' });
    expect(item.summary.length).toBeLessThanOrEqual(180);
    expect(item).not.toHaveProperty('content');
  });
});
