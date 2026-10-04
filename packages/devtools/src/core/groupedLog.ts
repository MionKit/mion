// The grouped log: each diagnostic name once with its message, then one line per site. Twin of
// internal/diagnostics/grouped.go; testdata/grouped/cases.json there pins both to the same bytes.

import path from 'node:path';
import {DIAGNOSTIC_CATALOG, fillSlots, renderHeadline} from './diagnosticCatalog.ts';
import {DOWNGRADED_NOTE} from './downgradeErrors.ts';
import {Severity, type Diagnostic, type DiagnosticSite} from './protocol.ts';
import type {GroupedEntry} from './types.ts';

const ESCAPES: Record<string, string> = {'\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t'};

interface Block {
  template: string;
  slots: readonly string[];
  entries: GroupedEntry[];
}

interface Group {
  severity: Severity;
  name: string;
  downgraded: boolean;
  blocks: Block[];
  size: number;
}

// A downgraded finding prints as a warning.
export function entryOf(diagnostic: Diagnostic, downgraded: boolean): GroupedEntry {
  const entry = DIAGNOSTIC_CATALOG[diagnostic.code];
  return {
    severity: downgraded ? Severity.Warning : diagnostic.severity,
    name: diagnostic.code,
    template: entry ? entry.headline : renderHeadline(diagnostic.code, diagnostic.args),
    slots: entry?.slots,
    args: diagnostic.args,
    site: diagnostic.site,
    related: diagnostic.related,
    downgraded,
  };
}

// A path under cwd prints relative to it; an empty cwd keeps every path as given.
export function formatGrouped(allEntries: readonly GroupedEntry[], cwd = ''): string {
  if (allEntries.length === 0) return '';
  const entries = cwd === '' ? allEntries : allEntries.map((entry) => relativeEntry(entry, cwd));
  const groups: Group[] = [];
  const groupByKey = new Map<string, Group>();
  const blockByKey = new Map<string, Block>();
  for (const entry of entries) {
    const downgraded = entry.downgraded ?? false;
    const groupLookup = JSON.stringify([entry.severity, entry.name, downgraded]);
    let group = groupByKey.get(groupLookup);
    if (!group) {
      group = {severity: entry.severity, name: entry.name, downgraded, blocks: [], size: 0};
      groupByKey.set(groupLookup, group);
      groups.push(group);
    }
    group.size += 1;
    const slots = entry.slots ?? [];
    const blockLookup = JSON.stringify([groupLookup, entry.template, slots]);
    let block = blockByKey.get(blockLookup);
    if (!block) {
      block = {template: entry.template, slots, entries: []};
      blockByKey.set(blockLookup, block);
      group.blocks.push(block);
    }
    block.entries.push(entry);
  }
  for (const group of groups) {
    for (const block of group.blocks) block.entries.sort(compareEntries);
    group.blocks.sort((left, right) => compareEntries(left.entries[0], right.entries[0]));
  }
  groups.sort(
    (left, right) =>
      left.severity - right.severity || compareBytes(left.name, right.name) || Number(left.downgraded) - Number(right.downgraded)
  );

  const parts: string[] = [];
  for (const group of groups) {
    let text = `${severityLabel(group.severity)} ${group.name} (${group.size})`;
    if (group.downgraded) text += ` ${DOWNGRADED_NOTE}`;
    for (const block of group.blocks) text += blockText(block);
    parts.push(text);
  }
  parts.push(countLine(entries));
  return parts.join('\n\n');
}

