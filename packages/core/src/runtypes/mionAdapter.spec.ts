/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it} from 'vitest';
import {getRTUtils, registerPureFnFactory, InjectRunTypeId, InjectTypeFnArgs} from '@mionjs/run-types';
import {
  addSerializedJitCaches,
  buildJitFnsFromMarker,
  getReflectionFromMarkers,
  getParamCountFromRunType,
  getParamsFromRunType,
  resolveInjectedRunType,
  resolveCompiledPureFn,
  RtMarkerPayload,
} from './mionAdapter.ts';
import {getJitFnHashes} from '../routerUtils.ts';

// A mion-route-like wrapper so the plugin injects real payloads for the tests.
type AnyHandler = (ctx: any, ...params: any[]) => any;
type HandlerParams<H extends AnyHandler> = Parameters<H> extends [any, ...infer P] ? P : [];
type HandlerReturn<H extends AnyHandler> = Awaited<ReturnType<H>>;

function fakeRoute<H extends AnyHandler>(
  handler: H,
  paramsFns?: InjectTypeFnArgs<HandlerParams<H>, 'val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke', 'tb', 'fb'>,
  returnFns?: InjectTypeFnArgs<HandlerReturn<H>, 'val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke', 'tb', 'fb'>,
  paramsId?: InjectRunTypeId<HandlerParams<H>>,
  returnId?: InjectRunTypeId<HandlerReturn<H>>
): {handler: H; rtFns: RtMarkerPayload} {
  return {handler, rtFns: {paramsFns, returnFns, paramsId, returnId}};
}

interface Pet {
  name: string;
  born: Date;
}

