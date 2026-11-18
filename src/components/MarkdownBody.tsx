import type { ReactNode } from 'react';

const INLINE_MARKDOWN = /\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g;
const UNORDERED_ITEM = /^\s*[-*]\s+(.+)$/;
const ORDERED_ITEM = /^\s*\d+\.\s+(.+)$/;

function isSafeLink(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  const tokenPattern = new RegExp(INLINE_MARKDOWN);

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const key = `${keyPrefix}-${match.index}`;
    if (match[1] !== undefined) {
      nodes.push(isSafeLink(match[2])
        ? <a key={key} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-[var(--red)] underline">{match[1]}</a>
        : match[1]);
    } else if (match[3] !== undefined) {
      nodes.push(<code key={key} className="rounded bg-[var(--bg)] px-1 py-0.5 font-mono text-[0.9em]">{match[3]}</code>);
    } else if (match[4] !== undefined) {
      nodes.push(<strong key={key}>{match[4]}</strong>);
    } else {
      nodes.push(<em key={key}>{match[5] ?? match[6]}</em>);
    }
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export default function MarkdownBody({ body }: { body: string }) {
  const lines = body.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const unordered = UNORDERED_ITEM.exec(line);
    const ordered = ORDERED_ITEM.exec(line);
    if (unordered || ordered) {
      const isOrdered = ordered !== null;
      const itemPattern = isOrdered ? ORDERED_ITEM : UNORDERED_ITEM;
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = itemPattern.exec(lines[index]);
        if (!item) break;
        items.push(<li key={`list-${index}`}>{renderInline(item[1], `list-inline-${index}`)}</li>);
        index += 1;
      }
      const List = isOrdered ? 'ol' : 'ul';
      blocks.push(<List key={`list-${index}`} className={isOrdered ? 'list-decimal space-y-1 pl-5' : 'list-disc space-y-1 pl-5'}>{items}</List>);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim()
      && !UNORDERED_ITEM.test(lines[index])
      && !ORDERED_ITEM.test(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`} className="whitespace-pre-wrap">{renderInline(paragraph.join(' '), `paragraph-inline-${index}`)}</p>);
  }

  return <div className="space-y-2 break-words text-sm leading-relaxed text-[var(--text)]">{blocks}</div>;
}
