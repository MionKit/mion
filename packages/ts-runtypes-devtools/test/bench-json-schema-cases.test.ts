// Contract tests for the benchmark suite's JSON_SCHEMA group.
//
// The group used to be a SUITE of its own, which gave it a dedicated page that
// asked "which library can consume a schema document" — a question only ajv and
// RunTypes could answer, so every other column read not-supported, and 7 of its
// 10 cases were plain shapes the other groups already bench in every dialect.
// It is now a GROUP inside the two suites that bench it (structural keywords in
// validation, value constraints in format-validation), and each competitor
// states the same constraint in its own dialect.
//
// Nothing else in CI checks any of this: `container/benchmarks` is never
// type-checked (see docs/todos/benchmark-competitor-maps-never-typechecked.md)
// and the suites only run inside the podman image. A key that silently vanishes
// from a competitor map reads as an absent column on the website, not an error,
// which is exactly the failure these tests exist to catch.

import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve, dirname, join} from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const competitorsDir = join(repoRoot, 'container/benchmarks/competitors');

type Loaded = {
  key: string;
  suite: string;
  group: string;
  name: string;
  hasSchema: boolean;
  valid: number;
  invalid: number;
};

// The shared cases are loaded in a SUBPROCESS (Node strips the types natively)
// rather than imported. Importing them would pull `container/benchmarks` into
// this package's tsconfig, and that tree is deliberately outside every
// tsconfig in the repo — its DateTime groups reference the Temporal global,
// which only the benchmark image's compiler options provide.
function loadCases(): {cases: Loaded[]; documentKeys: string[]} {
  const script = `
    import {iterateCases} from './container/benchmarks/shared/cases/index.ts';
    import {JSON_SCHEMA} from './container/benchmarks/shared/cases/json-schema/index.ts';
    const cases = iterateCases().map((entry) => {
      const samples = entry.case.getSamples();
      return {
        key: entry.key, suite: entry.suite, group: entry.group, name: entry.name,
        hasSchema: Boolean(entry.case.schema),
        valid: samples.valid.length, invalid: samples.invalid.length,
      };
    });
    console.log(JSON.stringify({cases, documentKeys: Object.keys(JSON_SCHEMA)}));
  `;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {cwd: repoRoot, encoding: 'utf8'});
  if (run.status !== 0) throw new Error(`failed to load shared cases: ${run.stderr}`);
  return JSON.parse(run.stdout);
}

const {cases: all, documentKeys} = loadCases();
const jsonSchemaCases = all.filter((entry) => entry.group === 'JSON_SCHEMA');

// The seven shapes that moved out: each is already benched by another group in
// every dialect, so keeping them here was a duplicate comparison.
const DROPPED = [
  'string_array',
  'tuple_pair',
  'object_simple',
  'record_number',
  'union_anyof',
  'recursive_tree',
  'realworld_user',
];

describe('JSON_SCHEMA is a group in two suites, not a suite of its own', () => {
  it('no case reports the retired json-schema suite', () => {
    expect(all.filter((entry) => entry.suite === 'json-schema')).toEqual([]);
  });

  it('both benching suites carry a JSON_SCHEMA group', () => {
    const suites = new Set(jsonSchemaCases.map((entry) => entry.suite));
    expect(suites).toEqual(new Set(['validation', 'format-validation']));
  });

  it('every case key is unique across the two halves', () => {
    const keys = all.map((entry) => entry.key);
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
  });

  it('the duplicated shape cases are gone', () => {
    const names = jsonSchemaCases.map((entry) => entry.name);
    expect(names.filter((name) => DROPPED.includes(name))).toEqual([]);
  });
});

describe('every JSON_SCHEMA case is benchable', () => {
  it.each(jsonSchemaCases.map((entry) => [entry.key, entry] as const))(
    '%s carries a document and both sample sides',
    (_key, entry) => {
      // The document is what makes the case a JSON Schema case: ajv compiles these
      // very bytes, and the typecost document columns read the same map.
      expect(entry.hasSchema, 'case must carry its draft 2020-12 document').toBe(true);
      // A case with no invalid samples would let a validator that returns true for
      // everything score as aligned.
      expect(entry.valid, 'needs valid samples').toBeGreaterThan(0);
      expect(entry.invalid, 'needs invalid samples').toBeGreaterThan(0);
    }
  );

  it('the merged document map matches the cases exactly', () => {
    expect([...documentKeys].sort()).toEqual(jsonSchemaCases.map((entry) => entry.name).sort());
  });
});