describe('mionAdapter: reflection from injected markers', () => {
  const savePet = fakeRoute((ctx: unknown, pet: Pet, notes?: string): Pet => pet);
  const fireAndForget = fakeRoute(async (ctx: unknown): Promise<void> => undefined);

  it('builds full method reflection (arity, jit fns, hashes, flags)', () => {
    const reflection = getReflectionFromMarkers(savePet.rtFns, savePet.handler, 'savePet');
    expect(reflection.paramsCount).toBe(2);
    expect(reflection.hasReturnData).toBe(true);
    expect(reflection.isAsync).toBe(false);
    expect(reflection.paramsJitHash.length).toBeGreaterThan(0);
    expect(reflection.returnJitHash.length).toBeGreaterThan(0);
    expect(reflection.paramsJitHash).not.toBe(reflection.returnJitHash);
  });

  it('produces working validate/typeErrors for the params tuple', () => {
    const reflection = getReflectionFromMarkers(savePet.rtFns, savePet.handler, 'savePet');
    expect(reflection.paramsJitFns.isType.fn!([{name: 'rex', born: new Date(0)}])).toBe(true);
    expect(reflection.paramsJitFns.isType.fn!([{name: 7, born: new Date(0)}])).toBe(false);
    const errors = reflection.paramsJitFns.typeErrors.fn!([{name: 7, born: new Date(0)}]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].path).toEqual([0, 'name']);
  });

  it('restores JSON params and stringifies returns', () => {
    const reflection = getReflectionFromMarkers(savePet.rtFns, savePet.handler, 'savePet');
    const wire = JSON.parse('[{"name":"rex","born":"1970-01-01T00:00:00.123Z"}]');
    const restored = reflection.paramsJitFns.restoreFromJson.fn!(wire) as [Pet];
    expect(restored[0].born).toBeInstanceOf(Date);
    const str = reflection.returnJitFns.stringifyJson.fn!({name: 'rex', born: new Date(123)});
    expect(str).toContain('1970-01-01T00:00:00.123Z');
  });

  it('flags async handlers and void returns', () => {
    const reflection = getReflectionFromMarkers(fireAndForget.rtFns, fireAndForget.handler, 'fireAndForget');
    expect(reflection.isAsync).toBe(true);
    expect(reflection.hasReturnData).toBe(false);
  });

  // R34 — param arity is authoritative from the params tuple runtype. Display names are no
  // longer tracked (the handler-source parsing was removed); only the count matters downstream.
  it('takes the param COUNT (arity) from the params tuple runtype', () => {
    // savePet has 2 params (pet, notes?); the runtype arity is 2 regardless of handler source.
    expect(getParamCountFromRunType(resolveInjectedRunType(savePet.rtFns.paramsId))).toBe(2);
    const reflection = getReflectionFromMarkers(savePet.rtFns, savePet.handler, 'savePet');
    expect(reflection.paramsCount).toBe(2);
    // NAMES come from the params tuple's member labels, not from parsing handler.toString()
    expect(reflection.paramNames).toEqual(['pet', 'notes']);
    // both survive when the handler source is minified away — the whole point of using
    // reflection instead of a source parse
    const degraded = (() => undefined) as unknown as (ctx: any, pet: Pet, notes?: string) => Pet;
    const degradedReflection = getReflectionFromMarkers(savePet.rtFns, degraded, 'savePetDegraded');
    expect(degradedReflection.paramsCount).toBe(2);
    expect(degradedReflection.paramNames).toEqual(['pet', 'notes']);
  });

  it('reads param names + optionality from the tuple, and copes with unlabelled members', () => {
    // labelled: `(ctx, pet: Pet, notes?: string)` -> the params tuple carries both labels
    const labelled = getParamsFromRunType(resolveInjectedRunType(savePet.rtFns.paramsId));
    expect(labelled.map((param) => param.name)).toEqual(['pet', 'notes']);
    // optionality rides along, so a consumer can tell required from optional without the handler
    expect(labelled.map((param) => param.optional)).toEqual([undefined, true]);
    // a non-tuple runtype yields no params rather than throwing
    expect(getParamsFromRunType(resolveInjectedRunType(savePet.rtFns.returnId))).toEqual([]);
  });

  // ############# compile-time binary size estimate #############
  //
  // Read off the registered cache entry (CompiledFnData.binarySizeEstimate, @mionjs/run-types
  // 0.12.1+) instead of indexing a tuple slot by position.
  //
  // Still assert the value is PRESENT and plausible, not merely that the read compiles: if the
  // field ever stops being populated the read returns undefined, every cold binary buffer
  // quietly reverts to MIN_COLD_START_BYTES, and nothing else in the suite would notice. A
  // silent performance regression needs a loud test.
  it('carries the compile-time binary size estimate on the reflection', () => {
    const reflection = getReflectionFromMarkers(savePet.rtFns, savePet.handler, 'savePet');
    // a small object: a real byte count, not a placeholder or a whole default buffer
    expect(reflection.returnBinarySizeEstimate).toBeDefined();
    expect(reflection.returnBinarySizeEstimate).toBeGreaterThan(0);
    expect(reflection.returnBinarySizeEstimate).toBeLessThan(4096);
    expect(reflection.paramsBinarySizeEstimate).toBeGreaterThan(0);
  });

  it('resolves full jit entries (code/hash) from the ts-runtypes cache via mion jit hashes', () => {
    // JIT_FUNCTION_IDS is derived from @ts-runtypes getFnHash (same source the emitter uses),
    // so this verifies the derived `<fnHash>_<typeId>` keys resolve to real emitted entries.
    // A version bump re-hashes typeIds but getFnHash tracks it — no manual refresh needed.
    const reflection = getReflectionFromMarkers(savePet.rtFns, savePet.handler, 'savePet');
    const hashes = getJitFnHashes(reflection.paramsJitHash);
    const utl = getRTUtils();
    for (const key of ['isType', 'typeErrors', 'restoreFromJson', 'stringifyJson'] as const) {
      const compiled = utl.getRT(hashes[key]);
      expect(compiled, `entry for ${key} (${hashes[key]})`).toBeDefined();
      expect(compiled!.rtFnHash).toBe(hashes[key]);
      // mion restricts emitMode to 'code' | 'both', so a non-noop entry ALWAYS carries a body
      if (!compiled!.isNoop) expect(compiled!.code, `code for ${key}`).toBeTruthy();
    }
    expect(reflection.paramsJitFns.isType.rtFnHash).toBe(hashes.isType);
    // rebuild validate from its emitted code (the client metadata lane)
    const compiledIsType = utl.getRT(hashes.isType)!;
    // Rebuilding a compiled fn from its emitted code IS the client metadata lane
    // this test covers.
    // oxlint-disable-next-line typescript/no-implied-eval
    const rebuilt = new Function('utl', compiledIsType.code!)(utl);
    expect(rebuilt([{name: 'rex', born: new Date(0)}, 'note'])).toBe(true);
    expect(rebuilt([{name: 7, born: new Date(0)}])).toBe(false);
  });

  it('throws a clear error when markers were not injected', () => {
    expect(() => getReflectionFromMarkers(undefined, () => 1, 'nope')).toThrow(/no injected type information/);
    expect(() => buildJitFnsFromMarker(undefined, 'x', 'nope')).toThrow(/vite plugin/);
  });
});

