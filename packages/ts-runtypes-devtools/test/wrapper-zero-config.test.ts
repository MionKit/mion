// Zero-config wrapper-framework support — the transform gates on the
// resolver's own site-file set instead of textual import sniffing.
//
// A framework (mion's `route()` is the real-world case) declares its own
// factory with a trailing `InjectTypeFnArgs` param and forwards the handle to a
// public createX. Its USERS' files import the FRAMEWORK's module — the string
// '@mionjs/run-types' never appears — so a textual pre-filter alone would skip
// them: generation saw the sites (whole-program scan) but the per-file rewrite
// never ran and the factories threw "no id injected" at runtime. The fix is to
// let the scan itself drive the gate: generate() returns the site-file set
// (every program file with at least one marker site) and the transform rewrites
// exactly those files, no plugin option required — whatever package (local or
// node_modules) declared the wrapper.
//
// The fixture is a self-contained mini project (own tsconfig + the ambient
// marker overlay, mirroring internal/testfixtures/runtypes.d.ts) rather than a
// file inside the marker package's own test program: cross-file wrapper sites
// are currently NOT resolved inside the marker package's self-referential
// program, while every consumer-shaped program resolves them fine.
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import runtypesRollup from '../src/rollup.ts';
import {BIN, hasBinary, writeMarkerPackage} from './helpers/inline.ts';

const FIXTURE_DIR = path.resolve(__dirname, 'tmp-wrapper-zero-config');
const WRAPPER = path.join(FIXTURE_DIR, 'wrapper.ts');
const CONSUMER = path.join(FIXTURE_DIR, 'consumer.ts');
const PLAIN = path.join(FIXTURE_DIR, 'plain.ts');
const OUT_DIR = path.join(FIXTURE_DIR, '__runtypes');

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

// The wrapper imports '@mionjs/run-types'; its forwarded createValidateFn call is
// an explicit pass-through and must never be rewritten. The marker type is used
// VERBATIM (never aliased) — alias declarations are not recognised by the
// scanner.
const WRAPPER_SRC = `import {createValidateFn} from '@ts-runtypes/core';
import type {InjectTypeFnArgs, ValidateFn} from '@ts-runtypes/core';

type AnyHandler = (ctx: unknown, ...rest: any[]) => unknown;

export function route<H extends AnyHandler>(handler: H, id?: InjectTypeFnArgs<Parameters<H>, 'val'>) {
  const validate: ValidateFn = createValidateFn(undefined, undefined, id as never);
  return {handler, validate};
}
`;

// The consumer file NEVER mentions '@mionjs/run-types' — only the wrapper
// module. A textual pre-filter would skip it; the site-file set must not.
const CONSUMER_SRC = `import {route} from './wrapper';

export const lenRoute = route((ctx: unknown, name: string) => name.length);
`;

// In the program but no marker sites and no marker-module mention — the gate
// must skip it without a resolver round-trip.
const PLAIN_SRC = `export const answer = 42;
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

// No wrapper-related options exist — the whole point. binary/cwd/tsconfig/genDir
// only pin the fixture project.
function makePlugin() {
  return runtypesRollup({
    binary: BIN,
    cwd: FIXTURE_DIR,
    tsconfig: 'tsconfig.json',
    genDir: OUT_DIR,
  }) as any;
}

describe('zero-config wrapper-framework transform gating', () => {
  const register = hasBinary() ? it : it.skip;

  beforeAll(() => {
    fs.rmSync(FIXTURE_DIR, {recursive: true, force: true});
    fs.mkdirSync(FIXTURE_DIR, {recursive: true});
    fs.writeFileSync(path.join(FIXTURE_DIR, 'tsconfig.json'), TSCONFIG_SRC);
    writeMarkerPackage(FIXTURE_DIR);
    fs.writeFileSync(WRAPPER, WRAPPER_SRC);
    fs.writeFileSync(CONSUMER, CONSUMER_SRC);
    fs.writeFileSync(PLAIN, PLAIN_SRC);
  });
  afterAll(() => fs.rmSync(FIXTURE_DIR, {recursive: true, force: true}));

  register('a wrapper consumer is rewritten with NO plugin config; the wrapper forward stays a pass-through', async () => {
    const plugin = makePlugin();
    try {
      await callHook(plugin.buildStart, ctx);

      // Consumer: in the scan's site-file set, so the gate hands it to the
      // resolver even though no marker module is ever named in the file; the
      // route() call gets the entry binding + a relative import to a real
      // on-disk module.
      const transformed = (await callHook(plugin.transform, ctx, CONSUMER_SRC, CONSUMER)) as {code: string} | null;
      expect(transformed, 'wrapper-consumer file must be transformed with zero config').toBeTruthy();
      const code = transformed!.code;
      expect(code).toMatch(/route\(\(ctx: unknown, name: string\) => name\.length, __rt_[A-Za-z0-9_]+\)/);
      const match = code.match(/from '(\.\.?\/[^']+\.js)'/);
      expect(match, `expected an injected relative module import in:\n${code}`).toBeTruthy();
      const moduleFile = path.resolve(path.dirname(CONSUMER), match![1]);
      expect(fs.existsSync(moduleFile), `injected import ${match![1]} must point at a written module`).toBe(true);

      // Wrapper: its forwarded createValidateFn(undefined, undefined, id) is an
      // explicit pass-through — no injectable site, so the transform returns
      // null and the source ships untouched.
      const wrapperResult = await callHook(plugin.transform, ctx, WRAPPER_SRC, WRAPPER);
      expect(wrapperResult, 'wrapper forward must stay untouched (pass-through)').toBeNull();
    } finally {
      try {
        await callHook(plugin.buildEnd, ctx);
      } catch {
        // best-effort teardown
      }
    }
  });

  register('a file with no marker sites and no marker-module mention is skipped', async () => {
    const plugin = makePlugin();
    try {
      await callHook(plugin.buildStart, ctx);
      const plainResult = await callHook(plugin.transform, ctx, PLAIN_SRC, PLAIN);
      expect(plainResult, 'site-free file must short-circuit to null').toBeNull();
    } finally {
      try {
        await callHook(plugin.buildEnd, ctx);
      } catch {
        // best-effort teardown
      }
    }
  });

  // A host project can declare its OWN function named `registerPureFnFactory`
  // (mion's @mionjs/core does — the real-world case that surfaced this). Such a
  // file textually matches the fallback probe while living OUTSIDE the
  // resolver's program: it was never scanned, cannot carry injectable sites,
  // and must be SKIPPED — a hard "source file not in program" error here fails
  // the whole host build. Files in the SITE SET keep failing loud.
  register('a foreign file matching the textual fallback by name only is skipped, not an error', async () => {
    const plugin = makePlugin();
    try {
      await callHook(plugin.buildStart, ctx);
      const foreignId = path.join(path.dirname(FIXTURE_DIR), 'tmp-wrapper-zero-config-foreign', 'pureFn.ts');
      const foreignSrc = `export function registerPureFnFactory(namespace: string) {\n  return namespace;\n}\n`;
      const foreignResult = await callHook(plugin.transform, ctx, foreignSrc, foreignId);
      expect(foreignResult, 'textual-fallback false positive outside the program must be skipped').toBeNull();
    } finally {
      try {
        await callHook(plugin.buildEnd, ctx);
      } catch {
        // best-effort teardown
      }
    }
  });
});
