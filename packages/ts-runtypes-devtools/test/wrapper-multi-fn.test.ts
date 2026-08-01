// Multi-family wrapper injection — a single trailing InjectTypeFnArgs marker
// naming several function families injects an ARRAY of entry-module tuples, one
// per family in declaration order, which the wrapper forwards positionally to
// each factory.
//
// This pins mion's real route() shape: one marker carrying 'verr' +
// 'jsonDecoder' + 'jsonEncoder' (validator + JSON codec pair) forwarded to
// createGetValidationErrorsFn / createJsonDecoderFn / createJsonEncoderFn. It also
// re-exercises the zero-config gate — the CONSUMER file never names
// '@ts-runtypes/core', so only the resolver's site-file set can bring it into
// transform scope (mion adoption, Feature 2).
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import runtypesRollup from '../src/rollup.ts';
import {BIN, hasBinary, RUNTYPES_DTS} from './helpers/inline.ts';

const FIXTURE_DIR = path.resolve(__dirname, 'tmp-wrapper-multi-fn');
const WRAPPER = path.join(FIXTURE_DIR, 'wrapper.ts');
const CONSUMER = path.join(FIXTURE_DIR, 'consumer.ts');
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

// The wrapper carries ONE trailing marker naming three families and forwards
// each injected element to its factory. Every forwarded createX call has its id
// slot explicitly filled, so all three stay pass-throughs the build leaves
// untouched.
const WRAPPER_SRC = `import {createGetValidationErrorsFn, createJsonDecoderFn, createJsonEncoderFn} from '@ts-runtypes/core';
import type {InjectTypeFnArgs} from '@ts-runtypes/core';

type AnyHandler = (ctx: unknown, ...rest: any[]) => unknown;

export function route<H extends AnyHandler>(
  handler: H,
  fns?: InjectTypeFnArgs<Parameters<H>, 'verr', 'jsonDecoder', 'jsonEncoder'>,
) {
  const getErrors = createGetValidationErrorsFn(undefined, undefined, fns?.[0] as never);
  const decode = createJsonDecoderFn(undefined, undefined, fns?.[1] as never);
  const encode = createJsonEncoderFn(undefined, undefined, fns?.[2] as never);
  return {handler, getErrors, decode, encode};
}
`;

// The consumer NEVER mentions '@ts-runtypes/core' — only the wrapper module.
const CONSUMER_SRC = `import {route} from './wrapper';

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
    genDir: OUT_DIR,
  }) as any;
}

describe('multi-family wrapper injection (array of entry tuples)', () => {
  const register = hasBinary() ? it : it.skip;

  beforeAll(() => {
    fs.rmSync(FIXTURE_DIR, {recursive: true, force: true});
    fs.mkdirSync(FIXTURE_DIR, {recursive: true});
    fs.writeFileSync(path.join(FIXTURE_DIR, 'tsconfig.json'), TSCONFIG_SRC);
    fs.writeFileSync(path.join(FIXTURE_DIR, 'rt-overlay.d.ts'), RUNTYPES_DTS);
    fs.writeFileSync(WRAPPER, WRAPPER_SRC);
    fs.writeFileSync(CONSUMER, CONSUMER_SRC);
  });
  afterAll(() => fs.rmSync(FIXTURE_DIR, {recursive: true, force: true}));

  register('injects an ordered array of three bindings; the wrapper forward stays a pass-through', async () => {
    const plugin = makePlugin();
    try {
      await callHook(plugin.buildStart, ctx);

      const transformed = (await callHook(plugin.transform, ctx, CONSUMER_SRC, CONSUMER)) as {code: string} | null;
      expect(transformed, 'wrapper-consumer file must be transformed with zero config').toBeTruthy();
      const code = transformed!.code;

      // The injected value is an ARRAY of three entry bindings (one per family,
      // in declaration order), spliced before the call's closing paren.
      const arrayMatch = code.match(
        /route\(\(ctx: unknown, name: string\) => name\.length, \[(__rt_[A-Za-z0-9_]+), (__rt_[A-Za-z0-9_]+), (__rt_[A-Za-z0-9_]+)\]\)/
      );
      expect(arrayMatch, `expected a three-element binding array in:\n${code}`).toBeTruthy();
      // Three DISTINCT handles — the families must not collapse to one.
      const [, a, b, c] = arrayMatch!;
      expect(new Set([a, b, c]).size).toBe(3);

      // Every binding is imported from a real on-disk module.
      const imports = [...code.matchAll(/import \{([^}]*)\} from '(\.\.?\/[^']+\.js)'/g)];
      const importedBindings = imports.flatMap((m) => m[1].split(',').map((s) => s.trim()));
      for (const binding of [a, b, c]) {
        expect(importedBindings, `binding ${binding} must be imported`).toContain(binding);
      }
      for (const m of imports) {
        const moduleFile = path.resolve(path.dirname(CONSUMER), m[2]);
        expect(fs.existsSync(moduleFile), `injected import ${m[2]} must point at a written module`).toBe(true);
      }

      // The wrapper's three forwarded createX(undefined, undefined, fns?.[i])
      // calls are explicit pass-throughs — no injectable site, transform is null.
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
});
