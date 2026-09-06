/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it} from 'vitest';
import {createJsonDecoderFn, createJsonEncoderFn, registerClassSerializer} from '@mionjs/run-types';
import {RpcError, TypedError, FatalError, isFatalError} from './errors.ts'; // side effect: registers the mion error-class serializers
import {HeadersSubset} from './headers.ts'; // side effect: registers the HeadersSubset serializer

describe('mion error classes round-trip through mion decoders', () => {
  it('RpcError<string> decodes back to a real instance', () => {
    const encode = createJsonEncoderFn<RpcError<string>>();
    const decode = createJsonDecoderFn<RpcError<string>>();
    const expected = new RpcError({publicMessage: 'boom', message: 'boom', type: 'test-error'});
    const wire = encode(new RpcError({publicMessage: 'boom', message: 'boom', type: 'test-error'}));
    const back = decode(wire!);
    expect(back instanceof RpcError).toBe(true);
    expect(back).toEqual(expected);
  });

  it('a FatalError returned under a declared RpcError<string> decodes as a plain RpcError', () => {
    const encode = createJsonEncoderFn<RpcError<string>>();
    const decode = createJsonDecoderFn<RpcError<string>>();
    const wire = encode(new FatalError({publicMessage: 'halt', message: 'halt', type: 'not-authorized'}));
    expect(wire).not.toContain('isFatal');
    const back = decode(wire!);
    expect(back instanceof RpcError).toBe(true);
    expect(back instanceof FatalError).toBe(false);
    expect(isFatalError(back)).toBe(false);
    expect(back).toEqual(new RpcError({publicMessage: 'halt', message: 'halt', type: 'not-authorized'}));
  });

  it('a subclass declared next to its base, AuthError | RpcError<string>, rides its own arm and comes back as itself', () => {
    class AuthError extends RpcError<'not-authorized'> {
      readonly scope: string;
      constructor(scope: string) {
        super({publicMessage: 'Not Authorized', type: 'not-authorized', statusCode: 401});
        this.scope = scope;
      }
    }
    registerClassSerializer(AuthError, {deserialize: (d) => new AuthError(d.scope)});
    type Gate = string | AuthError | RpcError<string>;
    const encode = createJsonEncoderFn<Gate>();
    const decode = createJsonDecoderFn<Gate>();
    const wire = encode(new AuthError('admin'))!;
    expect(wire).toContain('"scope":"admin"');
    const back = decode(wire) as AuthError;
    expect(back instanceof AuthError).toBe(true);
    expect(back.scope).toBe('admin');
    expect(back.statusCode).toBe(401);
    const soft = decode(encode(new RpcError({publicMessage: 'soft', type: 'soft'}))!) as RpcError<string>;
    expect(soft instanceof RpcError).toBe(true);
    expect(soft instanceof AuthError).toBe(false);
  });

  it('a declared FatalError<string> decodes through its own lane, back to a real FatalError', () => {
    const encode = createJsonEncoderFn<FatalError<string>>();
    const decode = createJsonDecoderFn<FatalError<string>>();
    const wire = encode(new FatalError({publicMessage: 'halt', message: 'halt', type: 'not-authorized'}));
    expect(wire).not.toContain('isFatal');
    const back = decode(wire!);
    expect(back instanceof FatalError).toBe(true);
    expect(back instanceof RpcError).toBe(true);
    expect(isFatalError(back)).toBe(true);
    expect((back as RpcError<string>).type).toBe('not-authorized');
    expect(back).toEqual(new FatalError({publicMessage: 'halt', message: 'halt', type: 'not-authorized'}));
  });

  it('TypedError<string> decodes back to a real instance', () => {
    const encode = createJsonEncoderFn<TypedError<string>>();
    const decode = createJsonDecoderFn<TypedError<string>>();
    const back = decode(encode(new TypedError({message: 'x', type: 'typed'}))!);
    expect(back instanceof TypedError).toBe(true);
    expect((back as TypedError<string>).type).toBe('typed');
  });

  it('RpcError<string> reconstructs inside a union', () => {
    type Payload = {ok: true} | RpcError<string>;
    const encode = createJsonEncoderFn<Payload>();
    const decode = createJsonDecoderFn<Payload>();
    const back = decode(encode(new RpcError({publicMessage: 'u', message: 'u', type: 'union-error'}))!);
    expect(back instanceof RpcError).toBe(true);
  });

  it('keeps the internal `message` and `name` OFF the wire (public envelope only)', () => {
    // TypedError/RpcError declare message/name as optional + @nonEnumerable and set them
    // non-enumerable at runtime, so RunTypes' enumerability guard drops them from the
    // serialized envelope (mion exposes `publicMessage`, not the internal `message`).
    const encode = createJsonEncoderFn<RpcError<string>>();
    const wire = encode(
      new RpcError({publicMessage: 'safe', message: 'internal-secret', type: 'e', errorData: {x: 1}, id: 'id9'})
    )!;
    const parsed = JSON.parse(wire);
    expect(parsed.message).toBeUndefined();
    expect(parsed.name).toBeUndefined();
    expect(wire).not.toContain('internal-secret');
    // the public envelope IS present and matches native JSON.stringify's own-enumerable shape
    expect(parsed.publicMessage).toBe('safe');
    expect(parsed.type).toBe('e');
    expect(parsed['mion@isΣrrθr']).toBe(true);
    expect(parsed.errorData).toEqual({x: 1});
    expect(parsed.id).toBe('id9');
  });

  it('other generic instantiations ALSO reconstruct via the class-name lane', () => {
    // Since RunTypes 0.9.2 the class-serializer registry has a class-NAME fallback
    // lane, so ONE `registerClassSerializer(RpcError, …)` covers EVERY instantiation the
    // program uses, not just the registered RpcError<string> projection. A previously
    // unregistered instantiation now rebuilds a real instance (was the old upstream gap).
    const encode = createJsonEncoderFn<RpcError<'other', {n: number}>>();
    const decode = createJsonDecoderFn<RpcError<'other', {n: number}>>();
    const back = decode(encode(new RpcError({publicMessage: 'x', message: 'x', type: 'other', errorData: {n: 1}}))!);
    expect(back instanceof RpcError).toBe(true);
    expect((back as RpcError<'other', {n: number}>).type).toBe('other');
    expect((back as RpcError<'other', {n: number}>).errorData).toEqual({n: 1});
  });

  // HeadersSubset takes its headers map in the constructor, so the automatic
  // zero-arg `new HeadersSubset()` is unavailable and the registration must
  // carry a `deserialize`. The router's dispatch does `result instanceof
  // HeadersSubset`, so the decoded value has to be a real instance.
  it('HeadersSubset decodes back to a real instance', () => {
    const encode = createJsonEncoderFn<HeadersSubset<'authorization', 'x-trace'>>();
    const decode = createJsonDecoderFn<HeadersSubset<'authorization', 'x-trace'>>();
    const wire = encode(new HeadersSubset({authorization: 'Bearer t', 'x-trace': 'abc'}));
    const back = decode(wire!);
    expect(back instanceof HeadersSubset).toBe(true);
    expect(back.headers).toEqual({authorization: 'Bearer t', 'x-trace': 'abc'});
  });

  it('another HeadersSubset instantiation ALSO reconstructs via the class-name lane', () => {
    const encode = createJsonEncoderFn<HeadersSubset<'accept'>>();
    const decode = createJsonDecoderFn<HeadersSubset<'accept'>>();
    const back = decode(encode(new HeadersSubset({accept: 'application/json'}))!);
    expect(back instanceof HeadersSubset).toBe(true);
    expect(back.headers).toEqual({accept: 'application/json'});
  });
});
