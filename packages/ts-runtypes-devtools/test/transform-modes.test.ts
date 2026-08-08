// Transform wire modes — parity + the source-consistency guard.
//
// 'edits' mode ships the raw edit list for the FE to apply; 'go' mode ships the
// fully rewritten file + map. The load-bearing gate is that the two produce
// BYTE-IDENTICAL code and source maps — that is what lets 'edits' be the
// default. The guard tests pin the detect-and-recover behaviour when the
// bundler-supplied source drifts from the resolver's bytes.
import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ResolverClient} from '../src/resolver-client.ts';
import {applyEdits, sourceHash} from '../src/apply-edits.ts';
import type {SourceMap} from '../src/protocol.ts';
import {BARE_CWD, BIN, hasBinary, MARKER_PACKAGE_OVERLAY, runTest, withInlineSources} from './helpers/inline.ts';
import {MODULE_MODE_ALL_SINGLE} from '../src/go-generated/runtypes-constants.generated.ts';

const register = hasBinary() ? it : it.skip;

// assertModeParity runs `file` through BOTH modes on `client` and asserts the
// applied-edits output matches the full-transform output exactly — code AND
// every source-map field. Also asserts the happy-path guard (resolver hash ==
// FE hash) since the server-mode overlay IS the inline source.
async function assertModeParity(client: ResolverClient, file: string, source: string) {
  const go = await client.transform([file]);
  const goFile = go.transformed[file];
  expect(goFile, `'go' mode produced no result for ${file}`).toBeDefined();
  expect(typeof goFile.code).toBe('string');

  const ed = await client.transform([file], {emitEdits: true});
  const edFile = ed.transformed[file];
  expect(edFile, `'edits' mode produced no result for ${file}`).toBeDefined();
  // Happy path: no drift, so no re-sync would fire in the plugin.
  expect(edFile.sourceHash).toBe(sourceHash(source));

  const applied = applyEdits(file, source, edFile.importBlock ?? '', edFile.edits ?? []);

  expect(applied.code).toBe(goFile.code);
  const goMap = goFile.map as SourceMap;
  expect(applied.map.mappings).toBe(goMap.mappings);
  expect(applied.map.version).toBe(goMap.version);
  expect(applied.map.sources).toEqual(goMap.sources);
  expect(applied.map.sourcesContent).toEqual(goMap.sourcesContent);
  return {sites: ed.sites, applied};
}

