/**
 * A small, dependency-free markdown parser covering what Remi renders: AI summaries, Ask-AI answers
 * and CMS pages. Supports headings, paragraphs, (nested) bullet and numbered lists, blockquotes,
 * fenced code, horizontal rules, bold, italic, strikethrough, inline code, links, autolinks and
 * numeric citations like [1].
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'del'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'cite'; label: string }
  | { type: 'break' };

export interface ListItem {
  children: Inline[];
  level: number;
}

export type Block =
  | { type: 'heading'; level: number; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { type: 'quote'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'rule' };

// Order matters: earlier alternatives win when two patterns start at the same index.
const INLINE_RE =
  /`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\[(\d{1,3})\]|\*([^*\s](?:[^*]*[^*\s])?)\*|_([^_\s](?:[^_]*[^_\s])?)_|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/;

const WORD_CHAR = /[A-Za-z0-9]/;

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let rest = source;
  let consumedBefore = '';

  const pushText = (text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.type === 'text') last.text += text;
    else out.push({ type: 'text', text });
  };

  while (rest.length > 0) {
    const match = INLINE_RE.exec(rest);
    if (!match) {
      pushText(rest);
      break;
    }
    const before = rest.slice(0, match.index);
    const prevChar = (consumedBefore + before).slice(-1);
    const [whole, code, strong1, strong2, del, linkText, linkHref, cite, em1, em2, url] = match;

    // `snake_case_words` must not become italics.
    if (em2 !== undefined && prevChar && WORD_CHAR.test(prevChar)) {
      pushText(before + whole[0]);
      consumedBefore += before + whole[0];
      rest = rest.slice(match.index + 1);
      continue;
    }

    pushText(before);
    if (code !== undefined) out.push({ type: 'code', text: code });
    else if (strong1 !== undefined || strong2 !== undefined) out.push({ type: 'strong', children: parseInline(strong1 ?? strong2 ?? '') });
    else if (del !== undefined) out.push({ type: 'del', children: parseInline(del) });
    else if (linkText !== undefined && linkHref !== undefined) out.push({ type: 'link', href: linkHref, children: parseInline(linkText) });
    else if (cite !== undefined) out.push({ type: 'cite', label: cite });
    else if (em1 !== undefined || em2 !== undefined) out.push({ type: 'em', children: parseInline(em1 ?? em2 ?? '') });
    else if (url !== undefined) out.push({ type: 'link', href: url, children: [{ type: 'text', text: url }] });
    else pushText(whole);

    consumedBefore += before + whole;
    rest = rest.slice(match.index + whole.length);
  }
  return out;
}

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE_RE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const BULLET_RE = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED_RE = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/;
const FENCE_RE = /^\s{0,3}(```|~~~)/;

function joinLines(lines: string[]): Inline[] {
  const inlines: Inline[] = [];
  lines.forEach((line, i) => {
    const hardBreak = /\s{2,}$/.test(line) || line.endsWith('\\');
    const text = line.replace(/\\$/, '').trim();
    inlines.push(...parseInline(text));
    if (i < lines.length - 1) inlines.push(hardBreak ? { type: 'break' } : { type: 'text', text: ' ' });
  });
  return inlines;
}

export function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    if (FENCE_RE.test(line)) {
      const fence = FENCE_RE.exec(line)?.[1] ?? '```';
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) {
        body.push(lines[i]);
        i++;
      }
      i++; // closing fence
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2]) });
      i++;
      continue;
    }

    if (RULE_RE.test(line)) {
      blocks.push({ type: 'rule' });
      i++;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        body.push(QUOTE_RE.exec(lines[i])?.[1] ?? '');
        i++;
      }
      blocks.push({ type: 'quote', children: joinLines(body.filter((l) => l.trim())) });
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    const ordered = ORDERED_RE.exec(line);
    if (bullet || ordered) {
      const isOrdered = !bullet && Boolean(ordered);
      const start = ordered && isOrdered ? Number(ordered[2]) : 1;
      const items: ListItem[] = [];
      const baseIndent = (bullet?.[1] ?? ordered?.[1] ?? '').length;
      let current: { lines: string[]; level: number } | null = null;

      const flush = () => {
        if (current) items.push({ level: current.level, children: joinLines(current.lines) });
        current = null;
      };

      while (i < lines.length) {
        const l = lines[i];
        if (!l.trim()) {
          // A blank line ends the list unless the next line continues it.
          const next = lines[i + 1];
          if (next !== undefined && (isOrdered ? ORDERED_RE.test(next) : BULLET_RE.test(next))) {
            i++;
            continue;
          }
          break;
        }
        const b = BULLET_RE.exec(l);
        const o = ORDERED_RE.exec(l);
        const itemMatch = b ?? o;
        if (itemMatch) {
          const indent = itemMatch[1].length;
          // A top-level item of the other kind starts a new list.
          if (indent <= baseIndent && Boolean(o && !b) !== isOrdered) break;
          flush();
          const text = b ? b[2] : (o?.[3] ?? '');
          current = { lines: [text], level: Math.min(3, Math.max(0, Math.floor((indent - baseIndent) / 2))) };
          i++;
          continue;
        }
        if (HEADING_RE.test(l) || QUOTE_RE.test(l) || FENCE_RE.test(l) || RULE_RE.test(l)) break;
        // Lazy continuation of the current item.
        if (current) (current as { lines: string[] }).lines.push(l.trim());
        i++;
      }
      flush();
      blocks.push({ type: 'list', ordered: isOrdered, start, items });
      continue;
    }

    // Paragraph: until a blank line or another block starts.
    const body: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !HEADING_RE.test(lines[i]) &&
      !FENCE_RE.test(lines[i]) &&
      !QUOTE_RE.test(lines[i]) &&
      !BULLET_RE.test(lines[i]) &&
      !ORDERED_RE.test(lines[i]) &&
      !RULE_RE.test(lines[i])
    ) {
      body.push(lines[i]);
      i++;
    }
    if (body.length) blocks.push({ type: 'paragraph', children: joinLines(body) });
    else i++;
  }

  return blocks;
}
