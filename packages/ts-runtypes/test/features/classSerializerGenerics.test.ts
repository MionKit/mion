// Generic classes in the class-serializer registry. Generics are ERASED at
// runtime — every instantiation of `WireError<…>` is the SAME class object —
// so ONE `registerClassSerializer(WireError, …)` must reconstruct EVERY
// instantiation the program uses. Each instantiation hashes to a different
// structural type id; what they share is the class name, which the emitter
// bakes into the lookup (`utl.getClassSerializer('<id>', '<className>')`) and
// the registry indexes as its fallback lane.
//
// Pairing rule (CLAUDE.md): getRunTypeId is exercised in BOTH call shapes and
// asserted to converge for equivalent T.

import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  createJsonEncoderFn,
  createJsonDecoderFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
  registerClassSerializer,
  getRunTypeId,
} from '@mionjs/run-types';
import {
  clearClassSerializers,
  unregisterClassSerializer,
  getClassSerializer,
  isClassSerializerRegistered,
  registerClassSerializer as registerDirect,
} from '../../src/runtypes/classSerializerRegistry.ts';

// An RpcError-like generic wire class: literal-typed code + typed payload.
// Constructor takes args, so `deserialize` is required at registration.
class WireError<Code extends string, Data = unknown> {
  constructor(
    public readonly code: Code,
    public readonly reason: string,
    public readonly data?: Data
  ) {}
  describe(): string {
    return `${this.code}: ${this.reason}`;
  }
}

// The ENCOURAGED form: no explicit type argument. T infers from the
// constructor (instantiated to its constraint/defaults, here
// WireError<string, unknown>), and the class-name lane makes the inferred
// instantiation choice irrelevant — one bare registration covers every
// instantiation. (The explicit `registerClassSerializer<WireError<'x'>>`
// form still works — see the re-registration case below — but is only a
// leftover from the pre-name-lane API where the instantiation id was the
// sole key.)
function registerWireError(): void {
  registerClassSerializer(WireError, {
    deserialize: (data) => new WireError(data.code, data.reason, data.data),
  });
}

afterEach(() => {
  clearClassSerializers();
  vi.restoreAllMocks();
});