// A slot with one value at every site goes into the message; the rest print per site.
function blockText(block: Block): string {
  const varying: number[] = [];
  // A varying slot fills with its own placeholder, so the message keeps `{name}` there.
  const fill = block.slots.map((slot, index) => {
    const first = argAt(block.entries[0].args, index);
    if (!block.entries.some((entry) => argAt(entry.args, index) !== first)) return first;
    varying.push(index);
    return `{${slot}}`;
  });
  const message = block.slots.length === 0 ? block.template : fillSlots(block.template, block.slots, fill);
  let text = '';
  // Detail lines (a TypeScript message chain) sit deeper than the sites, so they never read as one.
  message.split('\n').forEach((line, index) => (text += `\n  ${index > 0 ? '    ' : ''}${line}`));
  for (const entry of block.entries) {
    text += `\n    ${location(entry.site)}`;
    for (const index of varying) text += `  ${block.slots[index]}=${quoted(argAt(entry.args, index))}`;
    for (const related of entry.related ?? []) text += `\n      Related: ${location(related)} ${related.message}`;
  }
  return text;
}

function relativeEntry(entry: GroupedEntry, cwd: string): GroupedEntry {
  const site = {...entry.site, filePath: relativePath(entry.site.filePath, cwd)};
  const related = entry.related?.map((pointer) => ({...pointer, filePath: relativePath(pointer.filePath, cwd)}));
  return related ? {...entry, site, related} : {...entry, site};
}

function relativePath(filePath: string, cwd: string): string {
  if (!path.isAbsolute(filePath)) return filePath;
  const rel = path.relative(cwd, filePath);
  // The project folder itself stays as given: an empty path would read as no place at all.
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return filePath;
  return rel.split(path.sep).join('/');
}

function argAt(args: readonly string[] | undefined, index: number): string {
  return args && index < args.length ? args[index] : '';
}

// `file:line:col` is the form terminals and editors open on click.
function location(site: DiagnosticSite): string {
  if (site.filePath === '') return '(no file)';
  if (site.startLine <= 0) return site.filePath;
  return `${site.filePath}:${site.startLine}:${site.startCol}`;
}

// An empty value or one holding whitespace or a quote is quoted, so where it ends stays visible.
function quoted(value: string): string {
  if (value !== '' && !/[ \t\n\r"]/.test(value)) return value;
  return `"${value.replace(/[\\"\n\r\t]/g, (char) => ESCAPES[char])}"`;
}

function countLine(entries: readonly GroupedEntry[]): string {
  const counts = new Map<Severity, number>();
  const files = new Set<string>();
  for (const entry of entries) {
    counts.set(entry.severity, (counts.get(entry.severity) ?? 0) + 1);
    if (entry.site.filePath !== '') files.add(entry.site.filePath);
  }
  const parts: string[] = [];
  for (const [severity, singular, many] of [
    [Severity.Error, 'error', 'errors'],
    [Severity.Warning, 'warning', 'warnings'],
    [Severity.Info, 'info', 'info'],
  ] as const) {
    const count = counts.get(severity) ?? 0;
    if (count > 0) parts.push(`${count} ${count === 1 ? singular : many}`);
  }
  let line = `mion: ${parts.join(', ')}`;
  if (files.size > 0) line += ` in ${files.size} ${files.size === 1 ? 'file' : 'files'}`;
  return line;
}

export function severityLabel(severity: Severity): string {
  if (severity === Severity.Error) return 'error';
  if (severity === Severity.Warning) return 'warning';
  return 'info';
}

// Go compares strings by bytes; Buffer.compare matches it where `<` on UTF-16 would not.
function compareBytes(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function compareEntries(left: GroupedEntry, right: GroupedEntry): number {
  const byFile = compareBytes(left.site.filePath, right.site.filePath);
  if (byFile !== 0) return byFile;
  if (left.site.startLine !== right.site.startLine) return left.site.startLine - right.site.startLine;
  if (left.site.startCol !== right.site.startCol) return left.site.startCol - right.site.startCol;
  const leftArgs = left.args ?? [];
  const rightArgs = right.args ?? [];
  for (let index = 0; index < Math.min(leftArgs.length, rightArgs.length); index++) {
    const order = compareBytes(leftArgs[index], rightArgs[index]);
    if (order !== 0) return order;
  }
  return leftArgs.length - rightArgs.length;
}
