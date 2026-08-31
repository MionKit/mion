// moduleMode wiring: allSingle (per-family bundle modules + named-export
// imports at call sites) and allModules (per-node runtype modules — the
// pre-bundle layout). Default-mode shapes are locked by rewrite.test.ts.
// Each mode spawns its own `serve --sources ops` resolver (the shared per-worker
// client runs the binary default).

import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ResolverClient} from '../src/resolver-client.ts';
import {BARE_CWD, BIN, hasBinary, MARKER_PACKAGE_OVERLAY, rewrite} from './helpers/inline.ts';
import {
  ENTRY_BINDING_PREFIX,
  FNS_BUNDLE_DIR,
  MODULE_MODE_ALL_MODULES,
  MODULE_MODE_ALL_SINGLE,
  RUNTYPES_BUNDLE_BASENAME,
  ENTRY_MODULE_PREFIX,
  ENTRY_MODULE_SUFFIX,
  MODULE_MODE_DEFAULT,
} from '../src/go-generated/runtypes-constants.generated.ts';

const register = hasBinary() ? it : it.skip;

// One injected entry-module import: the module BASENAME the rewrite pointed at
// and the binding names it pulled from there.
interface InjectedImport {
  basename: string;
  bindings: string[];
}

/** Parses the rewrite's injected import block for `rtmod:` entry-module imports. **/
function injectedEntryImports(out: string): InjectedImport[] {
  const found: InjectedImport[] = [];
  for (const match of out.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    const specifier = match[2];
    if (!specifier.startsWith(ENTRY_MODULE_PREFIX)) continue;
    const basename = specifier.slice(ENTRY_MODULE_PREFIX.length, -ENTRY_MODULE_SUFFIX.length);
    const bindings = match[1]
      .split(',')
      .map((binding) => binding.trim())
      .filter(Boolean);
    found.push({basename, bindings});
  }
  return found;
}

// The invariant every moduleMode owes: a binding is never imported from a
// module that does not export it. Unresolvable names fail unreadably downstream
// — rollup reports an empty error thousands of columns into the single-line
// import block, and esbuild / vite-node do not check at all, so the binding is
// silently `undefined` at runtime.
async function expectEveryImportResolves(client: ResolverClient, file: string, out: string): Promise<void> {
  const scan = await client.scanFiles([file], {includeEntryModules: true});
  const modules = scan.entryModules ?? {};
  const imports = injectedEntryImports(out);
  expect(imports.length, 'the rewrite injected no entry-module imports').toBeGreaterThan(0);
  for (const {basename, bindings} of imports) {
    const source = modules[basename];
    expect(source, `the rewrite imports from '${basename}', which the build did not emit`).toBeDefined();
    for (const binding of bindings) {
      expect(source, `'${binding}' is imported from '${basename}', which does not export it`).toContain(
        `export const ${binding}=`
      );
    }
  }
}

async function withModeClient<T>(
  mode: string,
  sources: Record<string, string>,
  fn: (client: ResolverClient) => Promise<T>
): Promise<T> {
  const client = new ResolverClient(BIN, BARE_CWD, '', {serverMode: true, moduleMode: mode});
  try {
    await client.setSources({...MARKER_PACKAGE_OVERLAY, ...sources});
    return await fn(client);
  } finally {
    client.close();
  }
}

