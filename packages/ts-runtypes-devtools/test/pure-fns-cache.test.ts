// End-to-end acceptance test for the pure-fn entry modules. Drives the
// Go binary over inline sources, then verifies:
//
//   1. response.entryModules carries one `pf/<ns>/<fn>` module per
//      extracted pure fn, with structurally-valid tuple entries
//      including the inline `createPureFn` literal.
//   2. response.replacements swaps each factory argument for the entry
//      module's import binding (importFrom names the module).
//   3. response.diagnostics (filtered to PureFn family) surfaces PFE9xxx
//      diagnostics for bad-shape calls (non-literal args, body-hash
//      collisions, etc.).
//   4. The diagnostic wire format renders via formatTscDiagnostic into
//      VS Code's `$tsc` problem-matcher line shape.

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {formatTscDiagnostic} from '../src/index.ts';
import {Family, Severity, type Diagnostic} from '../src/protocol.ts';
import {ResolverClient} from '../src/resolver-client.ts';
import {BARE_CWD, BIN, hasBinary, withInlineSources, evalEntryModules, MARKER_PACKAGE_OVERLAY} from './helpers/inline.ts';

function pureFnDiagsOf(response: {diagnostics?: Diagnostic[]}): Diagnostic[] {
  return (response.diagnostics ?? []).filter((d) => d.family === Family.PureFn);
}

interface PureFnEntry {
  namespace: string;
  fnName: string;
  bodyHash: string;
  paramNames: string[];
  code: string;
  pureFnDependencies: string[];
  createPureFn: unknown;
  fn: unknown;
}

// evalPureFnEntries evaluates every entry module, picks the pure-fn-kind
// tuples (slot 0 === 2), and builds the flat cache the pre-migration
// `initCache` consumer produced (`{ 'ns::name': CompiledPureFunction-ish }`).
// Tuple tail (slot 3+): key, bodyHash, paramNames, code, pureFnDependencies,
// createPureFn — mirrors registerPureFnTuple in the marker package.
function evalPureFnEntries(entryModules: Record<string, string>): Record<string, PureFnEntry> {
  const registered: Record<string, PureFnEntry> = {};
  for (const tuple of Object.values(evalEntryModules(entryModules))) {
    if (!Array.isArray(tuple) || tuple[0] !== 2) continue;
    const key = tuple[3] as string;
    const sep = key.indexOf('::');
    registered[key] = {
      namespace: sep >= 0 ? key.slice(0, sep) : '',
      fnName: sep >= 0 ? key.slice(sep + 2) : key,
      bodyHash: tuple[4] as string,
      paramNames: tuple[5] as string[],
      code: tuple[6] as string,
      pureFnDependencies: tuple[7] as string[],
      createPureFn: tuple[8],
      fn: undefined,
    };
  }
  return registered;
}

