// M7 translation fuzz — the FromJsonSchema fidelity lane. Each iteration
// generates a random wild type (typeGen), normalizes it into the
// schema-expressible subset (schemaRender), then renders the SAME normalized
// shape twice into one fixture:
//
//   type T = <renderType(root)>            → getRunTypeId<T>()          (static)
//   jsonSchemaOf(<renderSchemaLiteral(…)>) → InjectRunTypeId<FromJsonSchema<S>>
//                                                                       (reflect)
//
// The fixture's own `jsonSchemaOf` wrapper mirrors the real builder's marker
// contract (trailing `id?: InjectRunTypeId<FromJsonSchema<S>>` — the scanner
// keys on the trailing brand, not the callee, per the F17 fixtures), typed
// against the REAL inference engine: the `jsonschema-extract` region of
// src/json-schema/fromJsonSchema.ts is sliced verbatim into a sibling virtual
// module, so the type under fuzz can never drift from the shipped one. The
// two call shapes also keep the marker coverage rule satisfied (one static,
// one value-inferred site per fixture).
//
// ORACLE — structural-id equality: both reflection sites must resolve to the
// same id. Anything else (site count, resolver crash, id mismatch) is a
// violation, gated lazily by the TS-validity check (tsgo is lenient; a
// non-compiling fixture is a generator false positive, not a translation
// bug — same keep-violation-on-throw semantics as typeFuzzRunner).
//
// Needs the Go binary (skipped when absent). Soak: RT_FUZZ_JSONSCHEMA_SOAK_MS.

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import type {ResolverClient} from '../../../../ts-runtypes-devtools/src/resolver-client.ts';
import {RUNTYPES_DTS} from '../../../../ts-runtypes-devtools/test/helpers/inline.ts';
import {hasBinary, openClient} from '../type/typeFuzzHarness.ts';
import {typecheckSource} from '../type/tsValidate.ts';
import {mixSeed, withSeededRandom} from '../core/seededRng.ts';
import {
  FUZZ_EMAIL_PATTERN,
  FUZZ_FORMAT_PREAMBLE,
  WILD_GEN_OPTIONS,
  genType,
  renderDecl,
  renderType,
  usesFormatLeaves,
  type GeneratedType,
} from '../core/typeGen.ts';
import {renderSchemaLiteral, toSchemaExpressible, type SchemaExpressible} from './schemaRender.ts';

const FROM_JSON_SCHEMA_TS = fileURLToPath(new URL('../../../src/json-schema/fromJsonSchema.ts', import.meta.url));
const STRUCTURAL_TS = fileURLToPath(new URL('../../../src/formats/structural.ts', import.meta.url));
const STATIC_TS = fileURLToPath(new URL('../../../src/schema/static.ts', import.meta.url));

/** Slice a marked `#region <name>` block out of `file` verbatim. **/
function extractRegion(file: string, name: string): string {
  const source = readFileSync(file, 'utf8');
  const start = source.indexOf(`// #region ${name}`);
  const end = source.indexOf(`// #endregion ${name}`);
  if (start === -1 || end === -1) throw new Error(`${name} region markers not found`);
  return source.slice(start, end);
}

/** The `structural-slice` region of formats/structural.ts + the `oneof-slice`
 *  region of schema/static.ts — the REAL `FormattedArray` / `FormattedObject`
 *  and `OneOf` definitions the translation references, pulled in verbatim so the
 *  fuzz module uses them directly instead of hand-written copies. `Flatten` is
 *  provided by the translation slice. **/
function extractStructuralRegion(): string {
  return extractRegion(STRUCTURAL_TS, 'structural-slice');
}
function extractOneOfRegion(): string {
  return extractRegion(STATIC_TS, 'oneof-slice');
}

/** The sliced `jsonschema-extract` region as a standalone virtual MODULE:
 *  exports kept (unlike the compile harness, which strips them for non-module
 *  snippets), plus structural brand stand-ins for the real formats module.
 *  The Email / UUID stand-ins are CONVERGENCE-RELEVANT — the normalizer
 *  emits `format: 'email' | 'uuid'`, and the type-first side spells the same
 *  brands via FUZZ_FORMAT_PREAMBLE, so both must carry identical params
 *  (Email's pattern is interpolated from the shared FUZZ_EMAIL_PATTERN).
 *  The remaining stand-ins (date/time/ip/…) are never emitted by the
 *  normalizer and only need to typecheck. **/