describe('@ts-runtypes/devtools / moduleMode', () => {
  register('allSingle static: getRunTypeId<T>() imports its binding as a NAMED export of the runtypes bundle', async () => {
    const code = `import {getRunTypeId} from '@mionjs/run-types';
type User = {id: number; name: string};
export const staticId = getRunTypeId<User>();
`;
    await withModeClient(MODULE_MODE_ALL_SINGLE, {'user.ts': code}, async (client) => {
      const {code: out, sites} = await rewrite('user.ts', code, client);
      expect(sites.length).toBe(1);
      expect(sites[0].module).toBe(RUNTYPES_BUNDLE_BASENAME);
      const binding = ENTRY_BINDING_PREFIX + sites[0].id;
      expect(out).toContain(`import {${binding}} from '${ENTRY_MODULE_PREFIX}${RUNTYPES_BUNDLE_BASENAME}.js';`);
      expect(out).toContain(`getRunTypeId<User>(undefined, ${binding});`);
    });
  });

  register('allSingle reflect: getRunTypeId(value) imports its binding as a NAMED export of the runtypes bundle', async () => {
    const code = `import {getRunTypeId} from '@mionjs/run-types';
type User = {id: number; name: string};
const u = {id: 1, name: 'm'} as User;
export const reflectedId = getRunTypeId(u);
`;
    await withModeClient(MODULE_MODE_ALL_SINGLE, {'user-reflect.ts': code}, async (client) => {
      const {code: out, sites} = await rewrite('user-reflect.ts', code, client);
      expect(sites.length).toBe(1);
      expect(sites[0].module).toBe(RUNTYPES_BUNDLE_BASENAME);
      const binding = ENTRY_BINDING_PREFIX + sites[0].id;
      expect(out).toContain(`import {${binding}} from '${ENTRY_MODULE_PREFIX}${RUNTYPES_BUNDLE_BASENAME}.js';`);
      expect(out).toContain(`getRunTypeId(u, ${binding});`);
    });
  });

  register('allSingle createX: two validate sites dedupe into ONE family-bundle import statement', async () => {
    const code = `import {createValidateFn} from '@mionjs/run-types';
interface Alpha { alphaProp: string }
interface Beta { betaProp: number }
export const isAlpha = createValidateFn<Alpha>();
export const isBeta = createValidateFn<Beta>();
`;
    await withModeClient(MODULE_MODE_ALL_SINGLE, {'pair.ts': code}, async (client) => {
      const {code: out, sites} = await rewrite('pair.ts', code, client);
      expect(sites.length).toBe(2);
      const valSpecifier = `${ENTRY_MODULE_PREFIX}${FNS_BUNDLE_DIR}/val.js`;
      for (const site of sites) expect(site.module).toBe(`${FNS_BUNDLE_DIR}/val`);
      // Exactly one import statement for the bundle, carrying both bindings.
      const occurrences = out.split(`from '${valSpecifier}'`).length - 1;
      expect(occurrences).toBe(1);
      const bindings = sites.map((site) => `${ENTRY_BINDING_PREFIX}${site.fnId}_${site.id}`).sort();
      expect(out).toContain(`import {${bindings.join(', ')}} from '${valSpecifier}';`);
      // The bundle itself serves both entries as named exports.
      const scan = await client.scanFiles(['pair.ts'], {includeEntryModules: true});
      const bundle = scan.entryModules?.[`${FNS_BUNDLE_DIR}/val`];
      expect(bundle).toBeDefined();
      for (const binding of bindings) expect(bundle).toContain(`export const ${binding}=[`);
    });
  });

  register('allSingle runtime: the hoisted rtL thunk resolves the bundle and a folded facade registers its root', async () => {
    // ≥3 reflection roots → the facade deps thunk is hoisted to one `rtL`.
    const code = `import {getRunTypeId} from '@mionjs/run-types';
type A = {a: string};
type B = {b: number};
type C = {c: boolean};
type D = {d: string};
export const a = getRunTypeId<A>();
export const b = getRunTypeId<B>();
export const c = getRunTypeId<C>();
export const d = getRunTypeId<D>();
`;
    await withModeClient(MODULE_MODE_ALL_SINGLE, {'roots.ts': code}, async (client) => {
      const scan = await client.scanFiles(['roots.ts'], {includeEntryModules: true});
      const bundleSource = scan.entryModules?.[RUNTYPES_BUNDLE_BASENAME];
      expect(bundleSource, 'runtypes bundle module').toBeDefined();
      // Exactly one hoisted thunk declaration in the whole bundle.
      expect((bundleSource!.match(/const rtL=\(\)=>\[__rt_runtypes\];/g) ?? []).length).toBe(1);
      const rootId = scan.sites!.find((s) => !s.fnId && s.id)!.id;

      // The allSingle runtypes bundle is self-contained (facades reference the
      // same-file __rt_runtypes). Evaluate it and pull out the data tuple +
      // this root's folded facade as locals.
      const rootBinding = ENTRY_BINDING_PREFIX + rootId;
      const evalSrc = bundleSource!.replace(/^export /gm, '') + `\n;return {data: __rt_runtypes, facade: ${rootBinding}};`;
      const {data, facade} = new Function(evalSrc)() as {data: readonly unknown[]; facade: readonly unknown[]};

      // The facade's deps thunk IS the hoisted rtL — calling it returns the
      // same bundle data tuple (proves the shared local resolves, no TDZ).
      expect(facade[0]).toBe(5);
      expect(facade[3]).toBe(rootId);
      const thunk = facade[1] as () => readonly unknown[];
      expect(typeof thunk).toBe('function');
      expect(thunk()[0]).toBe(data);

      // Two-phase init against a stub registry: register the bundle rows, run
      // the footer ini — every c(id) ref must resolve (no throw) — and the
      // root must end up registered.
      const registry: Record<string, {id: unknown; kind: unknown}> = {};
      const stub = {
        useRunType: (id: string) => {
          const entry = registry[id];
          if (!entry) throw new Error(`useRunType miss: ${id}`);
          return entry;
        },
      };
      for (const row of (data[4] ?? []) as readonly (readonly unknown[])[]) {
        registry[row[0] as string] = {id: row[0], kind: row[1]};
      }
      const ini = data[2];
      if (typeof ini === 'function') (ini as (rtu: typeof stub) => void)(stub);
      expect(registry[rootId]).toBeDefined();
    });
  });

  // A MULTI-FUNCTION site: the real createStandardSchema<T>() carries
  // `InjectTypeFnArgs<T, 'val', 'verr', 'jsonSchema'>`, so ONE call injects
  // bindings for THREE families — which under allSingle live in three
  // DIFFERENT `fns/<family>` bundles. The rewrite must therefore emit three
  // imports, one per bundle. Regression cover for the allSingle import
  // grouping bug (docs/todos/allsingle-multifn-import-grouping.md), reported
  // downstream by mion.
  register('allSingle multi-fn: each binding is imported from the family bundle that EXPORTS it', async () => {
    const code = `import {createStandardSchema} from '@mionjs/run-types';
interface User { id: string; name: string }
export const schema = createStandardSchema<User>();
`;
    await withModeClient(MODULE_MODE_ALL_SINGLE, {'schema.ts': code}, async (client) => {
      const {code: out, sites} = await rewrite('schema.ts', code, client);
      const site = sites.find((candidate) => (candidate.fnIds?.length ?? 0) > 1);
      expect(site, 'createStandardSchema must yield a multi-function site').toBeDefined();
      expect(site!.fnIds!.length).toBeGreaterThan(1);

      await expectEveryImportResolves(client, 'schema.ts', out);

      // The bindings span several families, so they cannot all ride one bundle.
      const bundles = new Set(
        injectedEntryImports(out)
          .map((entry) => entry.basename)
          .filter((basename) => basename.startsWith(`${FNS_BUNDLE_DIR}/`))
      );
      expect(bundles.size, `expected one import per family bundle, got ${[...bundles].join(', ')}`).toBe(site!.fnIds!.length);
    });
  });

  // Same invariant, both getRunTypeId call shapes (marker coverage rule): the
  // static form supplies T, the reflection form infers it from a value.
  register('allSingle static: getRunTypeId<T>() imports resolve against the emitted modules', async () => {
    const code = `import {getRunTypeId} from '@mionjs/run-types';
type Account = {ref: string; total: number};
export const staticId = getRunTypeId<Account>();
`;
    await withModeClient(MODULE_MODE_ALL_SINGLE, {'account.ts': code}, async (client) => {
      const {code: out} = await rewrite('account.ts', code, client);
      await expectEveryImportResolves(client, 'account.ts', out);
    });
  });

  register('allSingle reflect: getRunTypeId(value) imports resolve against the emitted modules', async () => {
    const code = `import {getRunTypeId} from '@mionjs/run-types';
type Account = {ref: string; total: number};
const account: Account = {ref: 'a', total: 1};
export const reflectedId = getRunTypeId(account);
`;
    await withModeClient(MODULE_MODE_ALL_SINGLE, {'account-reflect.ts': code}, async (client) => {
      const {code: out} = await rewrite('account-reflect.ts', code, client);
      await expectEveryImportResolves(client, 'account-reflect.ts', out);
    });
  });

  // The invariant is mode-independent: default and allModules must hold it too
  // (they do today — this pins them so a future grouping change cannot regress
  // them the way allSingle did).
  for (const mode of [MODULE_MODE_DEFAULT, MODULE_MODE_ALL_MODULES]) {
    register(`${mode} multi-fn: each binding is imported from the module that EXPORTS it`, async () => {
      const code = `import {createStandardSchema} from '@mionjs/run-types';
interface Order { sku: string; qty: number }
export const schema = createStandardSchema<Order>();
`;
      await withModeClient(mode, {'order.ts': code}, async (client) => {
        const {code: out} = await rewrite('order.ts', code, client);
        await expectEveryImportResolves(client, 'order.ts', out);
      });
    });
  }

  register('allModules static: getRunTypeId<T>() imports a per-node module (kind 0) with child imports', async () => {
    const code = `import {getRunTypeId} from '@mionjs/run-types';
type User = {id: number; name: string};
export const staticId = getRunTypeId<User>();
`;
    await withModeClient(MODULE_MODE_ALL_MODULES, {'user.ts': code}, async (client) => {
      const {code: out, sites} = await rewrite('user.ts', code, client);
      expect(sites.length).toBe(1);
      expect(sites[0].module ?? '').toBe('');
      // Per-entry form: named import of the root node module's binding.
      expect(out).toContain(`import {${ENTRY_BINDING_PREFIX}${sites[0].id}} from '${ENTRY_MODULE_PREFIX}${sites[0].id}.js';`);
      const scan = await client.scanFiles(['user.ts'], {includeEntryModules: true});
      expect(scan.entryModules?.[RUNTYPES_BUNDLE_BASENAME]).toBeUndefined();
      const rootModule = scan.entryModules?.[sites[0].id];
      expect(rootModule).toBeDefined();
      expect(rootModule).toMatch(/export const __rt_[A-Za-z0-9_$]+=\[0,\(\)=>\[/);
      expect(rootModule).toContain(`import {${ENTRY_BINDING_PREFIX}`);
    });
  });

  register('allModules reflect: getRunTypeId(value) resolves to the same per-node layout', async () => {
    const code = `import {getRunTypeId} from '@mionjs/run-types';
type User = {id: number; name: string};
const u = {id: 1, name: 'm'} as User;
export const reflectedId = getRunTypeId(u);
`;
    await withModeClient(MODULE_MODE_ALL_MODULES, {'user-reflect.ts': code}, async (client) => {
      const {code: out, sites} = await rewrite('user-reflect.ts', code, client);
      expect(sites.length).toBe(1);
      expect(out).toContain(`getRunTypeId(u, ${ENTRY_BINDING_PREFIX}${sites[0].id});`);
      const scan = await client.scanFiles(['user-reflect.ts'], {includeEntryModules: true});
      const rootModule = scan.entryModules?.[sites[0].id];
      expect(rootModule).toBeDefined();
      expect(rootModule).toMatch(/export const __rt_[A-Za-z0-9_$]+=\[0,\(\)=>\[/);
    });
  });
});