describe('@ts-runtypes/devtools / transform modes / parity', () => {
  // Marker rule: BOTH call shapes.
  runTest(
    'static getRunTypeId<T>(): edits mode reproduces go mode byte-for-byte',
    {
      'user.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type User = {id: number; name: string};
getRunTypeId<User>();
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const {applied} = await assertModeParity(client, 'user.ts', sources['user.ts']);
        expect(applied.code).toMatch(/getRunTypeId<User>\(undefined, __rt_[A-Za-z0-9]+\);/);
      });
    }
  );

  runTest(
    'reflect getRunTypeId(value): edits mode reproduces go mode byte-for-byte',
    {
      'user-reflect.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type User = {id: number; name: string};
const u = {id: 1, name: 'm'} as User;
getRunTypeId(u);
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const {applied} = await assertModeParity(client, 'user-reflect.ts', sources['user-reflect.ts']);
        expect(applied.code).toMatch(/getRunTypeId\(u, __rt_[A-Za-z0-9]+\);/);
      });
    }
  );

  // Regression (two marker calls with the same typeid in one statement):
  // a marker call passed as an argument to an unrelated GENERIC function whose
  // parameter INFERS the branded marker type must still inject — in BOTH wire
  // modes. Real-world trigger: vitest's
  // `expect(getRunTypeId<T>()).toBe(getRunTypeId<T>())`, where
  // `Assertion<U>.toBe(expected: U)` instantiates `expected` to `InjectRunTypeId<T>`;
  // the scanner used to treat `.toBe` as an enclosing marker and drop BOTH inner
  // injections. `wrap<U>` is the minimal stand-in for that generic-method chain.
  runTest(
    'generic passer-through keeps both marker injections (edits==go)',
    {
      'passthrough.ts': `import {getRunTypeId} from '@ts-runtypes/core';
declare function wrap<U>(actual: U): {toBe(expected: U): void};
type Q = {q: number};
export const x = wrap(getRunTypeId<Q>()).toBe(getRunTypeId<Q>());
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const {sites, applied} = await assertModeParity(client, 'passthrough.ts', sources['passthrough.ts']);
        // BOTH calls inject (the bug dropped one or both).
        expect(sites).toHaveLength(2);
        const injected = applied.code.match(/getRunTypeId<Q>\(undefined, __rt_[A-Za-z0-9]+\)/g) ?? [];
        expect(injected).toHaveLength(2);
      });
    }
  );

  // Multi-function marker (fnIds): array of bindings at one slot.
  runTest(
    'multi-fn createStandardSchema: edits mode reproduces go mode byte-for-byte',
    {
      'std.ts': `import {createStandardSchema} from '@ts-runtypes/core';
createStandardSchema<string>();
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const {sites, applied} = await assertModeParity(client, 'std.ts', sources['std.ts']);
        expect(sites[0].fnIds).toHaveLength(2);
        expect(applied.code).toMatch(/createStandardSchema<string>\(undefined, undefined, \[__rt_[^\]]+\]\);/);
      });
    }
  );

  // Trailing-comma splice (no doubled comma).
  runTest(
    'trailing comma: edits mode reproduces go mode byte-for-byte',
    {
      'trailing.ts': `import {createValidateFn} from '@ts-runtypes/core';
const user: {id: number; name: string} = {id: 1, name: 'john'};
export const isUser = createValidateFn(
  user,
);
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const {applied} = await assertModeParity(client, 'trailing.ts', sources['trailing.ts']);
        expect(applied.code).not.toMatch(/,\s*,/);
      });
    }
  );

  // Armed circular-guard variant: the injected fnHash forks (`{rejectCircularRefs:
  // true}`), and the emitted body carries the inline guard + baked skeleton. Both
  // wire modes must reproduce that rewrite byte-for-byte. Marker rule: both call
  // shapes.
  runTest(
    'armed rejectCircularRefs (static): edits mode reproduces go mode byte-for-byte',
    {
      'armed.ts': `import {createValidateFn} from '@ts-runtypes/core';
interface Node {name: string; next?: Node}
export const isNode = createValidateFn<Node>(undefined, {rejectCircularRefs: true});
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const {applied} = await assertModeParity(client, 'armed.ts', sources['armed.ts']);
        expect(applied.code).toMatch(/createValidateFn<Node>\(undefined, \{rejectCircularRefs: true\}, __rt_[A-Za-z0-9_]+\)/);
      });
    }
  );

  runTest(
    'armed rejectCircularRefs (reflection): edits mode reproduces go mode byte-for-byte',
    {
      'armed-reflect.ts': `import {createValidateFn} from '@ts-runtypes/core';
interface Node {name: string; next?: Node}
const inference: Node = {name: 'a'};
export const isNode = createValidateFn(inference, {rejectCircularRefs: true});
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        await assertModeParity(client, 'armed-reflect.ts', sources['armed-reflect.ts']);
      });
    }
  );

  // Pure-fn Replacement (a span edit, not a point insertion).
  runTest(
    'pure-fn replacement: edits mode reproduces go mode byte-for-byte',
    {
      'pure.ts': `import {registerPureFnFactory} from '@ts-runtypes/core';
export const _ = registerPureFnFactory('rt::foo', function () {
  return function _f(x: number) { return x + 1; };
});
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const {applied} = await assertModeParity(client, 'pure.ts', sources['pure.ts']);
        // The factory arg is replaced by the entry-module binding.
        expect(applied.code).toContain("registerPureFnFactory('rt::foo',__rt_pf");
      });
    }
  );

  // Multibyte / astral source: the byte->UTF-16 offset conversion happens on the
  // Go side, so the FE indexes the JS string with the shipped char offsets. Any
  // conflation would splice the binding mid-identifier — parity would break.
  runTest(
    'multibyte source: edits offsets are UTF-16 code units, parity holds',
    {
      'mb.ts': `import {getRunTypeId} from '@ts-runtypes/core';
// preamble with multibyte chars — em-dash and 🦄 emoji — before the site
type User = {id: number; name: string};
getRunTypeId<User>();
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const {applied} = await assertModeParity(client, 'mb.ts', sources['mb.ts']);
        expect(applied.code).toContain('— em-dash and 🦄 emoji —');
        expect(applied.code).toMatch(/getRunTypeId<User>\(undefined, __rt_[A-Za-z0-9]+\);/);
      });
    }
  );

  // moduleMode: allSingle — the binding imports from the bundle (Site.Module).
  // Both modes read the same buildImportBlock, so parity must hold there too.
  register('allSingle bundle targeting: edits mode reproduces go mode byte-for-byte', async () => {
    const source = `import {getRunTypeId} from '@ts-runtypes/core';
type User = {id: number; name: string};
export const staticId = getRunTypeId<User>();
`;
    const client = new ResolverClient(BIN, BARE_CWD, '', {serverMode: true, moduleMode: MODULE_MODE_ALL_SINGLE});
    try {
      await client.setSources({...MARKER_PACKAGE_OVERLAY, 'user.ts': source});
      const {sites, applied} = await assertModeParity(client, 'user.ts', source);
      // The bundle-stamped site imports from the runtypes bundle, not its own module.
      expect(sites[0].module).toBeTruthy();
      expect(applied.code).toContain(`from 'rtmod:/${sites[0].module}.js'`);
    } finally {
      client.close();
    }
  });
});

