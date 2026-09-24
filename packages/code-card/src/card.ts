// A code card is a markdown file: flat `key: value` frontmatter plus ONE fenced code block.

import {existsSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {codeToHtml} from 'shiki';

export const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CARDS_DIR = join(PACKAGE_DIR, 'cards');
export const TMP_DIR = join(PACKAGE_DIR, 'tmp');
export const THEME = 'tokyo-night';
export const PAGE_WIDTH = 1200;
// The code's own left + right padding inside the window, in template.html.
const CODE_INSET = 64;
// A JetBrains Mono character is 0.6em wide.
const CHAR_WIDTH_EM = 0.6;
export const DEFAULT_PADDING = 40;
export const DEFAULT_CODE_SIZE = 22;
export const PADDING_RANGE = [0, 120] as const;
export const CODE_SIZE_RANGE = [12, 32] as const;
export const CARD_KEYS = ['title', 'subtitle', 'file', 'highlight', 'footer', 'badge', 'padding', 'codeSize'] as const;
const NUMBER_KEYS = ['padding', 'codeSize'];
export const CARD_NAME = /^[a-z0-9][a-z0-9-]*$/;

export type Card = {
  title: string;
  subtitle: string;
  file: string;
  footer: string;
  badge: string;
  lang: string;
  highlight: number[];
  padding: number;
  codeSize: number;
  code: string;
};

// How many code characters fit on one line of the window.
export const maxColumns = (padding: number, codeSize: number) =>
  Math.floor((PAGE_WIDTH - 2 * padding - CODE_INSET) / (CHAR_WIDTH_EM * codeSize));

export type RenderOptions = {zoom?: number};

const FONTS = [
  ['Inter', 'normal', '100 900', 'inter.woff2'],
  ['JetBrains Mono', 'normal', '100 800', 'jetbrains-mono.woff2'],
  ['JetBrains Mono', 'italic', '100 800', 'jetbrains-mono-italic.woff2'],
] as const;

const cardError = (source: string, message: string) => new Error(`${source}: ${message}`);

const unquote = (value: string) => {
  const quoted = value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0];
  return quoted ? value.slice(1, -1) : value;
};

export function parseCard(markdown: string, source = 'card'): Card {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const fields: Record<string, string> = {};
  let at = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.indexOf('---', 1);
    if (end === -1) throw cardError(source, 'frontmatter has no closing ---');
    for (const line of lines.slice(1, end)) {
      if (!line.trim()) continue;
      const colon = line.indexOf(':');
      if (colon === -1) throw cardError(source, `frontmatter line is not "key: value": ${line}`);
      fields[line.slice(0, colon).trim()] = unquote(line.slice(colon + 1).trim());
    }
    at = end + 1;
  }
  const open = lines.findIndex((line, i) => i >= at && /^`{3,}[\w-]*\s*$/.test(line));
  if (open === -1) throw cardError(source, 'no fenced code block');
  const fence = (lines[open].match(/^`+/) as RegExpMatchArray)[0];
  const close = lines.findIndex((line, i) => i > open && line.trimEnd() === fence);
  if (close === -1) throw cardError(source, 'code block has no closing fence');
  const lang = lines[open].slice(fence.length).trim() || 'ts';
  return validateCard({...fields, lang, code: lines.slice(open + 1, close).join('\n')}, source);
}

// Also the entry point for a card sent as JSON to the preview server.
export function validateCard(input: unknown, source = 'card'): Card {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw cardError(source, 'a card must be an object');
  const fields = input as Record<string, unknown>;
  const known: string[] = [...CARD_KEYS, 'lang', 'code'];
  for (const [key, value] of Object.entries(fields)) {
    if (!known.includes(key)) throw cardError(source, `unknown key "${key}" (known: ${CARD_KEYS.join(', ')})`);
    const numeric = NUMBER_KEYS.includes(key) && typeof value === 'number';
    if (typeof value !== 'string' && !numeric) throw cardError(source, `"${key}" must be a string`);
  }
  // The loop above let only strings, and numbers for the NUMBER_KEYS, through.
  const sizes = fields as Partial<Record<string, string | number>>;
  const padding = parseSize(sizes.padding, 'padding', DEFAULT_PADDING, PADDING_RANGE, source);
  const codeSize = parseSize(sizes.codeSize, 'codeSize', DEFAULT_CODE_SIZE, CODE_SIZE_RANGE, source);
  const columnLimit = maxColumns(padding, codeSize);
  const text = fields as Partial<Record<string, string>>;
  if (!text.title?.trim()) throw cardError(source, 'missing title');
  if (!text.code?.trim()) throw cardError(source, 'the code block is empty');
  const code = text.code.replace(/\s+$/, '');
  const codeLines = code.split('\n');
  codeLines.forEach((line, i) => {
    const columns = [...line].length;
    if (columns > columnLimit)
      throw cardError(
        source,
        `code line ${i + 1} is ${columns} columns, the window fits ${columnLimit} (lower codeSize or padding for more)`
      );
  });
  return {
    title: text.title.trim(),
    subtitle: text.subtitle?.trim() ?? '',
    file: text.file?.trim() ?? '',
    footer: text.footer?.trim() ?? '',
    badge: text.badge?.trim() ?? '',
    lang: text.lang?.trim() || 'ts',
    highlight: parseHighlight(text.highlight ?? '', codeLines.length, source),
    padding,
    codeSize,
    code,
  };
}

