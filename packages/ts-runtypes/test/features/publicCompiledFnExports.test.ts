import {describe, it, expect} from 'vitest';
// Everything below is imported from the PACKAGE BARREL (`@ts-runtypes/core`), not
// from source relative paths — the whole point of this suite is to pin that the
// compiled-fn data model + reconstruction helpers are reachable from the public
// surface, so a consumer shipping compiled functions over the wire (mion router →
// client is the concrete case) can consume ts-runtypes instead of reimplementing
// the structs. If any of these stops being exported the import itself fails.
import {
  getRTUtils,
  getRTFnCaches,
  buildFactoryFromCode,
  buildPureFnFactoryFromCode,
  entryCode,
  type RTUtils,
  type CompiledFnData,
  type CompiledTypeFn,
  type InitializedTypeFn,
  type CompiledFnArgs,
  type CompiledPureFunction,
  type PureFunctionData,
  type AnyFn,
} from '@ts-runtypes/core';

describe('public compiled-fn exports — reachable + reconstructable from the package barrel', () => {
  // The closure-free wire form a server would serialize and send: `code` is the
  // factory body (`(utl) => (v) => …`), everything else is plain data.
  const wire: CompiledFnData = {
    typeName: 'string',
    fnID: 'it',
    familyTag: 'it',
    rtFnHash: 'publicexports_string',
    args: {vλl: 'v'},
    defaultParamValues: {vλl: 'v'},
    isNoop: false,
    code: "return function (v) { return typeof v === 'string'; };",
    rtDependencies: [],
    pureFnDependencies: [],
  };

  it('reconstructs a type fn from wire `code` and materialises it via addToRTCache + getRT', () => {
    // client side: restore the factory from `code`, assemble the runtime
    // CompiledTypeFn, write it back — all through public API only.
    const restored: CompiledTypeFn = {...wire, createRTFn: buildFactoryFromCode(wire.code!)};
    const utils: RTUtils = getRTUtils();
    utils.addToRTCache(restored);

    const entry: InitializedTypeFn | undefined = utils.getRT(wire.rtFnHash);
    expect(entry).toBeDefined();
    expect(entry!.fn('hello')).toBe(true);
    expect(entry!.fn(123)).toBe(false);
    // getRTFn is the fn-only convenience the todo's snippet folds into `.fn`.
    expect(utils.getRTFn(wire.rtFnHash)('world')).toBe(true);
  });

  it('entryCode returns the body verbatim for a code-mode entry and derives it for a functions-mode entry', () => {
    // code-mode: `code` present → returned verbatim.
    expect(entryCode(wire)).toBe(wire.code);

    // functions-mode: no `code`, a live `createRTFn` closure → derive the body
    // from its source, then reconstruct an equivalent validator from it.
    const live: CompiledTypeFn = {
      typeName: 'number',
      fnID: 'it',
      familyTag: 'it',
      rtFnHash: 'publicexports_number',
      args: {vλl: 'v'},
      defaultParamValues: {vλl: 'v'},
      createRTFn: (_utl: RTUtils) => {
        return function (v: unknown) {
          return typeof v === 'number';
        };
      },
    };
    const derived = entryCode(live);
    expect(derived).toContain('number');
    const rebuilt = buildFactoryFromCode(derived)(getRTUtils());
    expect(rebuilt(7)).toBe(true);
    expect(rebuilt('7')).toBe(false);
  });

  it('reconstructs a pure fn from wire `code` via buildPureFnFactoryFromCode + addPureFn', () => {
    // The pure-fn lane twin of buildFactoryFromCode: the factory takes `utl`
    // and returns the pure fn. PureFunctionData / CompiledPureFunction are the
    // param types of the already-public RTUtils.addPureFn.
    const data: PureFunctionData = {namespace: 'consumer', fnName: 'inc', bodyHash: 'h1', paramNames: ['utl']};
    const compiled: CompiledPureFunction = {...data, code: 'return function (x) { return x + 1; };'};

    const factory = buildPureFnFactoryFromCode(compiled.paramNames, compiled.code!);
    const fn = factory(getRTUtils());
    expect(fn(41)).toBe(42);

    // and the reconstructed CompiledPureFunction is accepted by the public write-back.
    getRTUtils().addPureFn('consumer::inc', {...compiled, createPureFn: factory});
    expect(getRTFnCaches().pureFnsCache['consumer::inc']).toBeDefined();
  });

  it('CompiledFnArgs and AnyFn are nameable at the type level from the barrel', () => {
    const args: CompiledFnArgs = {vλl: 'v', extraParam: 'extraName'};
    expect(args.vλl).toBe('v');
    expect(args.extraParam).toBe('extraName');
    const anyFn: AnyFn = (...xs: unknown[]) => xs.length;
    expect(anyFn(1, 2)).toBe(2);
  });
});
