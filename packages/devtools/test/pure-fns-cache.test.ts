// End-to-end acceptance test for the pure-fn entry modules. Drives the
// Go binary over inline sources, then verifies:
//
//   1. response.entryModules carries one `pf/<id>` module per extracted pure
//      fn, with structurally-valid tuple entries including the inline
//      `createPureFn` literal.
//   2. response.replacements swaps each fn argument for the entry module's
//      import binding (importFrom names the module) AND splices the computed id
//      into the empty trailing slot.
//   3. one pure fn reaches another by IMPORTING its id: the dependency is
//      recorded and the reference is lowered to a quoted literal in the body.
//   4. response.diagnostics (filtered to PureFn family) surfaces PFE9xxx
//      diagnostics for bad-shape calls (unresolvable dependency, an explicit id
//      that disagrees with the computed one, collisions, impure bodies).
//   5. The diagnostic wire format renders via formatTscDiagnostic into
//      VS Code's `$tsc` problem-matcher line shape.

import {describe, expect, it} from 'vitest';
import {formatTscDiagnostic} from '../src/index.ts';
import {Family, Level, Severity, type Diagnostic} from '../src/core/protocol.ts';
import {ResolverClient} from '../src/core/resolver-client.ts';
import {BARE_CWD, BIN, hasBinary, withInlineSources, evalEntryModules, MARKER_PACKAGE_OVERLAY} from './helpers/inline.ts';

function pureFnDiagsOf(response: {diagnostics?: Diagnostic[]}): Diagnostic[] {
  return (response.diagnostics ?? []).filter((d) => d.family === Family.PureFn);
}

interface PureFnEntry {
  id: string;
  bodyHash: string;
  paramNames: string[];
  code: string;
  pureFnDependencies: string[];
  createPureFn: unknown;
  fn: unknown;
}

interface Replacement {
  start: number;
  end: number;
  text: string;
  importFrom?: string;
}

