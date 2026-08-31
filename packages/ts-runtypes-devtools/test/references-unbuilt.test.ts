// Project references with unbuilt outputs must not blank the marker scan.
//
// The real-world shape (mion's monorepo): the main project's tsconfig declares
// `references` to sibling packages whose declaration outputs are never built in
// a dev loop, and `paths` map the package names onto those siblings' SOURCES.
// With references honored, resolution landing in a referenced project's source
// got redirected to the (missing) declaration output — every marker resolved to
// nothing and the whole-program scan returned ZERO sites, silently. The
// resolver now drops project references when building its program (they are a
// tsc --build orchestration concept; bundlers never honor them), so the scan
// sees the same sources the bundler executes. Pinned Go-side in
// internal/compiler/program/references_test.go; this covers the plugin path
// end-to-end through the shipped binary.
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import runtypesRollup from '../src/rollup.ts';
import {BIN, hasBinary, writeMarkerPackage} from './helpers/inline.ts';

const FIXTURE_DIR = path.resolve(__dirname, 'tmp-references-unbuilt');
const LIB_DIR = path.join(FIXTURE_DIR, 'lib');
const MAIN_DIR = path.join(FIXTURE_DIR, 'main');
const CONSUMER = path.join(MAIN_DIR, 'consumer.ts');
const OUT_DIR = path.join(MAIN_DIR, '__runtypes');

const LIB_TSCONFIG = JSON.stringify({
  compilerOptions: {
    composite: true,
    declaration: true,
    outDir: 'dist',
    rootDir: 'src',
    module: 'ESNext',
    moduleResolution: 'bundler',
    target: 'ES2022',
    strict: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
    noEmit: false,
    types: [],
  },
  include: ['src'],
});

// references point at ../lib whose dist/ was never built; paths resolve the
// package name straight onto the referenced project's SOURCE.
const MAIN_TSCONFIG = JSON.stringify({
  compilerOptions: {
    module: 'ESNext',
    moduleResolution: 'bundler',
    target: 'ES2022',
    strict: true,
    skipLibCheck: true,
    types: [],
    paths: {'@fix/lib': ['../lib/src/wrapper.ts']},
  },
  include: ['*.ts'],
  references: [{path: '../lib'}],
});

// Same wrapper shape as wrapper-zero-config.test.ts — a framework factory with a
// trailing marker param, living in the REFERENCED project.
const WRAPPER_SRC = `import {createValidateFn} from '@mionjs/run-types';
import type {InjectTypeFnArgs, ValidateFn} from '@mionjs/run-types';

type AnyHandler = (ctx: unknown, ...rest: any[]) => unknown;

export function route<H extends AnyHandler>(handler: H, id?: InjectTypeFnArgs<Parameters<H>, 'val'>) {
  const validate: ValidateFn = createValidateFn(undefined, undefined, id as never);
  return {handler, validate};
}
`;

const CONSUMER_SRC = `import {route} from '@fix/lib';

export const lenRoute = route((ctx: unknown, name: string) => name.length);
`;

type Hook = ((...args: unknown[]) => unknown) | {handler: (...args: unknown[]) => unknown};
const callHook = (hook: Hook, thisArg: unknown, ...args: unknown[]): unknown =>
  typeof hook === 'function' ? hook.apply(thisArg, args) : hook.handler.apply(thisArg, args);

const ctx = {
  error(message: string): never {
    throw new Error(message);
  },
  warn(): void {},
};

function makePlugin() {
  return runtypesRollup({
    binary: BIN,
    cwd: MAIN_DIR,
    tsconfig: 'tsconfig.json',
    genDir: OUT_DIR,
  }) as any;
}

describe('project references with unbuilt outputs', () => {
  const register = hasBinary() ? it : it.skip;

  beforeAll(() => {
    fs.rmSync(FIXTURE_DIR, {recursive: true, force: true});
    fs.mkdirSync(path.join(LIB_DIR, 'src'), {recursive: true});
    fs.mkdirSync(MAIN_DIR, {recursive: true});
    fs.writeFileSync(path.join(LIB_DIR, 'tsconfig.json'), LIB_TSCONFIG);
    fs.writeFileSync(path.join(LIB_DIR, 'src', 'wrapper.ts'), WRAPPER_SRC);
    fs.writeFileSync(path.join(MAIN_DIR, 'tsconfig.json'), MAIN_TSCONFIG);
    // At the COMMON parent: the wrapper in lib/ and the consumer in main/ both
    // walk up to FIXTURE_DIR/node_modules (an ambient was global; a package
    // resolves per-file).
    writeMarkerPackage(FIXTURE_DIR);
    fs.writeFileSync(CONSUMER, CONSUMER_SRC);
  });
  afterAll(() => fs.rmSync(FIXTURE_DIR, {recursive: true, force: true}));

  register('marker sites resolve through a referenced (unbuilt) sibling project', async () => {
    const plugin = makePlugin();
    try {
      await callHook(plugin.buildStart, ctx);
      const transformed = (await callHook(plugin.transform, ctx, CONSUMER_SRC, CONSUMER)) as {code: string} | null;
      expect(transformed, 'consumer of a wrapper in a referenced project must be rewritten').toBeTruthy();
      expect(transformed!.code).toMatch(/route\(\(ctx: unknown, name: string\) => name\.length, __rt_[A-Za-z0-9_]+\)/);
    } finally {
      try {
        await callHook(plugin.buildEnd, ctx);
      } catch {
        // best-effort teardown
      }
    }
  });
});
