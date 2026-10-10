// A code card is a markdown file: flat `key: value` frontmatter plus one or more fenced code blocks,
// each optionally captioned by a `## heading` line right above it.

import {existsSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {codeToHtml} from 'shiki';
import {type Chart, chartHtml, parseChart} from './chart.ts';

export const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CARDS_DIR = join(PACKAGE_DIR, 'cards');
export const TMP_DIR = join(PACKAGE_DIR, 'tmp');
export const THEME = 'tokyo-night';
export const PAGE_WIDTH = 1200;
// The left + right padding of `.win pre` in template.html.
const CODE_INSET = 64;
// A JetBrains Mono character is 0.6em wide.
const CHAR_WIDTH_EM = 0.6;
export const DEFAULT_PADDING = 40;
export const DEFAULT_CODE_SIZE = 22;
export const PADDING_RANGE = [0, 120] as const;
export const CODE_SIZE_RANGE = [12, 32] as const;
export const CARD_KEYS = ['title', 'subtitle', 'file', 'highlight', 'footer', 'badge', 'padding', 'codeSize'] as const;
// Per-block keys: a fence line sets `file` and `highlight` as `key=value` attributes, a `## ` line sets `heading`.
export const BLOCK_KEYS = ['heading', 'file', 'highlight', 'lang', 'code'] as const;
const FENCE_ATTRS = ['file', 'highlight'];
const NUMBER_KEYS = ['padding', 'codeSize'];
export const CARD_NAME = /^[a-z0-9][a-z0-9-]*$/;

export type CodeBlock = {
  heading: string;
  file: string;
  lang: string;
  highlight: number[];
  code: string;
  // Set only for a `stats` fence, which draws tiles and bars instead of code.
  chart?: Chart;
};

export type Card = {
  title: string;
  subtitle: string;
  footer: string;
  badge: string;
  padding: number;
  codeSize: number;
  blocks: CodeBlock[];
};

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

const FENCE_OPEN = /^(`{3,})([\w-]*)((?:\s+\w+=(?:"[^"]*"|\S+))*)\s*$/;
const HEADING = /^##\s+(.+)$/;

function parseFenceAttrs(attrs: string, line: number, source: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, key, value] of attrs.matchAll(/(\w+)=("[^"]*"|\S+)/g)) {
    if (!FENCE_ATTRS.includes(key))
      throw cardError(source, `line ${line}: unknown fence attribute "${key}" (known: ${FENCE_ATTRS.join(', ')})`);
    found[key] = unquote(value);
  }
  return found;
}

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
  const blocks: Record<string, string>[] = [];
  let heading: string | undefined;
  for (let i = at; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const titled = line.match(HEADING);
    if (titled) {
      if (heading !== undefined) throw cardError(source, `line ${i + 1}: two headings in a row, a heading needs a code block under it`);
      heading = titled[1].trim();
      continue;
    }
    const open = line.match(FENCE_OPEN);
    if (!open) throw cardError(source, `line ${i + 1}: only code blocks and "## heading" lines go under the frontmatter: ${line}`);
    const close = lines.findIndex((next, j) => j > i && next.trimEnd() === open[1]);
    if (close === -1) throw cardError(source, 'code block has no closing fence');
    blocks.push({
      ...(heading === undefined ? {} : {heading}),
      ...parseFenceAttrs(open[3], i + 1, source),
      lang: open[2],
      code: lines.slice(i + 1, close).join('\n'),
    });
    heading = undefined;
    i = close;
  }
  if (heading !== undefined) throw cardError(source, `heading "${heading}" has no code block under it`);
  if (!blocks.length) throw cardError(source, 'no fenced code block');
  return validateCard({...fields, blocks}, source);
}

// Also the entry point for a card sent as JSON to the preview server.
// Frontmatter `file` and `highlight` belong to the first block.
export function validateCard(input: unknown, source = 'card'): Card {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw cardError(source, 'a card must be an object');
  const fields = input as Record<string, unknown>;
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'blocks') continue;
    if (!(CARD_KEYS as readonly string[]).includes(key))
      throw cardError(source, `unknown key "${key}" (known: ${[...CARD_KEYS, 'blocks'].join(', ')})`);
    const numeric = NUMBER_KEYS.includes(key) && typeof value === 'number';
    if (typeof value !== 'string' && !numeric) throw cardError(source, `"${key}" must be a string`);
  }
  // The loop let only strings, and numbers for NUMBER_KEYS, through.
  const sizes = fields as Partial<Record<string, string | number>>;
  const padding = parseSize(sizes.padding, 'padding', DEFAULT_PADDING, PADDING_RANGE, source);
  const codeSize = parseSize(sizes.codeSize, 'codeSize', DEFAULT_CODE_SIZE, CODE_SIZE_RANGE, source);
  const text = fields as Partial<Record<string, string>>;
  if (!text.title?.trim()) throw cardError(source, 'missing title');
  const rawBlocks = fields.blocks;
  if (!Array.isArray(rawBlocks) || !rawBlocks.length) throw cardError(source, '"blocks" must be a list of one or more code blocks');
  const blocks = rawBlocks.map((raw, index) => {
    const blockSource = rawBlocks.length > 1 ? `${source}: block ${index + 1}` : source;
    const own = index === 0 ? firstBlockWithFrontmatter(raw, text, blockSource) : raw;
    return validateBlock(own, maxColumns(padding, codeSize), blockSource);
  });
  if (blocks.length > 1 && blocks.some((block) => block.chart)) throw cardError(source, 'a stats block must be the only block');
  return {
    title: text.title.trim(),
    subtitle: text.subtitle?.trim() ?? '',
    footer: text.footer?.trim() ?? '',
    badge: text.badge?.trim() ?? '',
    padding,
    codeSize,
    blocks,
  };
}

function firstBlockWithFrontmatter(raw: unknown, text: Partial<Record<string, string>>, source: string): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const block = {...(raw as Record<string, unknown>)};
  for (const key of FENCE_ATTRS) {
    if (text[key] === undefined) continue;
    if (block[key] !== undefined) throw cardError(source, `"${key}" is set twice: in the frontmatter and on the first block`);
    block[key] = text[key];
  }
  return block;
}

function validateBlock(input: unknown, columnLimit: number, source: string): CodeBlock {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw cardError(source, 'a code block must be an object');
  for (const [key, value] of Object.entries(input)) {
    if (!(BLOCK_KEYS as readonly string[]).includes(key))
      throw cardError(source, `unknown block key "${key}" (known: ${BLOCK_KEYS.join(', ')})`);
    if (typeof value !== 'string') throw cardError(source, `"${key}" must be a string`);
  }
  const text = input as Partial<Record<string, string>>;
  if (!text.code?.trim()) throw cardError(source, 'the code block is empty');
  const code = text.code.replace(/\s+$/, '');
  const codeLines = code.split('\n');
  const lang = text.lang?.trim() || 'ts';
  const chart = lang === 'stats' ? parseChart(code, source) : undefined;
  if (chart && text.highlight?.trim()) throw cardError(source, 'highlight does not apply to a stats block');
  if (!chart) codeLines.forEach((line, i) => {
    const columns = [...line].length;
    if (columns > columnLimit)
      throw cardError(
        source,
        `code line ${i + 1} is ${columns} columns, the window fits ${columnLimit} (lower codeSize or padding for more)`
      );
  });
  const block: CodeBlock = {
    heading: text.heading?.trim() ?? '',
    file: text.file?.trim() ?? '',
    lang,
    highlight: chart ? [] : parseHighlight(text.highlight ?? '', codeLines.length, source),
    code,
  };
  if (chart) block.chart = chart;
  return block;
}

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

async function blockHtml(block: CodeBlock): Promise<string> {
  const highlighted = new Set(block.highlight);
  const code = block.chart
    ? chartHtml(block.chart, escapeHtml)
    : await codeToHtml(block.code, {
        lang: block.lang,
        theme: THEME,
        transformers: [
          {
            line(node, line) {
              if (highlighted.has(line)) this.addClassToHast(node, 'hl');
            },
          },
        ],
      });
  const heading = block.heading ? `<h2>${titleHtml(block.heading)}</h2>` : '';
  const file = block.file ? `<span class="file">${escapeHtml(block.file)}</span>` : '';
  const dots = '<i class="dot" style="background: #ff5f57"></i><i class="dot" style="background: #febc2e"></i><i class="dot" style="background: #28c840"></i>';
  return `${heading}<div class="win"><div class="bar">${dots}${file}</div>${code}</div>`;
}

export async function renderCardHtml(card: Card, {zoom = 1}: RenderOptions = {}): Promise<string> {
  const blocks = (await Promise.all(card.blocks.map(blockHtml))).join('\n');
  const footer = card.footer ? `<span>${escapeHtml(card.footer)}</span>` : '';
  const badge = card.badge ? `<code class="badge">${escapeHtml(card.badge)}</code>` : '';
  const slots: Record<string, string> = {
    pageTitle: escapeHtml(card.title.replace(/\*/g, '')),
    // Stats cards get larger type: they are read as a phone-sized thumbnail.
    kind: card.blocks[0].chart ? 'stats-card' : 'code-card',
    fontFaces: fontFaces(),
    // The screenshot tool saves at CSS pixels, so a sharp 2x PNG means zooming the page itself.
    zoom: String(zoom),
    pageWidth: String(PAGE_WIDTH),
    padding: `${card.padding}px`,
    codeSize: `${card.codeSize}px`,
    title: titleHtml(card.title),
    subtitle: card.subtitle ? `<div class="sub">${escapeHtml(card.subtitle)}</div>` : '',
    blocks,
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
  throw new Error(`no card named "${nameOrPath}" in tools/code-card/cards/ or tools/code-card/tmp/`);
}

export const loadCard = (path: string) => parseCard(readFileSync(path, 'utf8'), path);
