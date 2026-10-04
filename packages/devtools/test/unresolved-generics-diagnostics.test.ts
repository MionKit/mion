// End-to-end acceptance for the unresolved-generics rejection model — drives
// the Go binary over inline sources and verifies the marker scanner's four
// behaviors (the typeid-walk depth-backstop addendum):
//
//   marker-self-instantiating-generic — a self-instantiating generic (Iter<T>.map(): Iter<U>) hits the
//            structural-id depth backstop and is named, deterministically (no
//            crash), instead of overflowing the stack.
//   marker-unresolved-type-parameter — a free type parameter CONTAINED in a data position (A<T>, T[],
//            {a: T} in a generic body) is rejected with Related pointing at the
//            parameter's declaration.
//   marker-generic-missing-type-argument — a generic written WITHOUT its required (default-less) type
//            arguments (getRunTypeId<A2>()) is rejected, with Related at the
//            default-less parameter.
//   defaults — a defaulted generic used bare resolves clean (checker applies
//            defaults at use sites); both marker call shapes converge on one id.
//
// (Marker coverage rule: marker-self-instantiating-generic/marker-unresolved-type-parameter are each pinned in BOTH call shapes, and
// the defaults fixture pins static + value-first converging on one entry.)
import {describe, expect, it} from 'vitest';
import {Family, Severity, type Diagnostic} from '../src/core/protocol.ts';
import {hasBinary, withInlineSources} from './helpers/inline.ts';

function markerDiagsOf(response: {diagnostics?: Diagnostic[]}): Diagnostic[] {
  return (response.diagnostics ?? []).filter((d) => d.family === Family.Marker);
}
function ofCode(response: {diagnostics?: Diagnostic[]}, code: string): Diagnostic[] {
  return markerDiagsOf(response).filter((d) => d.code === code);
}

describe('@mionjs/devtools / unresolved-generics diagnostics', () => {
  const register = hasBinary() ? it : it.skip;

  // --- marker-self-instantiating-generic: self-instantiating generic (depth backstop, classified) ----

  register('errors with marker-self-instantiating-generic for a self-instantiating generic (static form)', async () => {
    const sources = {
      'spiral.ts': `import {getRunTypeId} from '@mionjs/run-types';
interface Iter<T> { map<U>(fn: (x: T) => U): Iter<U>; }
export const id = getRunTypeId<Iter<string>>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      const diagnostics = ofCode(response, 'marker-self-instantiating-generic');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(Severity.Error);
      // Args name the self-instantiating type so the message can point at it.
      expect(diagnostics[0].args).toEqual(['Iter']);
      // No injection site — the type can't resolve to an id.
      expect(response.sites.length).toBe(0);
    });
  });

  register('errors with marker-self-instantiating-generic for a self-instantiating generic (value-first form)', async () => {
    const sources = {
      'spiral-value.ts': `import {getRunTypeId} from '@mionjs/run-types';
interface Iter<T> { map<U>(fn: (x: T) => U): Iter<U>; }
declare const it: Iter<string>;
export const id = getRunTypeId(it);
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      const diagnostics = ofCode(response, 'marker-self-instantiating-generic');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].args).toEqual(['Iter']);
    });
  });

  // --- marker-unresolved-type-parameter: contained free type parameter ------------------------------

  register('errors with marker-unresolved-type-parameter for a free type parameter contained in the type argument', async () => {
    const sources = {
      'contained.ts': `import {getRunTypeId} from '@mionjs/run-types';
interface A<PropA> { a: PropA }
export function wrap<T>() {
  return getRunTypeId<A<T>>();
}
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      const diagnostics = ofCode(response, 'marker-unresolved-type-parameter');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(Severity.Error);
      expect(diagnostics[0].args).toEqual(['T']);
      // Related points at where T is declared — the "place in the chain".
      expect(diagnostics[0].related?.some((r) => r.message.includes('type parameter `T` is declared here'))).toBe(true);
      expect(diagnostics[0].related?.[0]?.startLine).toBeGreaterThan(0);
      expect(response.sites.length).toBe(0);
    });
  });

  register('errors with marker-unresolved-type-parameter for the value-first contained form', async () => {
    const sources = {
      'contained-value.ts': `import {getRunTypeId} from '@mionjs/run-types';
interface A<PropA> { a: PropA }
export function wrap<T>(value: A<T>) {
  return getRunTypeId(value);
}
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      const diagnostics = ofCode(response, 'marker-unresolved-type-parameter');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].args).toEqual(['T']);
    });
  });

  // --- marker-generic-missing-type-argument: missing required type arguments ----------------------------

  register('errors with marker-generic-missing-type-argument for a generic used without its required type argument', async () => {
    const sources = {
      'missing.ts': `import {getRunTypeId} from '@mionjs/run-types';
interface A2<S> { a: S }
export const w = getRunTypeId<A2>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      const diagnostics = ofCode(response, 'marker-generic-missing-type-argument');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(Severity.Error);
      // Args: [type, default-less parameter].
      expect(diagnostics[0].args).toEqual(['A2', 'S']);
      expect(diagnostics[0].related?.some((r) => r.message.includes('without a default'))).toBe(true);
      expect(response.sites.length).toBe(0);
    });
  });

  register(
    'errors with marker-generic-missing-type-argument for a constrained-but-default-less parameter (constraint != default)',
    async () => {
      const sources = {
        'constrained.ts': `import {getRunTypeId} from '@mionjs/run-types';
interface A<S extends string = string> { a: S }
interface B<X extends A<'hello'>> { b: X }
export const bad = getRunTypeId<B>();
export const good = getRunTypeId<B<A<'hello'>>>();
`,
      };
      await withInlineSources(sources, async ({client}) => {
        const response = await client.scanFiles(Object.keys(sources));
        const diagnostics = ofCode(response, 'marker-generic-missing-type-argument');
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].args).toEqual(['B', 'X']);
        // The explicitly-instantiated sibling still resolves to a site.
        expect(response.sites.length).toBe(1);
      });
    }
  );

  // --- Defaults resolve at use sites (must scan clean) --------------------

  register('a defaulted generic used bare resolves clean, converging with the explicit form', async () => {
    const sources = {
      'defaults.ts': `import {getRunTypeId} from '@mionjs/run-types';
interface A<S extends string = string> { a: S }
export const bare = getRunTypeId<A>();
export const explicit = getRunTypeId<A<string>>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      // No marker diagnostics at all — defaults are resolved by the checker.
      expect(markerDiagsOf(response)).toEqual([]);
      // Bare A and explicit A<string> converge on one cache entry.
      expect(response.sites.length).toBe(2);
      expect(response.sites[0].id).toBe(response.sites[1].id);
      expect(response.sites[0].id).not.toBe('');
    });
  });

  register('a generic METHOD on a concrete type is exempt and resolves clean', async () => {
    const sources = {
      'method.ts': `import {getRunTypeId} from '@mionjs/run-types';
interface Repo { name: string; find<Row>(query: string): Row[]; }
export const id = getRunTypeId<Repo>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      expect(markerDiagsOf(response)).toEqual([]);
      expect(response.sites.length).toBe(1);
      expect(response.sites[0].id).not.toBe('');
    });
  });
});
