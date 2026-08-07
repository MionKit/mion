// The TYPE gate — the assignability half of official conformance. Every
// spec-VALID sample of every `ok` group is emitted (by
// scripts/core/gen-json-schema-suite.mjs generate) as
// `export const c: JsonSchemaType<typeof s> = <sample>;` under
// generated/type-gate/, and this test compiles those modules through the real
// TypeScript compiler against the real src tree. A sample failing to assign is
// a TYPE divergence, held against type-gate-divergences.json in BOTH
// directions: an unledgered failure reds the lane, and so does a ledger entry
// that no longer reproduces (a silent improvement must be recorded).
//
// Two diagnostic codes are filtered before anything is judged: TS2353 and its
// TS2561 suggestion twin — the fresh-literal excess-property check. JSON
// Schema objects are OPEN-WORLD, so valid samples routinely carry keys the
// recovered type never declares; that is spec semantics, not a divergence
// (the suppressExcessPropertyErrors flag left TypeScript in 5.5, hence the
// diagnostic-level filter). Negative samples are never asserted at all.
import {describe, expect, it} from 'vitest';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ts = require('typescript') as typeof import('typescript');

const LANE_DIR = fileURLToPath(new URL('.', import.meta.url));
const MAP_FILE = join(LANE_DIR, 'generated', 'type-gate', 'map.json');
const LEDGER_FILE = join(LANE_DIR, 'type-gate-divergences.json');

interface GateCase {
  file: string;
  group: string;
  case: string;
  startLine: number;
  endLine: number;
}
interface GateModule {
  module: string;
  cases: GateCase[];
}
interface GateLedgerEntry {
  file: string;
  group: string;
  case: string;
  note: string;
}

const caseKey = (c: {file: string; group: string; case: string}): string => `${c.file} :: ${c.group} :: ${c.case}`;

// The fresh-literal excess-property check (+ its did-you-mean variant).
const FILTERED_CODES = new Set([2353, 2561]);

function collectFailures(): {observed: Map<string, string>; total: number} {
  const map = JSON.parse(readFileSync(MAP_FILE, 'utf8')) as {modules: GateModule[]};
  const roots = map.modules.map((m) => join(LANE_DIR, 'generated', m.module));
  const options: import('typescript').CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.esnext.temporal.d.ts'],
  };
  const program = ts.createProgram(roots, options);
  const observed = new Map<string, string>();
  let total = 0;
  for (const gateModule of map.modules) {
    total += gateModule.cases.length;
    const source = program.getSourceFile(join(LANE_DIR, 'generated', gateModule.module));
    expect(source, `missing generated module ${gateModule.module} — run the generate verb`).toBeDefined();
    if (!source) continue;
    const diagnostics = [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)].filter(
      (d) => d.category === ts.DiagnosticCategory.Error && !FILTERED_CODES.has(d.code)
    );
    for (const diagnostic of diagnostics) {
      const line = diagnostic.start === undefined ? 0 : source.getLineAndCharacterOfPosition(diagnostic.start).line + 1;
      const hit = gateModule.cases.find((c) => line >= c.startLine && line <= c.endLine);
      const message = `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ').slice(0, 160)}`;
      expect(hit, `type-gate diagnostic outside any case range (${gateModule.module}:${line}) — ${message}`).toBeDefined();
      if (hit && !observed.has(caseKey(hit))) observed.set(caseKey(hit), message);
    }
  }
  return {observed, total};
}

function readGateLedger(): GateLedgerEntry[] {
  if (!existsSync(LEDGER_FILE)) return [];
  return (JSON.parse(readFileSync(LEDGER_FILE, 'utf8')) as {entries: GateLedgerEntry[]}).entries;
}

describe('official suite — the JsonSchemaType assignability gate', () => {
  const {observed, total} = collectFailures();
  const ledger = readGateLedger();
  const ledgered = new Set(ledger.map(caseKey));

  it('asserts a non-trivial corpus', () => {
    expect(total).toBeGreaterThan(500);
  });

  it('every observed type divergence is ledgered', () => {
    const unledgered = [...observed.entries()].filter(([key]) => !ledgered.has(key)).map(([key, msg]) => `${key} — ${msg}`);
    expect(unledgered, 'new type divergences — fix them, or record them in type-gate-divergences.json with a note').toEqual([]);
  });

  it('every ledger entry still reproduces (fixed ones must be removed)', () => {
    const stale = ledger.map(caseKey).filter((key) => !observed.has(key));
    expect(stale, 'stale type-gate ledger entries (now assigning?) — remove them from type-gate-divergences.json').toEqual([]);
  });

  it('every ledger entry carries a note', () => {
    expect(ledger.filter((e) => !e.note).map(caseKey)).toEqual([]);
  });
});