function buildJsonSchemaModule(): string {
  const source = readFileSync(FROM_JSON_SCHEMA_TS, 'utf8');
  const start = source.indexOf('// #region jsonschema-extract');
  const end = source.indexOf('// #endregion jsonschema-extract');
  if (start === -1 || end === -1) throw new Error('jsonschema-extract region markers not found');
  return `type TypeFormat<Base, Name extends string, Params extends object> = Base & {
  readonly __rtFormatName?: Name;
  readonly __rtFormatParams?: Params;
};
type StringFormat<P extends object> = TypeFormat<string, 'stringFormat', P>;
type NumberFormat<P extends object> = TypeFormat<number, 'numberFormat', P>;
type Email<P extends object = {}> = TypeFormat<string, 'email', {pattern: {source: '${FUZZ_EMAIL_PATTERN}'; flags: ''}}>;
type UUID = TypeFormat<string, 'uuid', {version: 'any'}>;
type StringDate = TypeFormat<string, 'date', {}>;
type StringTime = TypeFormat<string, 'time', {}>;
type StringDateTime = TypeFormat<string, 'dateTime', {}>;
type Domain<P extends object = {}> = TypeFormat<string, 'domain', P>;
type IPv4 = TypeFormat<string, 'ip', {version: 4}>;
type IPv6 = TypeFormat<string, 'ip', {version: 6}>;
type Url<P extends object = {}> = TypeFormat<string, 'url', P>;
type Base64<P extends object = {}> = TypeFormat<string, 'stringFormat', P & {pattern: {source: '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'; flags: ''; mockSamples: ['', 'QQ==', 'QUJD', 'SGVsbG8=']}}>;
type Base32<P extends object = {}> = TypeFormat<string, 'stringFormat', P & {pattern: {source: '^(?:[A-Z2-7]{8})*(?:[A-Z2-7]{2}={6}|[A-Z2-7]{4}={4}|[A-Z2-7]{5}={3}|[A-Z2-7]{7}=)?$'; flags: ''; mockSamples: ['', 'MY======', 'MZXQ====']}}>;
type Base16<P extends object = {}> = TypeFormat<string, 'stringFormat', P & {pattern: {source: '^(?:[0-9A-Fa-f]{2})*$'; flags: ''; mockSamples: ['', '48656C6C6F', 'DEADBEEF']}}>;
type JsonContent<P extends object = {}> = TypeFormat<string, 'jsonContent', P & {json: true; mockSamples: ['{}', '[]', '"text"', '7', 'true', 'null']}>;
type JsonContentBase64<P extends object = {}> = TypeFormat<string, 'jsonContent', P & {json: true; decode: 'base64'; mockSamples: ['e30=', 'W10=', 'InRleHQi', 'bnVsbA==']}>;
${extractStructuralRegion()}
${extractOneOfRegion()}
${source.slice(start, end)}
`;
}

const JSONSCHEMA_MODULE = buildJsonSchemaModule();
const FIXTURE = 'g.ts';

/** The format-alias preamble when the normalized shape carries format/not
 *  leaves — shared by the fixture renderer AND the TS-validity gate (a
 *  gate without the aliases would misfile every format finding as an
 *  invalid-TS false positive). **/
function formatPreambleFor(norm: SchemaExpressible): string {
  const asGenerated = {
    decls: norm.defs.map((d) => ({kind: 'interface', name: d.name, props: d.props}) as const),
    root: norm.root,
  };
  return usesFormatLeaves(asGenerated) ? `${FUZZ_FORMAT_PREAMBLE}\n` : '';
}

/** Render the two-site fixture from ONE normalized shape. **/
function renderFixture(norm: SchemaExpressible): string {
  const decls = norm.defs.map((d) => renderDecl({kind: 'interface', name: d.name, props: d.props})).join('\n');
  const formatPreamble = formatPreambleFor(norm);
  return `import {getRunTypeId, type InjectRunTypeId} from '@ts-runtypes/core';
import type {FromJsonSchema} from './jsonschema.ts';
${formatPreamble}${decls}
type T = ${renderType(norm.root)};
function jsonSchemaOf<const S>(_schema: S, id?: InjectRunTypeId<FromJsonSchema<S>>): string {
  if (!id) throw new Error('transformer not active');
  return id;
}
export const typeFirstId = getRunTypeId<T>();
export const schemaId = jsonSchemaOf(${renderSchemaLiteral(norm)});
`;
}

interface Violation {
  seed: number;
  message: string;
  fixture: string;
}

interface Report {
  runs: number;
  violations: Violation[];
  skippedInvalidTypes: number;
}

const SCAN_TIMEOUT_MS = 20_000;

class ClientHolder {
  private client: ResolverClient | null = null;
  get(): ResolverClient {
    if (!this.client) this.client = openClient();
    return this.client;
  }
  // A single unanswered request wedges the whole request queue — kill and let
  // the next get() respawn (same holder pattern as typeFuzzRunner).
  restart(): void {
    this.close();
  }
  close(): void {
    try {
      this.client?.close();
    } catch {
      // already dead — nothing to release
    }
    this.client = null;
  }
}

/** One iteration: generate → normalize → render both sides → scan → compare
 *  the two reflection ids. Violations are gated by the lazy TS-validity check
 *  on the TYPE-FIRST rendering (decls + root — the schema side is expressible
 *  by construction). **/