describe('@ts-runtypes/devtools / transform modes / source-consistency guard', () => {
  runTest(
    'source drift is detectable, and a re-sync applies edits to the drifted source correctly',
    {
      'guard.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type Guard = {id: number};
getRunTypeId<Guard>();
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const original = sources['guard.ts'];

        // Happy path: the resolver's hash matches the FE hash of the same source.
        const ed = await client.transform(['guard.ts'], {emitEdits: true});
        const first = ed.transformed['guard.ts'];
        expect(first.sourceHash).toBe(sourceHash(original));

        // An upstream pre-plugin prepends a line: the bundler-supplied code no
        // longer matches the resolver's bytes, and the guard MUST notice.
        const drifted = '// injected by an upstream pre-plugin\n' + original;
        expect(first.sourceHash).not.toBe(sourceHash(drifted));

        // Recovery (what the plugin does on mismatch): re-upload the source and
        // re-request. Now the resolver's hash matches the drifted code, and the
        // fresh edits land correctly when applied to the drifted source.
        await client.setSources({...MARKER_PACKAGE_OVERLAY, 'guard.ts': drifted});
        const ed2 = await client.transform(['guard.ts'], {emitEdits: true});
        const second = ed2.transformed['guard.ts'];
        expect(second.sourceHash).toBe(sourceHash(drifted));

        const applied = applyEdits('guard.ts', drifted, second.importBlock ?? '', second.edits ?? []);
        expect(applied.code).toContain('// injected by an upstream pre-plugin');
        expect(applied.code).toMatch(/getRunTypeId<Guard>\(undefined, __rt_[A-Za-z0-9]+\);/);
      });
    }
  );

  // FNV-1a/32 cross-language vectors: the FE hasher MUST agree with the Go
  // SourceHash (internal/compiler/sourcerewrite/edits_test.go pins the same set).
  register('sourceHash matches the Go FNV-1a/32 vectors', () => {
    expect(sourceHash('')).toBe('811c9dc5');
    expect(sourceHash('a')).toBe('e40c292c');
    expect(sourceHash('foobar')).toBe('bf9cf968');
  });

  // 'go' mode also returns a sourceHash so the plugin can DETECT (and warn on)
  // an upstream pre-plugin's drift, even though it can't recover in 'go' mode.
  runTest(
    "'go' mode returns a sourceHash so drift is detectable",
    {
      'go-drift.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type GoDrift = {id: number};
getRunTypeId<GoDrift>();
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const go = (await client.transform(['go-drift.ts'])).transformed['go-drift.ts'];
        expect(typeof go.code).toBe('string'); // 'go' still returns full code
        expect(go.sourceHash).toBe(sourceHash(sources['go-drift.ts']));
      });
    }
  );
});

describe('@ts-runtypes/devtools / transform modes / go-mode sourcesContent trim', () => {
  runTest(
    'omitSourcesContent drops the embedded source but keeps identical mappings',
    {
      'sc.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type SC = {id: number};
getRunTypeId<SC>();
`,
    },
    async (sources) => {
      // The trim is SESSION config now (--omit-sources-content), so this is a
      // two-CLIENT A/B rather than two calls on one client: the shared worker
      // client keeps self-contained maps, and a one-shot client spawned with
      // the flag produces the trimmed twin.
      await withInlineSources(sources, async ({client, sources: augmented}) => {
        const withContent = (await client.transform(['sc.ts'])).transformed['sc.ts'];

        const trimmed = new ResolverClient(BIN, BARE_CWD, '', {
          serverMode: true,
          emitMode: 'both',
          omitSourcesContent: true,
        });
        let withoutContent;
        try {
          await trimmed.setSources({...MARKER_PACKAGE_OVERLAY, ...augmented});
          withoutContent = (await trimmed.transform(['sc.ts'])).transformed['sc.ts'];
        } finally {
          trimmed.close();
        }

        const a = withContent.map as SourceMap;
        const b = withoutContent.map as SourceMap;
        // Same code, same mappings — only the embedded original source is gone.
        expect(withoutContent.code).toBe(withContent.code);
        expect(b.mappings).toBe(a.mappings);
        expect(a.sourcesContent[0]).toBe(sources['sc.ts']);
        expect(b.sourcesContent[0]).toBeNull();
      });
    }
  );
});