describe('@ts-runtypes/devtools / pure-fns virtual module', () => {
  const register = hasBinary() ? it : it.skip;

  register('emits pureFns entries with structurally-valid metadata', async () => {
    const sources = {
      'pure.ts': `import {registerPureFnFactory} from '@ts-runtypes/core';
export const a = registerPureFnFactory('rt::asJSONString', function () {
  return function _stringify(s: string): string {
    return JSON.stringify(s);
  };
});
export const b = registerPureFnFactory('rt::safeKey', function () {
  return function _safe(value: any): any {
    return value;
  };
});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      expect(response.entryModules).toBeDefined();
      expect(pureFnDiagsOf(response)).toEqual([]);

      const pureFns = evalPureFnEntries(response.entryModules!);
      expect(Object.keys(pureFns).sort()).toEqual(['rt::asJSONString', 'rt::safeKey']);

      const asJSON = pureFns['rt::asJSONString'];
      expect(asJSON.namespace).toBe('rt');
      expect(asJSON.fnName).toBe('asJSONString');
      expect(asJSON.bodyHash).toMatch(/^[A-Za-z0-9_-]{14}$/);
      expect(asJSON.paramNames).toEqual([]);
      // Body must be JS-stripped — no `: string` annotation should remain.
      expect(asJSON.code).not.toContain(': string');
      expect(asJSON.code).toContain('return JSON.stringify');
      // Dependencies array is always present (empty when no deps).
      expect(asJSON.pureFnDependencies).toEqual([]);
      // createPureFn is a function — the cache module IS the canonical
      // runtime home of the body.
      expect(typeof asJSON.createPureFn).toBe('function');
      // Calling it with a utl stub yields the actual pure function.
      const inner = (asJSON.createPureFn as (utl: unknown) => (s: string) => string)({});
      expect(typeof inner).toBe('function');
      expect(inner('hi')).toBe('"hi"');
    });
  });

  register('emits Replacement entries that swap each factory argument for the entry binding', async () => {
    const sources = {
      'src.ts': `import {registerPureFnFactory} from '@ts-runtypes/core';
export const _ = registerPureFnFactory('rt::foo', function () {
  return function _f(x: number) { return x + 1; };
});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      const reps = response.replacements ?? [];
      expect(reps.length).toBe(1);
      expect(reps[0].text).toBe('__rt_pf$2Frt$2Ffoo');
      expect(reps[0].importFrom).toBe('rtmod:/pf/rt/foo.js');
      expect(reps[0].end).toBeGreaterThan(reps[0].start);
      // Verify the rewrite produces a syntactically clean binding-swapped
      // call form when applied to the source.
      const buf = Buffer.from(sources['src.ts'], 'utf8');
      const after = Buffer.concat([
        buf.subarray(0, reps[0].start),
        Buffer.from(reps[0].text, 'utf8'),
        buf.subarray(reps[0].end),
      ]).toString('utf8');
      expect(after).toContain("registerPureFnFactory('rt::foo',__rt_pf$2Frt$2Ffoo)");
    });
  });

  register('extracts pureFnDependencies statically from utl.getPureFn calls', async () => {
    const sources = {
      'deps.ts': `import {registerPureFnFactory, type RTUtils} from '@ts-runtypes/core';
export const _ = registerPureFnFactory('rt::consumer', function (utl: RTUtils) {
  return function _f(x: any) {
    return utl.getPureFn('rt::dep')(x);
  };
});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      const pureFns = evalPureFnEntries(response.entryModules!);
      expect(pureFns['rt::consumer'].pureFnDependencies).toEqual(['rt::dep']);
    });
  });

  register('emits CTA001 for non-literal id (was PFE9001 pre-marker-migration)', async () => {
    const sources = {
      'bad-ns.ts': `import {registerPureFnFactory} from '@ts-runtypes/core';
declare function getId(): string;
export const x = registerPureFnFactory(getId(), function () { return function() {}; });
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      // CompTimeArgs<string> brand on the id param fires a CTA0xx
      // diagnostic from the marker layer (resolver.scanCall) — the exact
      // sub-code depends on the failure mode (CTA001 non-literal, CTA003
      // function-call construct). The walker silently skips extraction.
      const ctaSeen = (response.diagnostics ?? [])
        .filter((d) => d.family === Family.Marker)
        .some((d) => d.code.startsWith('CTA'));
      expect(ctaSeen).toBe(true);
      // No purefn-family shape diagnostic — PFE9001 was retired.
      expect(pureFnDiagsOf(response).map((d) => d.code)).not.toContain('PFE9001');
    });
  });

  register('emits PFN001 for non-inline factory reference (was PFE9003 pre-marker-migration)', async () => {
    const sources = {
      'bad-fn.ts': `import {registerPureFnFactory} from '@ts-runtypes/core';
declare const externalFn: (utl: unknown) => () => void;
export const x = registerPureFnFactory('rt::fn', externalFn);
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      // PureFunction<F> brand on the factory param emits PFN001 from
      // the marker layer when the arg isn't an inline arrow/function
      // expression (or const-bound binding to one).
      const markerCodes = (response.diagnostics ?? []).filter((d) => d.family === Family.Marker).map((d) => d.code);
      expect(markerCodes).toContain('PFN001');
      // No purefn-family shape diagnostic — PFE9003 was retired.
      expect(pureFnDiagsOf(response).map((d) => d.code)).not.toContain('PFE9003');
    });
  });

  register('emits PFN002 for an EXPORTED pure-fn factory (external handle)', async () => {
    // A pure-fn literal must have no external handle — the build AOT-compiles it,
    // so the original must not be reachable as a value. An exported factory is.
    const sources = {
      'exp.ts': `import {registerPureFnFactory} from '@ts-runtypes/core';
export const factory = () => function v(x: number) { return x; };
export const cpf = registerPureFnFactory('rt::exportedFn', factory);
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      const markerCodes = (response.diagnostics ?? []).filter((d) => d.family === Family.Marker).map((d) => d.code);
      expect(markerCodes).toContain('PFN002');
      expect(markerCodes).not.toContain('PFN001');
    });
  });

  register('emits PFN002 for an IMPORTED pure-fn factory (external handle)', async () => {
    const sources = {
      'lib.ts': `export const factory = () => function v(x: number) { return x; };`,
      'use.ts': `import {registerPureFnFactory} from '@ts-runtypes/core';
import {factory} from './lib';
export const cpf = registerPureFnFactory('rt::importedFn', factory);
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(['use.ts'], {includeEntryModules: true});
      const markerCodes = (response.diagnostics ?? []).filter((d) => d.family === Family.Marker).map((d) => d.code);
      expect(markerCodes).toContain('PFN002');
    });
  });

  register('emits PFE9004 collision diagnostic for mismatched bodies', async () => {
    const sources = {
      'a.ts': `import {registerPureFnFactory} from '@ts-runtypes/core';
export const a = registerPureFnFactory('rt::collideFn', function () {
  return function v1() { return 1; };
});
`,
      'b.ts': `import {registerPureFnFactory} from '@ts-runtypes/core';
export const b = registerPureFnFactory('rt::collideFn', function () {
  return function v2() { return 2; };
});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      const collisions = pureFnDiagsOf(response).filter((d) => d.code === 'PFE9004');
      expect(collisions.length).toBe(1);

      const collision = collisions[0];
      expect(collision.related?.length).toBe(1);
      expect(collision.related?.[0].filePath).not.toBe(collision.site.filePath);
      // Args carry the colliding key — the catalog template substitutes
      // it into the headline ("Duplicate registerPureFnFactory for `X`…").
      expect(collision.args).toEqual(['rt::collideFn']);

      // Entry module still loads, with the first-occurrence winner.
      const pureFns = evalPureFnEntries(response.entryModules!);
      expect(pureFns['rt::collideFn']).toBeDefined();
    });
  });

  register('emits PFE9010 (forbidden identifier) for eval inside a factory body', async () => {
    const sources = {
      'impure.ts': `import {registerPureFnFactory} from '@ts-runtypes/core';
export const x = registerPureFnFactory('rt::evilFn', function () {
  return function _evil() {
    return eval('1+1');
  };
});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      const diags = pureFnDiagsOf(response);
      const evalDiag = diags.find((d) => d.code === 'PFE9010' && d.args?.[0] === 'eval');
      expect(evalDiag).toBeDefined();
      // Ensure the formatted line matches the $tsc problem-matcher regex
      // — VS Code parses build-task output through that pattern.
      const line = formatTscDiagnostic(evalDiag!);
      expect(line).toMatch(/^[^(]+\(\d+,\d+\):\s+error\s+PFE9010:/);
    });
  });

  register('emits PFE9011 (closure variable) for module-level const captured by factory', async () => {
    // The whole point of the source-rewrite-to-null design: closure
    // captures must blow up at scan time, since the cached fn body
    // can't see anything outside its own scope.
    const sources = {
      'closure.ts': `import {registerPureFnFactory} from '@ts-runtypes/core';
const PRECISION = 0.001;
export const x = registerPureFnFactory('rt::rounder', function () {
  return function _round(n: number) {
    return Math.round(n / PRECISION) * PRECISION;
  };
});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      const diags = pureFnDiagsOf(response);
      const closureDiag = diags.find((d) => d.code === 'PFE9011' && d.args?.[0] === 'PRECISION');
      expect(closureDiag).toBeDefined();
    });
  });

  register('formatTscDiagnostic renders the canonical $tsc problem-matcher line', () => {
    const line = formatTscDiagnostic({
      code: 'PFE9004',
      family: Family.PureFn,
      severity: Severity.Error,
      args: ['rt::collideFn'],
      site: {
        filePath: '/abs/path/x.ts',
        startLine: 12,
        startCol: 5,
        endLine: 12,
        endCol: 9,
      },
    });
    // Headline text comes from the JS catalog; we don't pin the exact
    // copy here (catalog wording can evolve). Just confirm the line
    // shape: <path>(<line>,<col>): <severity> <code>: <headline-with-arg>
    expect(line).toMatch(/^\/abs\/path\/x\.ts\(12,5\): error PFE9004: /);
    expect(line).toContain('rt::collideFn');
    // VS Code's built-in $tsc problem matcher regex:
    expect(line).toMatch(/^[^(]+\(\d+,\d+\):\s+(error|warning)\s+[A-Z]+\d+:\s+.+$/);
  });

  // --- emitMode gating of pure-fn tuples (code | functions | both) ----------
  //
  // The default shared client runs in `both` mode; these spin up one-shot
  // clients per mode to prove purefunctions.CollectEntries gates the pure-fn
  // tuple's `code` and `createPureFn` slots end to end through the real binary
  // — for BOTH a user pure fn (registerPureFnFactory) and a table-served
  // built-in (rt::findCycle, demanded by a circular createValidateFn).
  async function withEmitMode<T>(
    emitMode: 'code' | 'functions' | 'both',
    sources: Record<string, string>,
    fn: (client: ResolverClient) => Promise<T>
  ): Promise<T> {
    const client = new ResolverClient(BIN, BARE_CWD, '', {serverMode: true, emitMode});
    try {
      await client.setSources({...MARKER_PACKAGE_OVERLAY, ...sources});
      return await fn(client);
    } finally {
      client.close();
    }
  }

  const USER_PURE_FN = {
    'pf.ts': `import {registerPureFnFactory} from '@ts-runtypes/core';
export const a = registerPureFnFactory('app::answer', function () {
  return function _answer(): number { return 42; };
});
`,
  };
  // An ARMED (`{rejectCircularRefs: true}`) validator over a self-referential
  // type demands the built-in circular walker rt::findCycle by body reference
  // (the inline guard calls it), served from the built-in table — the same
  // CollectEntries gating path as a user pure fn. A plain (unarmed) cyclable
  // validate ships no walker at all (the compile-time-option model).
  const CIRCULAR_VALIDATE = {
    'circ.ts': `import {createValidateFn} from '@ts-runtypes/core';
interface Node { next?: Node; val: number; }
export const isNode = createValidateFn<Node>(undefined, {rejectCircularRefs: true});
`,
  };

  async function pureFnEntry(client: ResolverClient, file: string, key: string): Promise<PureFnEntry> {
    const response = await client.scanFiles([file], {includeEntryModules: true});
    const entry = evalPureFnEntries(response.entryModules!)[key];
    if (!entry) throw new Error(`no pure-fn entry ${key} in ${Object.keys(response.entryModules ?? {}).join(', ')}`);
    return entry;
  }

  register('code mode: user pure fn ships the code string, drops createPureFn, and reconstructs a working fn', async () => {
    await withEmitMode('code', USER_PURE_FN, async (client) => {
      const entry = await pureFnEntry(client, 'pf.ts', 'app::answer');
      expect(typeof entry.code).toBe('string');
      expect(entry.code).toContain('return 42');
      expect(entry.createPureFn).toBeUndefined(); // trailing hole trimmed
      // The code slot alone rebuilds the factory (what initPureFunction does).
      const factory = new Function(...entry.paramNames, entry.code) as (utl: unknown) => () => number;
      expect(factory({})()).toBe(42);
    });
  });

  register('functions mode: user pure fn ships the live closure, drops the code string', async () => {
    await withEmitMode('functions', USER_PURE_FN, async (client) => {
      const entry = await pureFnEntry(client, 'pf.ts', 'app::answer');
      expect(entry.code).toBeUndefined(); // code holed out in place
      expect(typeof entry.createPureFn).toBe('function');
      const inner = (entry.createPureFn as (utl: unknown) => () => number)({});
      expect(inner()).toBe(42);
    });
  });

  register('both mode: user pure fn ships BOTH the code string and the live closure', async () => {
    await withEmitMode('both', USER_PURE_FN, async (client) => {
      const entry = await pureFnEntry(client, 'pf.ts', 'app::answer');
      expect(typeof entry.code).toBe('string');
      expect(typeof entry.createPureFn).toBe('function');
    });
  });

  register('table-served built-in rt::findCycle honors code mode (string, no live closure)', async () => {
    await withEmitMode('code', CIRCULAR_VALIDATE, async (client) => {
      const entry = await pureFnEntry(client, 'circ.ts', 'rt::findCycle');
      expect(typeof entry.code).toBe('string');
      expect(entry.createPureFn).toBeUndefined();
    });
  });

  register('table-served built-in rt::findCycle honors functions mode (live closure, no string)', async () => {
    await withEmitMode('functions', CIRCULAR_VALIDATE, async (client) => {
      const entry = await pureFnEntry(client, 'circ.ts', 'rt::findCycle');
      expect(entry.code).toBeUndefined();
      expect(typeof entry.createPureFn).toBe('function');
    });
  });

  register('formatTscDiagnostic includes Related sites on continuation lines', () => {
    const line = formatTscDiagnostic({
      code: 'PFE9004',
      family: Family.PureFn,
      severity: Severity.Error,
      args: ['rt::fn'],
      site: {
        filePath: '/abs/b.ts',
        startLine: 5,
        startCol: 1,
        endLine: 5,
        endCol: 30,
      },
      related: [
        {
          filePath: '/abs/a.ts',
          startLine: 3,
          startCol: 1,
          endLine: 3,
          endCol: 30,
          message: 'First registered here with bodyHash=abc1234567890_',
        },
      ],
    });
    expect(line).toContain('/abs/b.ts(5,1): error PFE9004:');
    expect(line).toContain('Related: /abs/a.ts(3,1): First registered here with bodyHash=abc1234567890_');
  });
});