async function runOne(holder: ClientHolder, seed: number, report: Report): Promise<void> {
  const generated = withSeededRandom(seed, () => genType({...WILD_GEN_OPTIONS, structuralFormats: true}));
  const norm = toSchemaExpressible(generated);
  report.runs++;
  const fixture = renderFixture(norm);

  let message: string | null = null;
  try {
    const client = holder.get();
    const scan = (async () => {
      await client.setSources({'runtypes.d.ts': RUNTYPES_DTS, 'jsonschema.ts': JSONSCHEMA_MODULE, [FIXTURE]: fixture});
      return client.scanFiles([FIXTURE]);
    })();
    scan.catch(() => {});
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), SCAN_TIMEOUT_MS).unref?.());
    const resp = await Promise.race([scan, timeout]);
    if (resp === 'timeout') {
      holder.restart();
      message = `scan timed out after ${SCAN_TIMEOUT_MS}ms (resolver restarted)`;
    } else {
      const reflectionSites = (resp.sites ?? []).filter((s) => !s.fnId).sort((a, b) => a.pos - b.pos);
      if (reflectionSites.length !== 2) {
        message = `expected 2 reflection sites (type-first + schema), got ${reflectionSites.length}`;
      } else {
        const [typeFirst, schema] = reflectionSites;
        if (typeFirst.id !== schema.id) {
          message = `id mismatch: type-first '${typeFirst.id}' vs runTypeFromJsonSchema '${schema.id}'`;
        }
      }
    }
  } catch (err) {
    message = `resolver error: ${err instanceof Error ? err.message : String(err)}`;
  }
  if (message === null) return;

  // Lazy validity gate — only a compiling type-first rendering is a real
  // finding. If the check itself throws, KEEP the violation (never hide a bug).
  try {
    const decls = norm.defs.map((d) => renderDecl({kind: 'interface', name: d.name, props: d.props})).join('\n');
    const errors = typecheckSource(`${formatPreambleFor(norm)}${decls}\ntype __FuzzRoot = ${renderType(norm.root)};\n`);
    if (errors.length > 0) {
      report.skippedInvalidTypes++;
      return;
    }
  } catch {
    // fall through — keep the violation
  }
  report.violations.push({seed, message, fixture});
}

async function runBatch(baseSeed: number, iterations: number): Promise<Report> {
  const report: Report = {runs: 0, violations: [], skippedInvalidTypes: 0};
  const holder = new ClientHolder();
  try {
    for (let i = 0; i < iterations; i++) {
      await runOne(holder, mixSeed(baseSeed, 'jsonschema', i), report);
    }
  } finally {
    holder.close();
  }
  return report;
}

async function runForDuration(baseSeed: number, ms: number, onViolation: (v: Violation) => void): Promise<Report> {
  const report: Report = {runs: 0, violations: [], skippedInvalidTypes: 0};
  const holder = new ClientHolder();
  const deadline = Date.now() + ms;
  try {
    for (let i = 0; Date.now() < deadline; i++) {
      const before = report.violations.length;
      await runOne(holder, mixSeed(baseSeed, 'jsonschema', i), report);
      for (const v of report.violations.slice(before)) onViolation(v);
    }
  } finally {
    holder.close();
  }
  return report;
}

function formatViolations(report: Report): string {
  const summary = report.violations
    .slice(0, 10)
    .map((v) => `  seed=${v.seed}: ${v.message}\n----- fixture -----\n${v.fixture}\n-------------------`)
    .join('\n');
  return (
    `${report.violations.length} translation violation(s) over ${report.runs} generated types:\n${summary}` +
    (report.violations.length > 10 ? `\n  …and ${report.violations.length - 10} more` : '')
  );
}

describe('fuzz / json-schema translation — FromJsonSchema converges with type-first over the expressible subset', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'finds no id divergence across a batch of normalized generated types',
    async () => {
      const report = await runBatch(0x5eeded, 100);
      if (report.violations.length > 0) throw new Error(formatViolations(report));
      expect(report.runs).toBe(100);
    },
    240_000
  );

  // Autonomous soak: opt-in via RT_FUZZ_JSONSCHEMA_SOAK_MS=<ms>.
  const soakMs = Number(process.env.RT_FUZZ_JSONSCHEMA_SOAK_MS ?? 0);
  it.runIf(soakMs > 0)(
    'soak — translate generated types continuously and log all findings',
    async () => {
      const report = await runForDuration(Number(process.env.RT_FUZZ_SEED ?? 1), soakMs, (v) => {
        console.error(`[jsonschema-fuzz] seed=${v.seed}: ${v.message}`);
      });
      console.error(
        `[jsonschema-fuzz] soak finished: ${report.runs} types, ${report.violations.length} violation(s), ${report.skippedInvalidTypes} invalid-TS false positive(s) filtered`
      );
      expect(report.violations).toHaveLength(0);
    },
    soakMs + 60_000
  );
});