// Each competitor map is a TOTAL map over the shared keys: a supported case
// builds a validator, everything else is the NOT_SUPPORTED sentinel. Read as
// text rather than imported, because the competitor modules import their own
// library (zod, typia, …) which lives only inside the benchmark image.
describe('every competitor map covers the whole group', () => {
  const COMPETITORS = ['ajv', 'zod', 'typebox', 'typia', 'ts-runtypes'];
  const keys = jsonSchemaCases.map((entry) => entry.key);

  it.each(COMPETITORS)('%s declares every JSON_SCHEMA key', (competitor) => {
    const source = readFileSync(join(competitorsDir, competitor, 'cases.ts'), 'utf8');
    expect(keys.filter((key) => !source.includes(`'${key}'`))).toEqual([]);
  });

  it.each(COMPETITORS)('%s declares no retired JSON_SCHEMA key', (competitor) => {
    const source = readFileSync(join(competitorsDir, competitor, 'cases.ts'), 'utf8');
    expect(DROPPED.filter((name) => source.includes(`'JSON_SCHEMA.${name}'`))).toEqual([]);
  });

  // The value-first builders are NOT a second door onto a schema document: there
  // is no runtypes-to-JSON-Schema transform, so a builder that describes the
  // same shape is a stand-in invented for the bench. It shipped as a real
  // ts-runtypes column next to the actual jsonSchema one, which read as two
  // measured doors where there is one.
  it('the value-first map claims no JSON_SCHEMA case', () => {
    const source = readFileSync(join(competitorsDir, 'ts-runtypes/schemaCases.ts'), 'utf8');
    for (const key of keys) {
      const line = source.split('\n').find((text) => text.includes(`'${key}'`));
      expect(line, `${key} must be declared`).toBeTruthy();
      expect(line, `${key} must opt out`).toContain('NOT_SUPPORTED');
    }
  });
});

// The two typecost DOCUMENT maps answer "what does recovering a type from this
// document cost the checker". They used to cover the 10 cases of the old
// json-schema lane and read n-a everywhere else, which made the columns look
// like a niche rather than the whole comparison. They are now total, and their
// supported set mirrors ajv's: ajv is the validation suite's JSON Schema
// reference, so what it can state as a document is what these columns must
// answer. The maps are generated from ajv's and committed, so this test is what
// keeps the mirror true after a hand edit.
describe('the typecost document maps mirror ajv', () => {
  // `'KEY': NOT_SUPPORTED` vs `'KEY': <anything else>`, read off the source.
  function declaredKeys(file: string): {supported: Set<string>; unsupported: Set<string>} {
    const source = readFileSync(join(competitorsDir, file), 'utf8');
    const supported = new Set<string>();
    const unsupported = new Set<string>();
    for (const match of source.matchAll(/^ {2}'([A-Z_]+\.[A-Za-z_0-9]+)':\s*(.*)$/gm)) {
      (match[2].startsWith('NOT_SUPPORTED') ? unsupported : supported).add(match[1]);
    }
    return {supported, unsupported};
  }

  const ajv = declaredKeys('ajv/cases.ts');
  const allKeys = all.map((entry) => entry.key);
  const MAPS = ['ts-runtypes/jsonSchemaCases.ts', 'json-schema-to-ts/cases.ts'];

  it('ajv itself still declares every shared case', () => {
    const declared = new Set([...ajv.supported, ...ajv.unsupported]);
    expect(allKeys.filter((key) => !declared.has(key))).toEqual([]);
  });

  it.each(MAPS)('%s is total over every shared case', (file) => {
    const {supported, unsupported} = declaredKeys(file);
    const declared = new Set([...supported, ...unsupported]);
    expect(
      allKeys.filter((key) => !declared.has(key)),
      'missing keys'
    ).toEqual([]);
    expect(
      [...declared].filter((key) => !allKeys.includes(key)),
      'stale keys'
    ).toEqual([]);
  });

  it.each(MAPS)('%s opts out of exactly what ajv opts out of', (file) => {
    const {supported, unsupported} = declaredKeys(file);
    // A case ajv states as a document but this map skips is lost coverage; the
    // reverse claims a document for something JSON Schema cannot express.
    expect(
      [...ajv.unsupported].filter((key) => supported.has(key)),
      'claimed but ajv cannot'
    ).toEqual([]);
    expect(
      [...ajv.supported].filter((key) => unsupported.has(key)),
      'skipped but ajv can'
    ).toEqual([]);
  });
});