// evalPureFnEntries evaluates every entry module, picks the pure-fn-kind
// tuples (slot 0 === 2), and keys them by the id the tuple registers under.
// Tuple tail (slot 3+): id, bodyHash, paramNames, code, pureFnDependencies,
// createPureFn — mirrors the pure-fn tuple in the marker package.
function evalPureFnEntries(entryModules: Record<string, string>): Record<string, PureFnEntry> {
  const registered: Record<string, PureFnEntry> = {};
  for (const tuple of Object.values(evalEntryModules(entryModules))) {
    if (!Array.isArray(tuple) || tuple[0] !== 2) continue;
    registered[tuple[3] as string] = {
      id: tuple[3] as string,
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

// applyReplacements applies every byte-range replacement to the source. Sorted
// by descending start so a higher-offset edit never shifts a lower-offset one
// (all offsets index the ORIGINAL bytes).
function applyReplacements(source: string, reps: Replacement[]): string {
  let buf = Buffer.from(source, 'utf8');
  for (const rep of [...reps].sort((a, b) => b.start - a.start)) {
    buf = Buffer.concat([buf.subarray(0, rep.start), Buffer.from(rep.text, 'utf8'), buf.subarray(rep.end)]);
  }
  return buf.toString('utf8');
}

// fnAndIdReplacements splits a response's replacements into the fn-argument
// rewrite (importFrom set) and the id splice (a point insertion, no importFrom).
function fnAndIdReplacements(reps: Replacement[]): {fn?: Replacement; id?: Replacement} {
  let fn: Replacement | undefined;
  let id: Replacement | undefined;
  for (const rep of reps) {
    if (rep.importFrom) fn = rep;
    else if (rep.start === rep.end) id = rep;
  }
  return {fn, id};
}

describe('@mionjs/devtools / pure-fns virtual module', () => {
  const register = hasBinary() ? it : it.skip;

  register('emits pureFns entries with structurally-valid metadata', async () => {
    const sources = {
      'pure.ts': `import {registerPureFnFactory} from '@mionjs/run-types';
export const asJSONString = registerPureFnFactory(function () {
  return function _stringify(s: string): string {
    return JSON.stringify(s);
  };
});
export const safeKey = registerPureFnFactory(function () {
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
      // The id is where the registration lives: the file (no package.json above
      // these inline sources) plus the name it is bound to.
      expect(Object.keys(pureFns).sort()).toEqual(['pure#asJSONString', 'pure#safeKey']);

      const asJSON = pureFns['pure#asJSONString'];
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

  register('swaps the fn argument for the entry binding and splices the computed id', async () => {
    const sources = {
      'src.ts': `import {registerPureFnFactory} from '@mionjs/run-types';
export const foo = registerPureFnFactory(function () {
  return function _f(x: number) { return x + 1; };
});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      const reps = (response.replacements ?? []) as Replacement[];
      const {fn, id} = fnAndIdReplacements(reps);
      expect(fn, 'fn-arg rewrite').toBeTruthy();
      expect(fn!.text).toBe('__rt_pf$2Fsrc$2Ffoo');
      expect(fn!.importFrom).toBe('rtmod:/pf/src/foo.js');
      expect(fn!.end).toBeGreaterThan(fn!.start);
      expect(id, 'id splice').toBeTruthy();
      // The injected id is EXACTLY the id the entry registers under.
      const entryIds = Object.keys(evalPureFnEntries(response.entryModules!));
      expect(entryIds).toEqual(['src#foo']);
      expect(id!.text).toBe(", 'src#foo'");
      // Applying both replacements yields the fully-injected call.
      expect(applyReplacements(sources['src.ts'], reps)).toContain("registerPureFnFactory(__rt_pf$2Fsrc$2Ffoo, 'src#foo')");
    });
  });

  register('a registration bound to no name is identified by its body, and equal bodies collapse', async () => {
    const sources = {
      'anon.ts': `import {registerPureFn} from '@mionjs/run-types';
export const pair = [
  registerPureFn(function _id(n: number): number { return n; }),
  registerPureFn(function _id(n: number): number { return n; }),
];
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      expect(pureFnDiagsOf(response)).toEqual([]);
      const ids = Object.keys(evalPureFnEntries(response.entryModules!));
      // Equal bodies → ONE entry, named by the body hash.
      expect(ids.length).toBe(1);
      expect(ids[0]).toMatch(/^anon#[A-Za-z0-9_-]{14}$/);
      // Both call sites are still rewritten, each with its own id splice.
      const idSplices = ((response.replacements ?? []) as Replacement[]).filter(
        (rep) => !rep.importFrom && rep.start === rep.end
      );
      expect(idSplices.length).toBe(2);
      expect(idSplices[0].text).toBe(idSplices[1].text);
    });
  });

  register('records a dependency from an IMPORTED id and lowers it to a literal', async () => {
    const sources = {
      'dep.ts': `import {registerPureFn} from '@mionjs/run-types';
export const trim = registerPureFn((s: string): string => s.trim());
`,
      'consumer.ts': `import {registerPureFnFactory, type RTUtils} from '@mionjs/run-types';
import {trim} from './dep.ts';
export const trimTwice = registerPureFnFactory(function (utl: RTUtils) {
  const once = utl.getPureFn(trim);
  return function _f(s: string) { return once(once(s)); };
});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      expect(pureFnDiagsOf(response)).toEqual([]);
      const pureFns = evalPureFnEntries(response.entryModules!);
      const consumer = pureFns['consumer#trimTwice'];
      expect(consumer, `no consumer entry in ${Object.keys(pureFns).join(', ')}`).toBeDefined();
      expect(consumer.pureFnDependencies).toEqual(['dep#trim']);
      // The imported binding is LOWERED: the shipped body holds the literal, so
      // it closes over nothing.
      expect(consumer.code).toContain(`getPureFn('dep#trim')`);
      expect(consumer.code).not.toContain('getPureFn(trim)');
    });
  });

  register('emits PFE9013 for a lookup argument that names no pure fn', async () => {
    const sources = {
      'bad-dep.ts': `import {registerPureFnFactory, type RTUtils} from '@mionjs/run-types';
export const x = registerPureFnFactory(function (utl: RTUtils) {
  return function _f(key: any, value: any) { return utl.getPureFn(key)(value); };
});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      expect(pureFnDiagsOf(response).map((d) => d.code)).toContain('PFE9013');
    });
  });

  register('emits PFE9014 when a written id disagrees with the computed one', async () => {
    const sources = {
      'wrong-id.ts': `import {registerPureFn} from '@mionjs/run-types';
export const halve = registerPureFn((n: number): number => n / 2, 'wrong-id#somethingElse');
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      const mismatch = pureFnDiagsOf(response).find((d) => d.code === 'PFE9014');
      expect(mismatch, `expected PFE9014 in ${JSON.stringify(pureFnDiagsOf(response))}`).toBeDefined();
      expect(mismatch!.args).toEqual(['wrong-id#somethingElse', 'wrong-id#halve']);
      // No entry: registering one body under two ids is what the code prevents.
      expect(Object.keys(evalPureFnEntries(response.entryModules ?? {}))).toEqual([]);
    });
  });

  register('emits PFN001 for non-inline factory reference (was PFE9003 pre-marker-migration)', async () => {
    const sources = {
      'bad-fn.ts': `import {registerPureFnFactory} from '@mionjs/run-types';
declare const externalFn: (utl: unknown) => () => void;
export const x = registerPureFnFactory(externalFn);
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      // PureFunctionFactory<F> brand on the factory param emits PFN001 from
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
      'exp.ts': `import {registerPureFnFactory} from '@mionjs/run-types';
export const factory = () => function v(x: number) { return x; };
export const cpf = registerPureFnFactory(factory);
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
      'use.ts': `import {registerPureFnFactory} from '@mionjs/run-types';
import {factory} from './lib';
export const cpf = registerPureFnFactory(factory);
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(['use.ts'], {includeEntryModules: true});
      const markerCodes = (response.diagnostics ?? []).filter((d) => d.family === Family.Marker).map((d) => d.code);
      expect(markerCodes).toContain('PFN002');
    });
  });

  register('emits PFE9004 collision diagnostic for one id with two bodies', async () => {
    // Two block scopes, one file, one binding name: the id is the same and the
    // bodies are not, which is the whole shape PFE9004 exists for.
    const sources = {
      'collide.ts': `import {registerPureFnFactory} from '@mionjs/run-types';
{
  const collideFn = registerPureFnFactory(function () {
    return function v1() { return 1; };
  });
  void collideFn;
}
{
  const collideFn = registerPureFnFactory(function () {
    return function v2() { return 2; };
  });
  void collideFn;
}
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      const collisions = pureFnDiagsOf(response).filter((d) => d.code === 'PFE9004');
      expect(collisions.length).toBe(1);

      const collision = collisions[0];
      expect(collision.related?.length).toBe(1);
      expect(collision.related?.[0].startLine).not.toBe(collision.site.startLine);
      // Args carry the colliding id — the catalog template substitutes
      // it into the headline ("Duplicate registerPureFnFactory for `X`…").
      expect(collision.args).toEqual(['collide#collideFn']);

      // Entry module still loads, with the first-occurrence winner.
      const pureFns = evalPureFnEntries(response.entryModules!);
      expect(pureFns['collide#collideFn']).toBeDefined();
    });
  });

  register('emits PFE9010 (forbidden identifier) for eval inside a factory body', async () => {
    const sources = {
      'impure.ts': `import {registerPureFnFactory} from '@mionjs/run-types';
export const evilFn = registerPureFnFactory(function () {
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
      'closure.ts': `import {registerPureFnFactory} from '@mionjs/run-types';
const PRECISION = 0.001;
export const rounder = registerPureFnFactory(function () {
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
      level: Level.RuntimeError,
      args: ['@acme/text/src/slug#slugify'],
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
    expect(line).toContain('@acme/text/src/slug#slugify');
    // VS Code's built-in $tsc problem matcher regex:
    expect(line).toMatch(/^[^(]+\(\d+,\d+\):\s+(error|warning)\s+[A-Z]+\d+:\s+.+$/);
  });

  // --- emitMode gating of pure-fn tuples (code | functions | both) ----------
  //
  // The default shared client runs in `both` mode; these spin up one-shot
  // clients per mode to prove purefunctions.CollectEntries gates the pure-fn
  // tuple's `code` and `createPureFn` slots end to end through the real binary
  // — for BOTH a user pure fn (registerPureFnFactory) and a table-served
  // built-in (findCycle, demanded by a circular createValidateFn).
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
    'pf.ts': `import {registerPureFnFactory} from '@mionjs/run-types';
export const answer = registerPureFnFactory(function () {
  return function _answer(): number { return 42; };
});
`,
  };
  // An ARMED (`{rejectCircularRefs: true}`) validator over a self-referential
  // type demands the built-in circular walker findCycle by body reference
  // (the inline guard calls it), served from the built-in table — the same
  // CollectEntries gating path as a user pure fn. A plain (unarmed) cyclable
  // validate ships no walker at all (the compile-time-option model).
  const CIRCULAR_VALIDATE = {
    'circ.ts': `import {createValidateFn} from '@mionjs/run-types';
interface Node { next?: Node; val: number; }
export const isNode = createValidateFn<Node>(undefined, {rejectCircularRefs: true});
`,
  };
  const FIND_CYCLE_ID = '@mionjs/run-types/src/runtypes/circular-pure-fns#findCycle';

  async function pureFnEntry(client: ResolverClient, file: string, id: string): Promise<PureFnEntry> {
    const response = await client.scanFiles([file], {includeEntryModules: true});
    const entry = evalPureFnEntries(response.entryModules!)[id];
    if (!entry) throw new Error(`no pure-fn entry ${id} in ${Object.keys(response.entryModules ?? {}).join(', ')}`);
    return entry;
  }

  register('code mode: user pure fn ships the code string, drops createPureFn, and reconstructs a working fn', async () => {
    await withEmitMode('code', USER_PURE_FN, async (client) => {
      const entry = await pureFnEntry(client, 'pf.ts', 'pf#answer');
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
      const entry = await pureFnEntry(client, 'pf.ts', 'pf#answer');
      expect(entry.code).toBeUndefined(); // code holed out in place
      expect(typeof entry.createPureFn).toBe('function');
      const inner = (entry.createPureFn as (utl: unknown) => () => number)({});
      expect(inner()).toBe(42);
    });
  });

  register('both mode: user pure fn ships BOTH the code string and the live closure', async () => {
    await withEmitMode('both', USER_PURE_FN, async (client) => {
      const entry = await pureFnEntry(client, 'pf.ts', 'pf#answer');
      expect(typeof entry.code).toBe('string');
      expect(typeof entry.createPureFn).toBe('function');
    });
  });

  register('table-served built-in findCycle honors code mode (string, no live closure)', async () => {
    await withEmitMode('code', CIRCULAR_VALIDATE, async (client) => {
      const entry = await pureFnEntry(client, 'circ.ts', FIND_CYCLE_ID);
      expect(typeof entry.code).toBe('string');
      expect(entry.createPureFn).toBeUndefined();
    });
  });

  register('table-served built-in findCycle honors functions mode (live closure, no string)', async () => {
    await withEmitMode('functions', CIRCULAR_VALIDATE, async (client) => {
      const entry = await pureFnEntry(client, 'circ.ts', FIND_CYCLE_ID);
      expect(entry.code).toBeUndefined();
      expect(typeof entry.createPureFn).toBe('function');
    });
  });

  register('formatTscDiagnostic includes Related sites on continuation lines', () => {
    const line = formatTscDiagnostic({
      code: 'PFE9004',
      family: Family.PureFn,
      severity: Severity.Error,
      level: Level.RuntimeError,
      args: ['app/src/fns#fn'],
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
