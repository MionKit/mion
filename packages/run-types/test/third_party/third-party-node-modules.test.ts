// Third-party marker resolution through node_modules — the strongest form of the
// zero-config wrapper story, and the direct test of "markers in third-party
// libraries, node_modules included".
//
// Setup: two modules.
//   1. A framework package installed in node_modules (`@acme/router`) whose
//      route() wrapper carries ONE trailing InjectTypeFnArgs marker naming three
//      families and imports the marker type from '@mionjs/run-types'. This is the
//      ONLY file that names the marker package, and it lives in node_modules.
//   2. A consumer module that imports route() from that package and NEVER
//      mentions '@mionjs/run-types'.
//
// The plugin must still rewrite the consumer's call site. It cannot rely on a
// textual import check (the consumer names no marker package) and it cannot rely
// on the bundler processing node_modules (bundlers commonly skip node_modules in
// dev). Detection instead happens entirely inside the Go compiler: the resolver's
// whole-program scan resolves route()'s signature from the node_modules
// declaration, sees the marker, and reports the consumer as a marker-site file;
// the transform gate rewrites exactly those files. Zero configuration.
//
// The fixture is materialized in an OS temp dir (its own tsconfig + a real
// node_modules package + an ambient '@mionjs/run-types' overlay) so it stays
// entirely outside the marker package's own test Program — the ambient overlay
// would otherwise duplicate the real '@mionjs/run-types' module declaration.
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import runtypesRollup from '../../../ts-runtypes-devtools/src/rollup.ts';
import {BIN, hasBinary, writeMarkerPackage} from '../../../ts-runtypes-devtools/test/helpers/inline.ts';

let FIXTURE_DIR = '';
let CONSUMER = '';

const TSCONFIG_SRC = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    skipLibCheck: true,
    types: [],
  },
  include: ['*.ts'],
});

// Module 1 — the third-party framework, installed under node_modules.
const ROUTER_PKG_JSON = JSON.stringify({
  name: '@acme/router',
  version: '0.0.0',
  type: 'module',
  types: 'index.d.ts',
  main: 'index.js',
});

// The wrapper's declaration: a route() carrying a three-family marker. This is
// the only file naming '@mionjs/run-types', and it lives in node_modules.
const ROUTER_DTS = `import type {InjectTypeFnArgs} from '@mionjs/run-types';
export type AnyHandler = (ctx: unknown, ...rest: any[]) => unknown;
export declare function route<H extends AnyHandler>(
  handler: H,
  fns?: InjectTypeFnArgs<Parameters<H>, 'verr', 'jsonDecoder', 'jsonEncoder'>,
): {handler: H; fns?: unknown};
`;

const ROUTER_JS = `export function route(handler, fns) {
  return {handler, fns};
}
`;

// Module 2 — the consumer. It imports route() from the node_modules package and
// NEVER names '@mionjs/run-types', so a textual pre-filter alone would skip it.
const CONSUMER_SRC = `import {route} from '@acme/router';

export const lenRoute = route((ctx: unknown, name: string) => name.length);
`;

const ctx = {
  error(message: string): never {
    throw new Error(message);
  },
  warn(): void {},
};

const callHook = (hook: any, thisArg: unknown, ...args: unknown[]): unknown =>
  typeof hook === 'function' ? hook.apply(thisArg, args) : hook.handler.apply(thisArg, args);

function makePlugin() {
  return runtypesRollup({
    binary: BIN,
    cwd: FIXTURE_DIR,
    tsconfig: 'tsconfig.json',
    genDir: path.join(FIXTURE_DIR, '__runtypes'),
  }) as any;
}

describe('third-party markers resolved through node_modules (zero config)', () => {
  const register = hasBinary() ? it : it.skip;

  beforeAll(() => {
    FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-third-party-'));
    CONSUMER = path.join(FIXTURE_DIR, 'consumer.ts');
    const routerDir = path.join(FIXTURE_DIR, 'node_modules', '@acme', 'router');
    fs.mkdirSync(routerDir, {recursive: true});
    fs.writeFileSync(path.join(FIXTURE_DIR, 'tsconfig.json'), TSCONFIG_SRC);
    writeMarkerPackage(FIXTURE_DIR);
    fs.writeFileSync(CONSUMER, CONSUMER_SRC);
    fs.writeFileSync(path.join(routerDir, 'package.json'), ROUTER_PKG_JSON);
    fs.writeFileSync(path.join(routerDir, 'index.d.ts'), ROUTER_DTS);
    fs.writeFileSync(path.join(routerDir, 'index.js'), ROUTER_JS);
  });
  afterAll(() => fs.rmSync(FIXTURE_DIR, {recursive: true, force: true}));

  register('a consumer of a node_modules wrapper is rewritten with zero config', async () => {
    // The consumer never names the marker package, so the textual fallback alone
    // (without the resolver's site-file set) would skip it entirely.
    expect(CONSUMER_SRC).not.toContain('@mionjs/run-types');

    const plugin = makePlugin();
    try {
      await callHook(plugin.buildStart, ctx);

      const transformed = (await callHook(plugin.transform, ctx, CONSUMER_SRC, CONSUMER)) as {code: string} | null;
      expect(transformed, 'consumer of a node_modules wrapper must be transformed via the resolver site-file set').toBeTruthy();
      const code = transformed!.code;

      // The three-family marker injects an ordered array of three DISTINCT
      // bindings before the call's closing paren.
      const arrayMatch = code.match(
        /route\(\(ctx: unknown, name: string\) => name\.length, \[(__rt_[A-Za-z0-9_]+), (__rt_[A-Za-z0-9_]+), (__rt_[A-Za-z0-9_]+)\]\)/
      );
      expect(arrayMatch, `expected a three-element binding array in:\n${code}`).toBeTruthy();
      const [, a, b, c] = arrayMatch!;
      expect(new Set([a, b, c]).size).toBe(3);

      // Every binding is imported from a real generated module on disk.
      const imports = [...code.matchAll(/import \{([^}]*)\} from '(\.\.?\/[^']+\.js)'/g)];
      const importedBindings = imports.flatMap((m) => m[1].split(',').map((s) => s.trim()));
      for (const binding of [a, b, c]) {
        expect(importedBindings, `binding ${binding} must be imported`).toContain(binding);
      }
      for (const m of imports) {
        const moduleFile = path.resolve(path.dirname(CONSUMER), m[2]);
        expect(fs.existsSync(moduleFile), `injected import ${m[2]} must point at a written module`).toBe(true);
      }
    } finally {
      try {
        await callHook(plugin.buildEnd, ctx);
      } catch {
        // best-effort teardown
      }
    }
  });
});
