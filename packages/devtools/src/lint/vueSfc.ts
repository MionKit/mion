// A Vue SFC is not a file tsgo accepts, so the lint worker registers its <script> code under the build's
// virtual `Comp.vue.<lang>` path (vite/sfcTransform.ts) and maps each finding back onto the `.vue` file.
// ESLint (vue-eslint-parser) hands the rule the whole SFC; oxlint calls it once per <script> block with
// only that block's text and rejects a report outside it.

import {readFileSync} from 'node:fs';
import type {Diagnostic, DiagnosticSite} from '../core/protocol.ts';

interface ScriptBlock {
  contentStart: number;
  contentEnd: number;
  lang?: string;
}

/** What the worker sends for one `.vue` lint request, and how its findings come back. */
export interface VueLintSource {
  virtualFile: string;
  text: string;
  /** The finding on the `.vue` file's (or oxlint block's) own lines, or undefined when it lies outside them. */
  toVue(diagnostic: Diagnostic): Diagnostic | undefined;
}

const scriptOpenTag = /<script\b([^>]*)>/gi;
const scriptCloseTag = /<\/script\s*>/i;

export function isVueFile(file: string): boolean {
  return file.endsWith('.vue');
}

export function vueLintSource(file: string, text: string, readFile: (file: string) => string = readDisk): VueLintSource {
  const onDisk = readFile(file);
  const diskBlocks = scriptBlocks(onDisk);
  // An oxlint block: its text sits inside one block of the saved file, so the whole file gives the module.
  for (const block of diskBlocks) {
    const content = onDisk.slice(block.contentStart, block.contentEnd);
    const offset = content.indexOf(text);
    if (!text.trim() || offset < 0 || content.slice(0, offset).trim() || content.slice(offset + text.length).trim()) continue;
    const start = block.contentStart + offset;
    return {
      virtualFile: virtualPath(file, diskBlocks),
      text: scriptsOnly(onDisk, diskBlocks),
      toVue: (diagnostic) => toBlock(diagnostic, file, lineCol(onDisk, start), lineCol(onDisk, start + text.length)),
    };
  }
  // The whole SFC (ESLint): blanking everything but script code keeps every line and column where it was.
  if (/<script\b/i.test(text)) {
    const blocks = scriptBlocks(text);
    return {
      virtualFile: virtualPath(file, blocks),
      text: scriptsOnly(text, blocks),
      toVue: (diagnostic) => onFile(diagnostic, file),
    };
  }
  // An oxlint block edited since the last save: lint it alone, its lines are already the block's.
  return {virtualFile: virtualPath(file, diskBlocks), text, toVue: (diagnostic) => onFile(diagnostic, file)};
}

function readDisk(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

// Vue reads top-level <script> blocks as raw text up to the first `</script>`; a `src` block is a real file.
function scriptBlocks(sfc: string): ScriptBlock[] {
  const blocks: ScriptBlock[] = [];
  for (const open of sfc.matchAll(scriptOpenTag)) {
    const attrs = open[1] ?? '';
    const contentStart = open.index + open[0].length;
    const close = scriptCloseTag.exec(sfc.slice(contentStart));
    if (!close) break;
    if (/\bsrc\s*=/.test(attrs)) continue;
    const lang = /\blang\s*=\s*["']?([A-Za-z]+)/.exec(attrs)?.[1];
    blocks.push({contentStart, contentEnd: contentStart + close.index, lang});
  }
  return blocks;
}

// Same naming as vite/sfcTransform.ts, so relative imports resolve from the `.vue` file's own folder.
function virtualPath(file: string, blocks: ScriptBlock[]): string {
  return `${file}.${blocks.find((block) => block.lang)?.lang ?? 'js'}`;
}

function scriptsOnly(sfc: string, blocks: ScriptBlock[]): string {
  let out = '';
  let cursor = 0;
  for (const block of blocks) {
    out += blank(sfc.slice(cursor, block.contentStart)) + sfc.slice(block.contentStart, block.contentEnd);
    cursor = block.contentEnd;
  }
  return out + blank(sfc.slice(cursor));
}

function blank(markup: string): string {
  return markup.replace(/[^\r\n]/g, ' ');
}

// 1-based line and column, the way diagnostic sites count.
function lineCol(text: string, offset: number): {line: number; col: number} {
  const before = text.slice(0, offset);
  const lineStart = before.lastIndexOf('\n') + 1;
  return {line: before.split('\n').length, col: offset - lineStart + 1};
}

function onFile(diagnostic: Diagnostic, file: string): Diagnostic {
  return {
    ...diagnostic,
    site: {...diagnostic.site, filePath: file},
    related: diagnostic.related?.map((related) => ({...related, filePath: file})),
  };
}

type Position = {line: number; col: number};

function toBlock(diagnostic: Diagnostic, file: string, start: Position, end: Position): Diagnostic | undefined {
  const site = shift(diagnostic.site, start, end);
  if (!site) return undefined;
  const related = diagnostic.related?.flatMap((entry) => {
    const moved = shift(entry, start, end);
    return moved ? [{...entry, ...moved, filePath: file}] : [];
  });
  return {...diagnostic, site: {...site, filePath: file}, related};
}

function shift(site: DiagnosticSite, start: Position, end: Position): DiagnosticSite | undefined {
  if (!within({line: site.startLine, col: site.startCol}, start, end)) return undefined;
  const moved: DiagnosticSite = {...site, ...relative(site.startLine, site.startCol, start)};
  delete moved.endLine;
  delete moved.endCol;
  if (site.endLine && site.endCol && within({line: site.endLine, col: site.endCol}, start, {...end, col: end.col + 1})) {
    const relEnd = relative(site.endLine, site.endCol, start);
    moved.endLine = relEnd.startLine;
    moved.endCol = relEnd.startCol;
  }
  return moved;
}

function within(position: Position, start: Position, end: Position): boolean {
  const afterStart = position.line > start.line || (position.line === start.line && position.col >= start.col);
  const beforeEnd = position.line < end.line || (position.line === end.line && position.col < end.col);
  return afterStart && beforeEnd;
}

function relative(line: number, col: number, start: Position): {startLine: number; startCol: number} {
  return {startLine: line - start.line + 1, startCol: line === start.line ? col - start.col + 1 : col};
}
