import {describe, expect} from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {ReflectionKind, type RunType} from '../src/protocol.ts';
import {
  BIN,
  runTest,
  withInlineSources,
  MARKER_PACKAGE_OVERLAY,
  evalEntryModules,
  instantiateRunTypes,
  rewrite,
} from './helpers/inline.ts';
import {decodeMappings} from './helpers/sourcemap.ts';

function findMember(types: RunType[], root: RunType, name: string): RunType | undefined {
  for (const ref of root.children ?? []) {
    const m = types.find((x) => x.id === ref.id);
    if (m && m.name === name) return m;
  }
  return undefined;
}

describe('@ts-runtypes/devtools / rewrite', () => {
  runTest(
    'F9 static: rewrites getRunTypeId<User>() to pass a hash site id',
    {
      'user.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type User = {id: number; name: string};
getRunTypeId<User>();
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const {code: out, sites} = await rewrite('user.ts', sources['user.ts'], client);

        expect(sites.length).toBe(1);
        expect(typeof sites[0].id).toBe('string');
        expect(sites[0].id).toMatch(/^[A-Za-z][A-Za-z0-9]+$/);
        // Static form has no value argument — the value slot is padded with
        // `undefined` so the injected entry-module binding lands in slot 1,
        // with the matching import at offset 0.
        expect(out).toContain(`import {__rt_${sites[0].id}} from 'rtmod:/${sites[0].id}.js';`);
        expect(out).toContain(`getRunTypeId<User>(undefined, __rt_${sites[0].id});`);
      });
    }
  );

  runTest(
    'F9 reflect: rewrites getRunTypeId(u) to pass a hash site id',
    {
      'user-reflect.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type User = {id: number; name: string};
const u = {id: 1, name: 'm'} as User;
getRunTypeId(u);
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const {code: out, sites} = await rewrite('user-reflect.ts', sources['user-reflect.ts'], client);

        expect(sites.length).toBe(1);
        expect(sites[0].id).toMatch(/^[A-Za-z][A-Za-z0-9]+$/);
        // Reflect form: `u` is arg 0, the injected binding is arg 1.
        expect(out).toContain(`import {__rt_${sites[0].id}} from 'rtmod:/${sites[0].id}.js';`);
        expect(out).toContain(`getRunTypeId(u, __rt_${sites[0].id});`);
      });
    }
  );

  runTest(
    'multi-fn marker: createStandardSchema injects an ARRAY of two entry tuples',
    {
      'std.ts': `import {createStandardSchema} from '@ts-runtypes/core';
createStandardSchema<string>();
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const {code: out, sites} = await rewrite('std.ts', sources['std.ts'], client);

        expect(sites.length).toBe(1);
        // The multi-function marker (<T,'val','verr'>) emits two fnIds; the
        // scalar fnId mirrors fnIds[0].
        expect(sites[0].fnIds).toBeDefined();
        expect(sites[0].fnIds).toHaveLength(2);
        const [valFn, verrFn] = sites[0].fnIds!;
        const id = sites[0].id;
        const valBinding = `__rt_${valFn}_${id}`;
        const verrBinding = `__rt_${verrFn}_${id}`;
        // BOTH entry modules are imported, one binding each.
        expect(out).toContain(`import {__rt_${valFn}_${id}} from 'rtmod:/${valFn}_${id}.js';`);
        expect(out).toContain(`import {__rt_${verrFn}_${id}} from 'rtmod:/${verrFn}_${id}.js';`);
        // The single trailing slot (ids @ paramIndex 2) carries an array of the
        // two bindings; the val/options slots (0,1) are `undefined`-padded.
        expect(out).toContain(`createStandardSchema<string>(undefined, undefined, [${valBinding}, ${verrBinding}]);`);
      });
    }
  );

  runTest(
    'trailing comma: value-first marker call rewrites to syntactically valid JS',
    {
      // Formatter-wrapped value-first call with a trailing comma in its OWN
      // argument list. The injected binding must NOT add a second comma after
      // the existing one — `f(user, , …)` is a syntax error.
      'trailing-comma.ts': `import {createValidateFn} from '@ts-runtypes/core';
const user: {id: number; name: string} = {id: 1, name: 'john'};
export const isUser = createValidateFn(
  user,
);
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const {code: out, sites} = await rewrite('trailing-comma.ts', sources['trailing-comma.ts'], client);

        expect(sites.length).toBe(1);
        expect(sites[0].trailingComma).toBe(true);
        // The pre-existing trailing comma must NOT be doubled — no `, ,` and no
        // empty argument anywhere in the rewritten output.
        expect(out).not.toMatch(/,\s*,/);
        // The binding lands at the close-paren position (right after the
        // existing `user,`), padded so it occupies the id slot (createValidateFn
        // is `val?, options?, id?` → one `undefined` placeholder), and the
        // closing `)` follows immediately. No leading comma is injected because
        // the source already supplies the separator.
        const binding = `__rt_${sites[0].fnId}_${sites[0].id}`;
        expect(out).toContain(`user,\nundefined, ${binding});`);
        // The injected call's argument list is well-formed: the close-paren
        // follows the binding with no empty argument before it (the bug emitted
        // `createValidateFn(user, , undefined, …)`). Strip the TypeScript type
        // annotation so the call statement parses as plain JS.
        const callJs = `const user = {id: 1, name: 'john'};\n${out.split('export const isUser = ')[1]}`;
        expect(() => new Function('createValidateFn', `${callJs.replace(binding, 'null')}`)).not.toThrow();
      });
    }
  );

  runTest(
    'F10 static: cache contains User alias with reflection-shape propertySignatures',
    {
      'user.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type User = {id: number; name: string};
getRunTypeId<User>();
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        await rewrite('user.ts', sources['user.ts'], client);
        await assertUserCacheShape(client);
      });
    }
  );

  runTest(
    'F10 reflect: cache contains User alias with reflection-shape propertySignatures',
    {
      'user-reflect.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type User = {id: number; name: string};
const u = {id: 1, name: 'm'} as User;
getRunTypeId(u);
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        await rewrite('user-reflect.ts', sources['user-reflect.ts'], client);
        await assertUserCacheShape(client);
      });
    }
  );

  async function assertUserCacheShape(client: {dump: () => Promise<{runTypes?: RunType[]}>}) {
    const dump = await client.dump();
    const runTypes = dump.runTypes ?? [];
    const user = runTypes.find((t) => t.typeName === 'User');
    expect(user).toBeDefined();
    expect(user!.kind).toBe(ReflectionKind.objectLiteral);

    const id = findMember(runTypes, user!, 'id');
    const name = findMember(runTypes, user!, 'name');
    expect(id?.kind).toBe(ReflectionKind.propertySignature);
    expect(name?.kind).toBe(ReflectionKind.propertySignature);

    const idType = runTypes.find((t) => t.id === id!.child!.id);
    const nameType = runTypes.find((t) => t.id === name!.child!.id);
    expect(idType?.kind).toBe(ReflectionKind.number);
    expect(nameType?.kind).toBe(ReflectionKind.string);
  }

  runTest(
    'F6 static: getRunTypeId<routes>() carries nested object+function shape',
    {
      'router-static.ts': `import {getRunTypeId} from '@ts-runtypes/core';
const myAPI = getRunTypeId<{sayHello: (name: string) => string}>();
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {sites} = await rewrite('router-static.ts', sources['router-static.ts'], client);
          expect(sites.length).toBeGreaterThan(0);
          await assertSayHelloRouterShape(client);
        },
        {reset: true}
      );
    }
  );

  runTest(
    'F6 reflect: getRunTypeId(routes) infers nested object+function shape',
    {
      'router-reflect.ts': `import {getRunTypeId} from '@ts-runtypes/core';
const sayHello = (name: string): string => 'Hello ' + name;
const routes = {sayHello};
const myAPI = getRunTypeId(routes);
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {sites} = await rewrite('router-reflect.ts', sources['router-reflect.ts'], client);
          expect(sites.length).toBeGreaterThan(0);
          await assertSayHelloRouterShape(client);
        },
        {reset: true}
      );
    }
  );

  async function assertSayHelloRouterShape(client: {dump: () => Promise<{runTypes?: RunType[]}>}) {
    const dump = await client.dump();
    const runTypes = dump.runTypes ?? [];
    const root = runTypes.find((t) => t.kind === ReflectionKind.objectLiteral && (t.children ?? []).length > 0);
    expect(root).toBeDefined();

    const sayHello = findMember(runTypes, root!, 'sayHello');
    expect(sayHello).toBeDefined();
    let fn: RunType | undefined = sayHello;
    if (sayHello!.kind === ReflectionKind.propertySignature) {
      fn = runTypes.find((t) => t.id === sayHello!.child!.id);
    }
    expect(fn?.parameters?.length).toBe(1);
  }

  runTest(
    'dedup static: re-resolving the same file adds no new types',
    {
      'primitive-static.ts': `import {getRunTypeId} from '@ts-runtypes/core';
const info = getRunTypeId<string>();
`,
    },
    async (sources) => {
      await assertNoNewTypesOnReResolve(sources, 'primitive-static.ts');
    }
  );

  runTest(
    'dedup reflect: re-resolving the same file adds no new types',
    {
      'primitive-reflect.ts': `import {getRunTypeId} from '@ts-runtypes/core';
const userName: string = 'mario';
const info = getRunTypeId(userName);
`,
    },
    async (sources) => {
      await assertNoNewTypesOnReResolve(sources, 'primitive-reflect.ts');
    }
  );

  async function assertNoNewTypesOnReResolve(sources: Record<string, string>, file: string) {
    await withInlineSources(sources, async ({client}) => {
      await rewrite(file, sources[file], client);
      const before = (await client.dump()).runTypes?.length ?? 0;
      await rewrite(file, sources[file], client);
      const after = (await client.dump()).runTypes?.length ?? 0;
      expect(after).toBe(before);
    });
  }
});