describe('classSerializer / generic classes — one registration covers every instantiation', () => {
  it('different instantiations hash to different ids, both getRunTypeId call shapes agree', () => {
    // static form
    const wideId = getRunTypeId<WireError<string>>();
    const narrowId = getRunTypeId<WireError<'other', {n: number}>>();
    expect(wideId).not.toBe(narrowId); // the very reason the name lane exists
    // reflect form converges with the static form for equivalent T
    const sample: WireError<string> = new WireError('x', 'msg');
    expect(getRunTypeId(sample)).toBe(wideId);
  });

  it('(static) a NON-registered instantiation reconstructs through JSON via the name lane', () => {
    registerWireError(); // registered as WireError<string> only
    const encode = createJsonEncoderFn<WireError<'other', {n: number}>>();
    const decode = createJsonDecoderFn<WireError<'other', {n: number}>>();

    const decoded = decode(encode(new WireError('other', 'boom', {n: 4})) as string) as WireError<'other', {n: number}>;
    expect(decoded).toBeInstanceOf(WireError);
    expect(decoded.code).toBe('other');
    expect(decoded.reason).toBe('boom');
    expect(decoded.data).toEqual({n: 4});
    expect(decoded.describe()).toBe('other: boom');
  });

  it('(reflect) value-inferred instantiation reconstructs through JSON too', () => {
    registerWireError();
    const sample = new WireError<'nf', {id: number}>('nf', 'seed');
    const encode = createJsonEncoderFn(sample);
    const decode = createJsonDecoderFn(sample);

    const decoded = decode(encode(new WireError('nf', 'missing', {id: 7})) as string) as WireError<'nf', {id: number}>;
    expect(decoded).toBeInstanceOf(WireError);
    expect(decoded.data).toEqual({id: 7});
  });

  it('a NON-registered instantiation reconstructs through BINARY', () => {
    registerWireError();
    const encode = createBinaryEncoderFn<WireError<'bin', {bytes: number}>>();
    const decode = createBinaryDecoderFn<WireError<'bin', {bytes: number}>>();

    const decoded = decode(encode(new WireError('bin', 'wire', {bytes: 3}))) as WireError<'bin', {bytes: number}>;
    expect(decoded).toBeInstanceOf(WireError);
    expect(decoded.code).toBe('bin');
    expect(decoded.data).toEqual({bytes: 3});
  });

  it('a union containing a non-registered instantiation discriminates AND reconstructs', () => {
    registerWireError();
    type Result = WireError<'not-found', {id: number}> | {ok: true};
    const encode = createJsonEncoderFn<Result>();
    const decode = createJsonDecoderFn<Result>();

    const err = decode(encode(new WireError('not-found', 'missing', {id: 9})) as string) as WireError<'not-found', {id: number}>;
    expect(err).toBeInstanceOf(WireError);
    expect(err.data).toEqual({id: 9});

    const ok = decode(encode({ok: true}) as string);
    expect(ok).toEqual({ok: true});
    expect(ok).not.toBeInstanceOf(WireError);
  });

  it('bare registration (encouraged form) covers other instantiations via the name lane', () => {
    // No type argument at all: T infers from the constructor. WHICH
    // instantiation the compiler picks is incidental by design — coverage
    // comes from the class-name lane, so nothing here asserts the injected
    // exact id. This is the form the docs encourage.
    registerClassSerializer(WireError, {
      deserialize: (data) => new WireError(data.code, data.reason, data.data),
    });
    expect(isClassSerializerRegistered(WireError)).toBe(true);
    // the name lane routes independently of any instantiation id
    expect(getClassSerializer('nonexistent-id', 'WireError')).toBeDefined();
    // and a concrete instantiation reconstructs end-to-end
    const decode = createJsonDecoderFn<WireError<'bare', {ok: boolean}>>();
    const encode = createJsonEncoderFn<WireError<'bare', {ok: boolean}>>();
    const decoded = decode(encode(new WireError('bare', 'works', {ok: true})) as string) as WireError<'bare', {ok: boolean}>;
    expect(decoded).toBeInstanceOf(WireError);
    expect(decoded.data).toEqual({ok: true});
  });

  it('re-registering under a SECOND instantiation keeps BOTH ids routable (no eviction) and last handlers win', () => {
    // EXPLICIT instantiations on purpose: this case pins the exact-id lane's
    // multi-key behavior, so both registrations name their instantiation.
    registerClassSerializer<WireError<string>>(WireError, {
      deserialize: (data) => new WireError(data.code, data.reason, data.data),
    });
    expect(isClassSerializerRegistered(WireError)).toBe(true);
    const wideId = getRunTypeId<WireError<string>>() as unknown as string;
    const narrowId = getRunTypeId<WireError<'other', {n: number}>>() as unknown as string;

    // second registration, different instantiation, new deserialize
    let secondHandlerRan = false;
    registerClassSerializer<WireError<'other', {n: number}>>(WireError, {
      deserialize: (data) => {
        secondHandlerRan = true;
        return new WireError(data.code, data.reason, data.data);
      },
    });

    // the OLD registration's exact id must still be routable (the pre-fix
    // registry deleted it here), and both ids resolve to the SAME entry
    const wideEntry = getClassSerializer(wideId);
    const narrowEntry = getClassSerializer(narrowId);
    expect(wideEntry).toBeDefined();
    expect(narrowEntry).toBeDefined();
    expect(wideEntry).toBe(narrowEntry);

    // last-registered handlers win for every key
    const decode = createJsonDecoderFn<WireError<string>>();
    const encode = createJsonEncoderFn<WireError<string>>();
    const decoded = decode(encode(new WireError('x', 'y')) as string) as WireError<string>;
    expect(decoded).toBeInstanceOf(WireError);
    expect(secondHandlerRan).toBe(true);
  });

  it('two DIFFERENT classes sharing a name disable the name lane (warn once), exact ids still route', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const DupA = class Dup {
      a = 1;
    };
    const DupB = class Dup {
      b = 2;
    };
    expect(DupA.name).toBe('Dup');
    expect(DupB.name).toBe('Dup');
    // manual bare-string-id escape hatch (no plugin id needed for a unit-level check)
    registerDirect(DupA as any, {deserialize: (data: any) => Object.assign(new DupA(), data)}, 'IdDupA' as any);
    registerDirect(DupB as any, {deserialize: (data: any) => Object.assign(new DupB(), data)}, 'IdDupB' as any);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('"Dup"');

    // exact ids keep routing
    expect(getClassSerializer('IdDupA')?.cls).toBe(DupA);
    expect(getClassSerializer('IdDupB')?.cls).toBe(DupB);
    // the ambiguous name lane routes nothing
    expect(getClassSerializer('someOtherId', 'Dup')).toBeUndefined();

    // removing one of the colliding classes makes the name routable again
    unregisterClassSerializer(DupA as any);
    expect(getClassSerializer('IdDupA')).toBeUndefined();
    expect(getClassSerializer('someOtherId', 'Dup')?.cls).toBe(DupB);
  });

  it('unregisterClassSerializer drops every id the class was registered under', () => {
    registerWireError();
    registerClassSerializer<WireError<'other', {n: number}>>(WireError, {
      deserialize: (data) => new WireError(data.code, data.reason, data.data),
    });
    const wideId = getRunTypeId<WireError<string>>() as unknown as string;
    const narrowId = getRunTypeId<WireError<'other', {n: number}>>() as unknown as string;
    unregisterClassSerializer(WireError);
    expect(getClassSerializer(wideId)).toBeUndefined();
    expect(getClassSerializer(narrowId)).toBeUndefined();
    expect(getClassSerializer(narrowId, 'WireError')).toBeUndefined();
    expect(isClassSerializerRegistered(WireError)).toBe(false);
  });
});
