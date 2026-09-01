// Multi-slot injection — a call whose signature carries SEVERAL injection-marker
// parameters injects at every one of them, not just the trailing slot. This is
// mion's per-side route() shape: a params-side InjectTypeFnArgs, a response-side
// InjectTypeFnArgs, and a separate InjectRunTypeId reflection marker, with a
// non-marker `opts` gap between them.
//
// The transform composes one positional insertion covering every marker slot,
// padding the non-marker gap with `undefined`. It also re-exercises the
// zero-config gate — the consumer never names '@mionjs/run-types'.
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import runtypesRollup from '../src/runtypes/rollup.ts';
import {BIN, hasBinary, writeMarkerPackage} from './helpers/inline.ts';

const FIXTURE_DIR = path.resolve(__dirname, 'tmp-wrapper-multi-slot');
const WRAPPER = path.join(FIXTURE_DIR, 'wrapper.ts');
const CONSUMER = path.join(FIXTURE_DIR, 'consumer.ts');
const OUT_DIR = path.join(FIXTURE_DIR, '__runtypes');

const TSCONFIG_SRC = JSON.stringify({
  compilerOptions: {target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true, types: []},
  include: ['*.ts'],
});

// route() declares FOUR trailing parameters: a non-marker `opts`, then the
// params-side marker (validator + JSON decoder), the response-side marker (JSON
// encoder), and a reflection marker for the params runtype graph. Each marker
// param is forwarded to its factory / resolver.
const WRAPPER_SRC = `import {createGetValidationErrorsFn, createJsonDecoderFn, createJsonEncoderFn, getRunType} from '@mionjs/run-types';
import type {InjectTypeFnArgs, InjectRunTypeId} from '@mionjs/run-types';

type AnyHandler = (...args: any[]) => unknown;

export function route<H extends AnyHandler>(
  handler: H,
  opts?: {readonly path?: string},
  paramsFns?: InjectTypeFnArgs<Parameters<H>, 'verr', 'jsonDecoder'>,
  responseFns?: InjectTypeFnArgs<ReturnType<H>, 'jsonEncoder'>,
  meta?: InjectRunTypeId<Parameters<H>>,
) {
  const getErrors = createGetValidationErrorsFn(undefined, undefined, paramsFns?.[0] as never);
  const decodeParams = createJsonDecoderFn(undefined, undefined, paramsFns?.[1] as never);
  const encodeResponse = createJsonEncoderFn(undefined, undefined, responseFns as never);
  const paramsNode = getRunType(undefined, meta as never);
  return {handler, opts, getErrors, decodeParams, encodeResponse, paramsNode};
}
`;

const CONSUMER_SRC = `import {route} from './wrapper';

export const lenRoute = route((name: string) => name.length);
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
  return runtypesRollup({binary: BIN, cwd: FIXTURE_DIR, tsconfig: 'tsconfig.json', genDir: OUT_DIR}) as any;
}

describe('multi-slot injection (several marker params on one call)', () => {
  const register = hasBinary() ? it : it.skip;

  beforeAll(() => {
    fs.rmSync(FIXTURE_DIR, {recursive: true, force: true});
    fs.mkdirSync(FIXTURE_DIR, {recursive: true});
    fs.writeFileSync(path.join(FIXTURE_DIR, 'tsconfig.json'), TSCONFIG_SRC);
    writeMarkerPackage(FIXTURE_DIR);
    fs.writeFileSync(WRAPPER, WRAPPER_SRC);
    fs.writeFileSync(CONSUMER, CONSUMER_SRC);
  });
  afterAll(() => fs.rmSync(FIXTURE_DIR, {recursive: true, force: true}));

  register(
    'injects every marker slot: the non-marker gap pads with undefined, params is a 2-array, response and meta are scalars',
    async () => {
      const plugin = makePlugin();
      try {
        await callHook(plugin.buildStart, ctx);

        const transformed = (await callHook(plugin.transform, ctx, CONSUMER_SRC, CONSUMER)) as {code: string} | null;
        expect(transformed, 'consumer must transform with zero config').toBeTruthy();
        const code = transformed!.code;

        // opts (index 1) is a non-marker gap → undefined; paramsFns (index 2) →
        // a 2-element array; responseFns (index 3) → a scalar; meta (index 4) →
        // a bare reflection id. All four slots present, in order.
        const m = code.match(
          /route\(\(name: string\) => name\.length, undefined, \[(__rt_[A-Za-z0-9_]+), (__rt_[A-Za-z0-9_]+)\], (__rt_[A-Za-z0-9_]+), (__rt_[A-Za-z0-9_]+)\)/
        );
        expect(m, `expected the composed multi-slot injection in:\n${code}`).toBeTruthy();
        const [, pVerr, pDec, resp, meta] = m!;
        // The five injected bindings are all distinct handles.
        expect(new Set([pVerr, pDec, resp, meta]).size).toBe(4);

        // Every injected binding resolves to a real on-disk module import.
        const imports = [...code.matchAll(/import \{([^}]*)\} from '(\.\.?\/[^']+\.js)'/g)];
        const imported = imports.flatMap((im) => im[1].split(',').map((s) => s.trim()));
        for (const binding of [pVerr, pDec, resp, meta]) {
          expect(imported, `binding ${binding} must be imported`).toContain(binding);
        }
        for (const im of imports) {
          expect(fs.existsSync(path.resolve(path.dirname(CONSUMER), im[2])), `module ${im[2]} must exist`).toBe(true);
        }

        // The wrapper's forwarded factory calls are all pass-throughs.
        const wrapperResult = await callHook(plugin.transform, ctx, WRAPPER_SRC, WRAPPER);
        expect(wrapperResult, 'wrapper forwards must stay untouched (pass-through)').toBeNull();
      } finally {
        try {
          await callHook(plugin.buildEnd, ctx);
        } catch {
          // best-effort teardown
        }
      }
    }
  );
});
