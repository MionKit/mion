// End-to-end acceptance test for marker-scanner diagnostics. Drives the
// Go binary over inline sources, verifying:
//
//   1. response.diagnostics surfaces an MKR001 warning when a marker
//      call's reflect-form value argument is a function-call expression
//      (`createValidateFn(getX())`).
//   2. The diagnostic message names the called function and recommends
//      the static `ReturnType<typeof fn>` idiom.
//   3. Legitimate identifier-argument shapes (`createValidateFn(v)`) do NOT
//      trigger the warning.
//   4. The diagnostic wire format renders via formatTscDiagnostic into
//      VS Code's `$tsc` problem-matcher line shape.
//   5. The site is still emitted alongside the diagnostic — the
//      validator works; the warning just nudges the user toward the
//      anti-pattern-free idiom.

import {describe, expect, it} from 'vitest';
import {formatTscDiagnostic} from '../src/index.ts';
import {Family, Severity, type Diagnostic} from '../src/protocol.ts';
import {hasBinary, withInlineSources} from './helpers/inline.ts';

function markerDiagsOf(response: {diagnostics?: Diagnostic[]}): Diagnostic[] {
  return (response.diagnostics ?? []).filter((d) => d.family === Family.Marker);
}

describe('@ts-runtypes/devtools / marker diagnostics', () => {
  const register = hasBinary() ? it : it.skip;

  register('warns when reflect-form arg is a function call (createValidateFn)', async () => {
    const sources = {
      'fn-call.ts': `import {createValidateFn} from '@ts-runtypes/core';
function makeUser(): {id: number; name: string} {
  return {id: 1, name: 'john'};
}
export const _ = createValidateFn(makeUser());
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      const diagnostics = markerDiagsOf(response);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].code).toBe('MKR001');
      expect(diagnostics[0].severity).toBe(Severity.Warning);
      // Args carry the dynamic identifier (function name); the catalog
      // template substitutes it into the headline and detail.
      expect(diagnostics[0].args).toEqual(['makeUser']);
      // Site still emitted — the validator works, the warning just nudges.
      expect(response.sites.length).toBe(1);
    });
  });

  register('warns for getRunTypeId with a function-call arg too', async () => {
    const sources = {
      'reflect-fn.ts': `import {getRunTypeId} from '@ts-runtypes/core';
function getValue(): string { return 'hello'; }
export const _ = getRunTypeId(getValue());
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      const diagnostics = markerDiagsOf(response);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].args).toEqual(['getValue']);
    });
  });

  register('warns for method-call arg (PropertyAccess → CallExpression)', async () => {
    const sources = {
      'method-call.ts': `import {createValidateFn} from '@ts-runtypes/core';
const state = {
  makeUser(): {id: number} { return {id: 1}; },
};
export const _ = createValidateFn(state.makeUser());
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      const diagnostics = markerDiagsOf(response);
      expect(diagnostics).toHaveLength(1);
      // The callee is a property access — diagnostic uses the leaf name.
      expect(diagnostics[0].args).toEqual(['makeUser']);
    });
  });

  register('no warning for identifier arg', async () => {
    const sources = {
      'identifier.ts': `import {createValidateFn} from '@ts-runtypes/core';
const user: {id: number; name: string} = {id: 1, name: 'john'};
export const _ = createValidateFn(user);
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      expect(markerDiagsOf(response)).toEqual([]);
    });
  });

  register('no warning for property-access arg', async () => {
    const sources = {
      'property.ts': `import {createValidateFn} from '@ts-runtypes/core';
const outer: {user: {id: number}} = {user: {id: 1}};
export const _ = createValidateFn(outer.user);
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      expect(markerDiagsOf(response)).toEqual([]);
    });
  });

  register('no warning for static form even when paired with a call', async () => {
    const sources = {
      'static-return.ts': `import {createValidateFn} from '@ts-runtypes/core';
function makeUser(): {id: number} { return {id: 1}; }
export const _ = createValidateFn<ReturnType<typeof makeUser>>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      expect(markerDiagsOf(response)).toEqual([]);
    });
  });

  register('errors with MKR003 when marker call is inside a generic wrapper', async () => {
    const sources = {
      'free-tparam.ts': `import {getRunTypeId} from '@ts-runtypes/core';
export function makeId<T>() {
  return getRunTypeId<T>();
}
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      const diagnostics = markerDiagsOf(response);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].code).toBe('MKR003');
      // Error severity (not Warning): if the generic wrapper is ever
      // called, getRunTypeId() throws at runtime ("no id injected"). The
      // build halts so the user fixes the structural issue before
      // shipping the wrapper.
      expect(diagnostics[0].severity).toBe(Severity.Error);
      // MKR003 currently has no dynamic args — the catalog headline
      // names the issue ("generic function ... unresolved") generically.
      expect(diagnostics[0].args).toBeUndefined();
      // No site emitted — the marker can't be injected without a resolved T.
      // The user gets the build-time MKR003 + the runtime "no id injected"
      // throw when the wrapper is actually called.
      expect(response.sites.length).toBe(0);
    });
  });

  register('does NOT emit MKR003 when a wrapper forwards its handle (pass-through)', async () => {
    // Regression: the documented wrapper pattern resolves its injected handle by
    // FORWARDING it to a public resolver as the trailing arg. That inner call has
    // its id slot filled, so it is a pass-through — the build must leave it
    // untouched and must NOT flag the wrapper's free T as an unresolved injection
    // (MKR003). Only the OUTER concrete-T call is an injection site.
    const sources = {
      'forward.ts': `import {getRunTypeId, type InjectRunTypeId} from '@ts-runtypes/core';
export function describeType<T>(id?: InjectRunTypeId<T>): InjectRunTypeId<T> {
  return getRunTypeId<T>(undefined, id);
}
export const d = describeType<{a: number}>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      const mkr003 = markerDiagsOf(response).filter((d) => d.code === 'MKR003');
      expect(mkr003).toEqual([]);
      // Only the outer describeType<{a: number}>() call is an injection site.
      expect(response.sites.length).toBe(1);
    });
  });

  register('accepts an InjectTypeFnArgs marker with more than three DISTINCT families', async () => {
    // The historical alias capped at three fn keys; a wrapper (mion's route())
    // may name more. Four distinct families must scan clean and inject one
    // handle per family, in declaration order.
    const sources = {
      'four-fn.ts': `import type {InjectTypeFnArgs} from '@ts-runtypes/core';
type Handler = (ctx: unknown, ...rest: any[]) => unknown;
function route<H extends Handler>(handler: H, fns?: InjectTypeFnArgs<Parameters<H>, 'verr', 'huk', 'suk', 'uke'>) {
  return {handler, fns};
}
export const r = route((ctx: unknown, name: string) => name.length);
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      // No duplicate-family error; the four-family marker is a valid site.
      expect(markerDiagsOf(response).filter((d) => d.code === 'MKR006')).toEqual([]);
      expect(response.sites.length).toBe(1);
      // One injected handle per named family — four, in declaration order.
      expect(response.sites[0].fnIds?.length).toBe(4);
    });
  });

  register('errors with MKR006 when an InjectTypeFnArgs marker repeats a family', async () => {
    const sources = {
      'dup-fn.ts': `import type {InjectTypeFnArgs} from '@ts-runtypes/core';
type Handler = (ctx: unknown, ...rest: any[]) => unknown;
function route<H extends Handler>(handler: H, fns?: InjectTypeFnArgs<Parameters<H>, 'huk', 'verr', 'jsonDecoder', 'verr'>) {
  return {handler, fns};
}
export const r = route((ctx: unknown, name: string) => name.length);
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      const diagnostics = markerDiagsOf(response).filter((d) => d.code === 'MKR006');
      expect(diagnostics).toHaveLength(1);
      // Error severity: a repeated family is almost always a copy-paste slip,
      // so the build halts rather than injecting a redundant handle silently.
      expect(diagnostics[0].severity).toBe(Severity.Error);
      // Args carry the FIRST REPEATED family ('verr'), NOT the first key 'huk' —
      // pins first-repeated-key reporting rather than first-key.
      expect(diagnostics[0].args).toEqual(['verr']);
      // The site is still emitted with the duplicate removed (huk, verr,
      // jsonDecoder) — the injection stays sane even though the Error halts.
      expect(response.sites.length).toBe(1);
      expect(response.sites[0].fnIds?.length).toBe(3);
    });
  });

  register('formatTscDiagnostic renders marker warnings in tsc line format', async () => {
    const sources = {
      'fmt.ts': `import {createValidateFn} from '@ts-runtypes/core';
function makeUser(): {id: number} { return {id: 1}; }
export const _ = createValidateFn(makeUser());
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      const diagnostic = markerDiagsOf(response)[0];
      expect(diagnostic).toBeDefined();
      const line = formatTscDiagnostic(diagnostic);
      // VS Code's $tsc problem matcher expects: path(line,col): severity code: msg
      expect(line).toMatch(/^[^(]+\(\d+,\d+\):\s+warning\s+MKR001:\s+.+$/);
    });
  });
});
