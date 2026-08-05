// Unit pins for the suite pipeline script (scripts/core/gen-json-schema-suite.mjs):
// the partition helpers, the deterministic JSON→TS printer, and a golden
// snapshot of one emitted module over the mini-suite fixture. No network, no
// tsc probes — the triage map here is handwritten; probe correctness is
// exercised by the real pipeline (triage.json is committed and the lane runs
// against it).

import {describe, expect, it} from 'vitest';
import {fileURLToPath} from 'node:url';
import {
  emitModule,
  hasProtoKey,
  isRemoteGroup,
  loadSuiteFile,
  moduleRelPath,
  printTsValue,
  probeSnippet,
  type TriageVerdict,
} from '../../../../scripts/core/gen-json-schema-suite.mjs';

const FIXTURE = fileURLToPath(new URL('./fixtures/mini-suite.json', import.meta.url));
const SHA = 'cc73f5fa64c3b0d11f6c277db4edc22938994b54';

const TRIAGE: Record<string, TriageVerdict> = {
  'mini.json :: a bounded string': {verdict: 'ok'},
  'mini.json :: a remote ref': {verdict: 'remote'},
  'mini.json :: properties whose names are hazardous in literals': {verdict: 'proto-literal'},
  'mini.json :: an unknown keyword': {verdict: 'unsupported-input', reason: "TS2353: 'unknownKeyword' does not exist"},
  'mini.json :: a quarantined shape': {verdict: 'ok'},
};

describe('gen-json-schema-suite — partition helpers', () => {
  it('flags remote groups by their localhost:1234 reference', () => {
    const groups = loadSuiteFile('mini.json', FIXTURE);
    expect(groups.map(isRemoteGroup)).toEqual([false, true, false, false, false]);
  });

  it('flags __proto__ keys anywhere in the schema or the case data', () => {
    const groups = loadSuiteFile('mini.json', FIXTURE);
    const flagged = groups.map((g) => hasProtoKey(g.schema) || g.tests.some((t) => hasProtoKey(t.data)));
    expect(flagged).toEqual([false, false, true, false, false]);
    // The hazardous value must come from JSON.parse: a __proto__ key in a JS
    // object literal here would SET the prototype instead of defining an own
    // property — the exact trap the classifier exists to keep out of the
    // generated literals.
    expect(hasProtoKey(JSON.parse('{"nested": [{"deep": {"__proto__": 1}}]}'))).toBe(true);
    expect(hasProtoKey({proto: 1, __proto2__: []})).toBe(false);
  });

  it('maps suite labels to module paths', () => {
    expect(moduleRelPath('allOf.json')).toBe('draft2020-12/allOf.ts');
    expect(moduleRelPath('optional/format/date-time.json')).toBe('draft2020-12/optional-format/date-time.ts');
  });
});

describe('gen-json-schema-suite — JSON→TS printer', () => {
  it('prints scalars, keys and nesting deterministically', () => {
    expect(printTsValue({type: 'string', 'min-length': 2})).toBe(`{type: "string", "min-length": 2}`);
    expect(printTsValue([1, 'two', null, true])).toBe(`[1, "two", null, true]`);
    expect(printTsValue({})).toBe('{}');
    expect(printTsValue([])).toBe('[]');
  });

  it('keeps -0 (JSON.stringify would drop the sign)', () => {
    expect(printTsValue(-0)).toBe('-0');
    expect(printTsValue(0)).toBe('0');
    expect(printTsValue([0, -0])).toBe('[0, -0]');
  });

  it('escapes strings through JSON semantics', () => {
    expect(printTsValue('a"b\\c\nd')).toBe(JSON.stringify('a"b\\c\nd'));
  });

  it('probe snippets are one static call site over an as-const schema', () => {
    expect(probeSnippet({type: 'null'})).toContain(`const s = {type: "null"} as const;`);
    expect(probeSnippet(true)).toContain('const s = true as const;');
  });
});

describe('gen-json-schema-suite — emitted module', () => {
  const emit = () =>
    emitModule(
      'mini.json',
      loadSuiteFile('mini.json', FIXTURE),
      TRIAGE,
      {'mini.json :: a quarantined shape': {reason: 'MKR009 halts the module'}},
      SHA,
      '../harness.ts'
    );

  it('is deterministic (same inputs, byte-identical output)', () => {
    expect(emit()).toBe(emit());
  });

  it('emits ok groups as as-const call sites and everything else data-only', () => {
    expect(emit()).toMatchSnapshot();
  });
});
