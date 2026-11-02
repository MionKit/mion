// tsgo cannot read a Vue SFC, so lint scans its <script> code under the build's virtual `Comp.vue.<lang>` path
// (vite/sfcTransform.ts) and maps findings back. ESLint passes the whole SFC; oxlint passes one <script> block's
// text and rejects a report outside it.

import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import type {Diagnostic, DiagnosticSite} from '../core/protocol.ts';

/** Subset of @vue/compiler-sfc, the parser the build's SFC pass also uses. */
interface SfcBlock {
  lang?: string;
  src?: string;
  loc: {start: {offset: number}; end: {offset: number}};
}
interface SfcCompiler {
  parse(source: string, options?: {filename?: string}): {descriptor: {script: SfcBlock | null; scriptSetup: SfcBlock | null}};
}

interface Position {
  line: number;
  col: number;
}

interface VueLintSource {
  virtualFile: string;
  text: string;
  /** Undefined when the finding lies outside the `.vue` file's (or oxlint block's) own lines. */
  toVue(diagnostic: Diagnostic): Diagnostic | undefined;
}

export function vueLintSource(file: string, text: string, readFile: (file: string) => string = readDisk): VueLintSource {
  const onDisk = readFile(file);
  const diskBlocks = onDisk ? scriptBlocks(onDisk, file) : [];
  const diskVirtual = virtualPath(file, diskBlocks);
  // An oxlint block: its text is one block of the saved file, so the whole file gives the module.
  for (const block of diskBlocks) {
    const content = onDisk.slice(block.loc.start.offset, block.loc.end.offset);
    const offset = content.indexOf(text);
    if (!text.trim() || offset < 0 || content.slice(0, offset).trim() || content.slice(offset + text.length).trim()) continue;
    const start = block.loc.start.offset + offset;
    const range = {start: lineCol(onDisk, start), end: lineCol(onDisk, start + text.length)};
    return {
      virtualFile: diskVirtual,
      text: scriptsOnly(onDisk, diskBlocks),
      toVue: (diagnostic) => remap(diagnostic, diskVirtual, file, range),
    };
  }
  // The whole SFC (ESLint): blanking everything but script code keeps every line and column where it was.
  if (/<script\b/i.test(text)) {
    const blocks = scriptBlocks(text, file);
    const virtualFile = virtualPath(file, blocks);
    return {virtualFile, text: scriptsOnly(text, blocks), toVue: (diagnostic) => remap(diagnostic, virtualFile, file)};
  }
  // An oxlint block edited since the save: beside another block it lacks that block's types, so it reports nothing.
  return {
    virtualFile: diskVirtual,
    text,
    toVue: diskBlocks.length > 1 ? () => undefined : (diagnostic) => remap(diagnostic, diskVirtual, file),
  };
}

function readDisk(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

// The project's own compiler, as the build's SFC pass borrows it, so lint reads exactly the blocks the build does.
function sfcCompiler(file: string): SfcCompiler {
  for (const from of [file, path.join(process.cwd(), 'index.js')]) {
    try {
      return createRequire(from)('vue/compiler-sfc') as SfcCompiler;
    } catch {
      // try the next location
    }
  }
  throw new Error(`vue/compiler-sfc is not resolvable from ${file}, so its <script> code cannot be linted`);
}

// A `src` block is a real file the program already holds.
function scriptBlocks(sfc: string, file: string): SfcBlock[] {
  const {descriptor} = sfcCompiler(file).parse(sfc, {filename: file});
  return [descriptor.script, descriptor.scriptSetup]
    .filter((block): block is SfcBlock => !!block && !block.src)
    .sort((first, second) => first.loc.start.offset - second.loc.start.offset);
}

// Mirrors vite/sfcTransform.ts so relative imports resolve; no saved block falls back to `.ts`, which also parses JavaScript.
function virtualPath(file: string, blocks: SfcBlock[]): string {
  if (!blocks.length) return `${file}.ts`;
  return `${file}.${blocks.find((block) => block.lang)?.lang ?? 'js'}`;
}

function scriptsOnly(sfc: string, blocks: SfcBlock[]): string {
  let out = '';
  let cursor = 0;
  for (const block of blocks) {
    out += blank(sfc.slice(cursor, block.loc.start.offset)) + sfc.slice(block.loc.start.offset, block.loc.end.offset);
    cursor = block.loc.end.offset;
  }
  return out + blank(sfc.slice(cursor));
}

function blank(markup: string): string {
  return markup.replace(/[^\r\n]/g, ' ');
}

// 1-based line and UTF-8 byte column, the way the resolver counts diagnostic sites.
function lineCol(text: string, offset: number): Position {
  const before = text.slice(0, offset);
  const lineStart = before.lastIndexOf('\n') + 1;
  return {line: before.split('\n').length, col: Buffer.byteLength(before.slice(lineStart)) + 1};
}

// Only sites in the virtual module move onto the `.vue` file; a related site in an imported file keeps its path.
function remap(
  diagnostic: Diagnostic,
  virtualFile: string,
  file: string,
  range?: {start: Position; end: Position}
): Diagnostic | undefined {
  const inModule = (site: DiagnosticSite): boolean => path.resolve(site.filePath) === path.resolve(virtualFile);
  const site = range ? shift(diagnostic.site, range.start, range.end) : diagnostic.site;
  if (!site) return undefined;
  const related = diagnostic.related?.flatMap((entry) => {
    if (!inModule(entry)) return [entry];
    const moved = range ? shift(entry, range.start, range.end) : entry;
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

function relative(line: number, col: number, start: Position): Pick<DiagnosticSite, 'startLine' | 'startCol'> {
  return {startLine: line - start.line + 1, startCol: line === start.line ? col - start.col + 1 : col};
}