// A whole number of px inside the range; the card may leave it out.
function parseSize(
  value: string | number | undefined,
  key: string,
  fallback: number,
  [min, max]: readonly [number, number],
  source: string
): number {
  if (value === undefined || value === '') return fallback;
  const size = typeof value === 'number' ? value : Number(value.trim().replace(/px$/, ''));
  if (!Number.isInteger(size) || size < min || size > max)
    throw cardError(source, `"${key}" must be a whole number of px from ${min} to ${max}, got "${value}"`);
  return size;
}

export function parseHighlight(spec: string, lineCount: number, source = 'card'): number[] {
  const picked = new Set<number>();
  for (const part of spec
    .split(',')
    .map((piece) => piece.trim())
    .filter(Boolean)) {
    const range = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!range) throw cardError(source, `bad highlight "${part}" (use 12, 12-13 or 3,7-8)`);
    const from = Number(range[1]);
    const to = Number(range[2] ?? range[1]);
    if (from < 1 || to < from || to > lineCount) throw cardError(source, `highlight "${part}" is outside lines 1-${lineCount}`);
    for (let line = from; line <= to; line++) picked.add(line);
  }
  return [...picked].sort((a, b) => a - b);
}

export const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const titleHtml = (title: string) => escapeHtml(title).replace(/\*([^*]+)\*/g, '<span class="accent">$1</span>');

let fontFacesCache: string | undefined;
// Inlined as data URIs so the page needs nothing but itself.
function fontFaces(): string {
  fontFacesCache ??= FONTS.map(([family, style, weight, file]) => {
    const data = readFileSync(join(PACKAGE_DIR, 'fonts', file)).toString('base64');
    return `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${data}) format('woff2');}`;
  }).join('\n');
  return fontFacesCache;
}

export async function renderCardHtml(card: Card, {zoom = 1}: RenderOptions = {}): Promise<string> {
  const highlighted = new Set(card.highlight);
  const code = await codeToHtml(card.code, {
    lang: card.lang,
    theme: THEME,
    transformers: [
      {
        line(node, line) {
          if (highlighted.has(line)) this.addClassToHast(node, 'hl');
        },
      },
    ],
  });
  const footer = card.footer ? `<span>${escapeHtml(card.footer)}</span>` : '';
  const badge = card.badge ? `<code class="badge">${escapeHtml(card.badge)}</code>` : '';
  const slots: Record<string, string> = {
    pageTitle: escapeHtml(card.title.replace(/\*/g, '')),
    fontFaces: fontFaces(),
    // The screenshot tool saves at CSS pixels, so a sharp 2x PNG means zooming the page itself.
    zoom: String(zoom),
    pageWidth: String(PAGE_WIDTH),
    padding: `${card.padding}px`,
    codeSize: `${card.codeSize}px`,
    title: titleHtml(card.title),
    subtitle: card.subtitle ? `<div class="sub">${escapeHtml(card.subtitle)}</div>` : '',
    file: card.file ? `<span class="file">${escapeHtml(card.file)}</span>` : '',
    code,
    foot: footer || badge ? `<div class="foot">${footer}${badge}</div>` : '',
  };
  // A function replacer, so a `$` in the code is never read as a replacement pattern.
  return readFileSync(join(PACKAGE_DIR, 'template.html'), 'utf8').replace(
    /\{\{(\w+)\}\}/g,
    (_, slot: string) => slots[slot] ?? ''
  );
}

export function resolveCardPath(nameOrPath: string): string {
  if (nameOrPath.endsWith('.md') || nameOrPath.includes('/')) {
    const path = resolve(nameOrPath);
    if (!existsSync(path)) throw new Error(`no card file at ${path}`);
    return path;
  }
  for (const dir of [CARDS_DIR, TMP_DIR]) {
    const path = join(dir, `${nameOrPath}.md`);
    if (existsSync(path)) return path;
  }
  throw new Error(`no card named "${nameOrPath}" in packages/code-card/cards/ or packages/code-card/tmp/`);
}

export const loadCard = (path: string) => parseCard(readFileSync(path, 'utf8'), path);