describe('@ts-runtypes/devtools / generated module', () => {
  runTest(
    'F17 static: rendered cache module exports a knotted reflection RunType graph',
    {
      'router-static.ts': `import {getRunTypeId} from '@ts-runtypes/core';
const myAPI = getRunTypeId<{sayHello: (name: string) => string}>();
`,
    },
    async (sources) => {
      await assertCacheModuleHasSayHelloRoot(sources, 'router-static.ts');
    }
  );

  runTest(
    'F17 reflect: rendered cache module exports a knotted reflection RunType graph',
    {
      'router-reflect.ts': `import {getRunTypeId} from '@ts-runtypes/core';
const sayHello = (name: string): string => 'Hello ' + name;
const routes = {sayHello};
const myAPI = getRunTypeId(routes);
`,
    },
    async (sources) => {
      await assertCacheModuleHasSayHelloRoot(sources, 'router-reflect.ts');
    }
  );

  async function assertCacheModuleHasSayHelloRoot(sources: Record<string, string>, file: string) {
    const entryModules = await withInlineSources(sources, async ({client}) => {
      await rewrite(file, sources[file], client);
      const dump = await client.dump();
      return dump.entryModules ?? {};
    });

    // Per-entry emitter — runtype nodes ride as rows of the single data
    // bundle (tuple slot 0 === 4; dep-less, so slot 1 is a hole); the reflection
    // root gets a facade module whose inlined deps thunk imports the bundle.
    const moduleSources = Object.values(entryModules);
    expect(moduleSources.length).toBeGreaterThan(0);
    expect(moduleSources.some((s) => /export const __rt_runtypes=\[4,,/.test(s))).toBe(true);
    expect(moduleSources.some((s) => /export const __rt_[A-Za-z0-9_$]+=\[5,\(\)=>\[/.test(s))).toBe(true);

    // Evaluate the modules the same way evalCacheFor does and instantiate
    // the runtype tuples against the stub registry.
    const tuples = evalEntryModules(entryModules);
    const registered = instantiateRunTypes(tuples);
    const entries = Object.values(registered).filter((t) => t !== null && typeof t === 'object' && 'kind' in t);
    expect(entries.length).toBeGreaterThan(0);

    const roots = entries.filter(
      (t) =>
        t.kind === ReflectionKind.objectLiteral && Array.isArray(t.children) && t.children.some((m: any) => m.name === 'sayHello')
    );
    expect(roots.length).toBeGreaterThan(0);
    const root = roots[0];
    const sayHello = root.children?.find((m: any) => m.name === 'sayHello');
    expect(sayHello).toBeDefined();
    // Every cached RunType must carry its `id` (the primary cache handle).
    for (const t of entries) {
      const id = t.id;
      expect(typeof id).toBe('string');
      expect((id ?? '').length).toBeGreaterThan(0);
    }
  }

  // CLI round-trip via spawnSync — kept as a single test (one form is
  // sufficient to verify the binary boundary). Uses runTest for the source
  // hoist + skip gate; the body short-circuits to a raw spawnSync since this
  // test bypasses the in-process ResolverClient entirely.
  runTest(
    "CLI --out-modules writes per-entry modules identical in shape to the plugin's output",
    {
      'router.ts': `import {getRunTypeId} from '@ts-runtypes/core';
const sayHello = (name: string): string => 'Hello ' + name;
const routes = {sayHello};
const myAPI = getRunTypeId(routes);
`,
    },
    async (sources) => {
      const tmpDir = path.join(__dirname, '.tmp-modules');
      const handshake = JSON.stringify({sources: {...MARKER_PACKAGE_OVERLAY, 'router.ts': sources['router.ts']}}) + '\n';
      const request = JSON.stringify({op: 'scanFiles', files: ['router.ts']}) + '\n';
      const out = spawnSync(
        BIN,
        ['serve', '--cwd', path.resolve(__dirname, '../../..'), '--sources', 'stdin', '--out-modules', tmpDir],
        {
          input: handshake + request,
        }
      );
      expect(out.status).toBe(0);
      const written = fs.readdirSync(tmpDir).filter((name) => name.endsWith('.js'));
      expect(written.length).toBeGreaterThan(0);
      const sample = fs.readFileSync(path.join(tmpDir, written[0]), 'utf8');
      expect(sample).toContain('export const __rt_');
      fs.rmSync(tmpDir, {recursive: true, force: true});
    }
  );

  // ---- multibyte sources -------------------------------------------------
  // Resolver positions are UTF-8 BYTE offsets while the EditBuffer edit
  // surface indexes UTF-16 code units. These fixtures place multibyte chars
  // (3-byte em-dash, 4-byte emoji => surrogate pair) BEFORE the call site so
  // any byte/char conflation shifts the insertion point — the binding would
  // land inside `getRunTypeId<User>()` instead of before its close-paren.

  runTest(
    'multibyte static: byte offsets convert to char indices before insertion',
    {
      'user-mb.ts': `import {getRunTypeId} from '@ts-runtypes/core';
// preamble with multibyte chars — em-dash and 🦄 emoji — before the site
type User = {id: number; name: string};
getRunTypeId<User>();
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const {code: out, sites} = await rewrite('user-mb.ts', sources['user-mb.ts'], client);

        expect(sites.length).toBe(1);
        expect(out).toContain(`getRunTypeId<User>(undefined, __rt_${sites[0].id});`);
        // The original lines must survive untouched — a byte/char skew would
        // splice the binding mid-identifier somewhere earlier in the file.
        expect(out).toContain('— em-dash and 🦄 emoji —');
        expect(out).toContain('type User = {id: number; name: string};');
      });
    }
  );

  runTest(
    'multibyte reflect: byte offsets convert to char indices before insertion',
    {
      'user-mb-reflect.ts': `import {getRunTypeId} from '@ts-runtypes/core';
// preamble with multibyte chars — em-dash and 🦄 emoji — before the site
type User = {id: number; name: string};
const u = {id: 1, name: 'm'} as User;
getRunTypeId(u);
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const {code: out, sites} = await rewrite('user-mb-reflect.ts', sources['user-mb-reflect.ts'], client);

        expect(sites.length).toBe(1);
        expect(out).toContain(`getRunTypeId(u, __rt_${sites[0].id});`);
        expect(out).toContain('— em-dash and 🦄 emoji —');
      });
    }
  );

  // ---- source map --------------------------------------------------------
  // The rewrite returns an EditBuffer-generated map so Vite can chain our
  // edits into the composite map: generated line 2 (everything after the
  // single-line import block) must map back to ORIGINAL line 1.

  runTest(
    'source map static: original lines survive the injected import block',
    {
      'user-map.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type User = {id: number; name: string};
getRunTypeId<User>();
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const rewritten = await rewrite('user-map.ts', sources['user-map.ts'], client);
        assertImportBlockMap(rewritten, sources['user-map.ts']);
      });
    }
  );

  runTest(
    'source map reflect: original lines survive the injected import block',
    {
      'user-map-reflect.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type User = {id: number; name: string};
const u = {id: 1, name: 'm'} as User;
getRunTypeId(u);
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const rewritten = await rewrite('user-map-reflect.ts', sources['user-map-reflect.ts'], client);
        assertImportBlockMap(rewritten, sources['user-map-reflect.ts']);
      });
    }
  );

  function assertImportBlockMap(rewritten: Awaited<ReturnType<typeof rewrite>>, original: string) {
    const map = rewritten.map;
    expect(map).toBeDefined();
    expect(map!.sourcesContent?.[0]).toBe(original);

    const lines = decodeMappings(map!.mappings);
    // Generated line 1 is the injected import block: every segment there
    // must map to original line 1 (the block displaces, never replaces).
    // Generated line 2 starts the user's original source: its first segment
    // must map back to original line 1, column 0 — the 1-line drift the
    // map exists to cancel.
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const firstUserSegment = lines[1][0];
    expect(firstUserSegment).toBeDefined();
    expect(firstUserSegment.generatedColumn).toBe(0);
    expect(firstUserSegment.originalLine).toBe(0);
    expect(firstUserSegment.originalColumn).toBe(0);
    // Every original line N (0-based) must appear as generated line N+1.
    const originalLineCount = original.split('\n').length - 1;
    for (let line = 0; line < originalLineCount; line++) {
      const segments = lines[line + 1] ?? [];
      expect(segments.some((segment) => segment.originalLine === line)).toBe(true);
    }
  }
});
