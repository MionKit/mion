/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it} from 'vitest';
import {createJsonDecoder, createJsonEncoder} from '../index.ts';
import {RpcError, TypedError} from '@mionjs/core';
import '../index.ts'; // side effect: registers the mion error-class serializers

describe('mion error classes round-trip through ts-runtypes decoders', () => {
    it('RpcError<string> decodes back to a real instance', () => {
        const encode = createJsonEncoder<RpcError<string>>();
        const decode = createJsonDecoder<RpcError<string>>();
        const expected = new RpcError({publicMessage: 'boom', message: 'boom', type: 'test-error'});
        const wire = encode(new RpcError({publicMessage: 'boom', message: 'boom', type: 'test-error'}));
        const back = decode(wire!);
        expect(back instanceof RpcError).toBe(true);
        expect(back).toEqual(expected);
    });

    it('TypedError<string> decodes back to a real instance', () => {
        const encode = createJsonEncoder<TypedError<string>>();
        const decode = createJsonDecoder<TypedError<string>>();
        const back = decode(encode(new TypedError({message: 'x', type: 'typed'}))!);
        expect(back instanceof TypedError).toBe(true);
        expect((back as TypedError<string>).type).toBe('typed');
    });

    it('RpcError<string> reconstructs inside a union', () => {
        type Payload = {ok: true} | RpcError<string>;
        const encode = createJsonEncoder<Payload>();
        const decode = createJsonDecoder<Payload>();
        const back = decode(encode(new RpcError({publicMessage: 'u', message: 'u', type: 'union-error'}))!);
        expect(back instanceof RpcError).toBe(true);
    });

    it('other generic instantiations ALSO reconstruct via the class-name lane', () => {
        // Since @ts-runtypes 0.9.2 the class-serializer registry has a class-NAME fallback
        // lane, so ONE `registerClassSerializer(RpcError, …)` covers EVERY instantiation the
        // program uses, not just the registered RpcError<string> projection. A previously
        // unregistered instantiation now rebuilds a real instance (was the old upstream gap).
        const encode = createJsonEncoder<RpcError<'other', {n: number}>>();
        const decode = createJsonDecoder<RpcError<'other', {n: number}>>();
        const back = decode(encode(new RpcError({publicMessage: 'x', message: 'x', type: 'other', errorData: {n: 1}}))!);
        expect(back instanceof RpcError).toBe(true);
        expect((back as RpcError<'other', {n: number}>).type).toBe('other');
        expect((back as RpcError<'other', {n: number}>).errorData).toEqual({n: 1});
    });
});