// mion resolves jit hashes and pure fns DIRECTLY from the @mionjs/run-types runtime cache — there
// is no wrapper and no installable backend. A lookup that isn't in the cache is a plain miss
// (undefined), never a throw. Pinned here from core's own test project.
describe('direct ts-runtypes cache resolution', () => {
  it('unknown jit/pure lookups are plain misses (undefined), never throw', () => {
    expect(getRTUtils().getRT('isType_does_not_exist')).toBeUndefined();
    expect(resolveCompiledPureFn('ns', 'missing')).toBeUndefined();
  });

  it('resolves a pure fn registered through @ts-runtypes', () => {
    registerPureFnFactory('mionjs::adapterSpecFn', () => () => 42);
    expect(resolveCompiledPureFn('mionjs', 'adapterSpecFn')).toBeTruthy();
  });
});

// What the client does with a methods-metadata payload. These pin the RESTORE half of the wire
// contract — the half that used to drop data on the floor.
describe('addSerializedJitCaches (client restore lane)', () => {
  it('rebuilds a pure fn under the AUTHOR\'s parameter names, not a hardcoded "utl"', () => {
    // A factory written as `(rtu) => ...` records paramNames: ['rtu']. Binding the single
    // parameter as 'utl' instead would leave the body referencing an undeclared `rtu`.
    addSerializedJitCaches(
      {},
      {
        specns: {
          namedParam: {
            namespace: 'specns',
            fnName: 'namedParam',
            bodyHash: 'specNamedParam',
            paramNames: ['rtu'],
            code: 'return () => typeof rtu;',
            pureFnDependencies: [],
          },
        },
      }
    );
    const restored = getRTUtils().getPureFnByKey('specns::namedParam');
    expect(restored).toBeDefined();
    expect(restored!()).toBe('object'); // resolves `rtu` -> it was bound, not undeclared
  });

  it('restores an alwaysThrow entry so it surfaces its build-time message, not a TypeError', () => {
    // alwaysThrow entries carry no code — only the diagnostic, delivered through a throwing
    // createRTFn. Without alwaysThrowMessage on the wire there is neither code nor factory, so
    // materializeRTFn bails, leaves `fn` unset, and the caller gets "fn is not a function".
    // With it, upstream's contract surfaces the real message at materialization time.
    const message = '[RT9999] unsupported leaf (at spec.ts:1:1)';
    addSerializedJitCaches(
      {
        spec_always_throw: {
          typeName: 'SpecAlwaysThrow',
          fnID: 'val',
          familyTag: 'val',
          rtFnHash: 'spec_always_throw',
          args: {vλl: 'v'},
          defaultParamValues: {vλl: 'v'},
          alwaysThrowMessage: message,
        },
      },
      {}
    );
    expect(() => getRTUtils().getRT('spec_always_throw')).toThrow(message);
  });

  it('round-trips familyTag, which upstream gates type lookups on', () => {
    addSerializedJitCaches(
      {
        spec_family_tag: {
          typeName: 'SpecFamilyTag',
          // fnID and familyTag genuinely differ for JSON composites: the composite
          // borrows its host's fnID while familyTag names the emitting family
          fnID: 'pj',
          familyTag: 'jeMU',
          rtFnHash: 'spec_family_tag',
          args: {vλl: 'v'},
          defaultParamValues: {vλl: 'v'},
          code: 'return (v) => v;',
        },
      },
      {}
    );
    const entry = getRTUtils().getRT('spec_family_tag');
    expect(entry?.familyTag).toBe('jeMU');
    expect(entry?.fnID).toBe('pj');
  });
});
