/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it} from 'vitest';
import {getRTUtils, InjectRunTypeId, InjectTypeFnArgs} from '@ts-runtypes/core';
import {
    buildJitFnsFromMarker,
    getReflectionFromMarkers,
    getParamCountFromRunType,
    resolveInjectedRunType,
    RtMarkerPayload,
} from './mionAdapter.ts';
import {getJitFnHashes} from '../routerUtils.ts';
import {resolveJIT} from './rtResolver.ts';

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
        expect(reflection.paramsJitFns.isType.fn([{name: 'rex', born: new Date(0)}])).toBe(true);
        expect(reflection.paramsJitFns.isType.fn([{name: 7, born: new Date(0)}])).toBe(false);
        const errors = reflection.paramsJitFns.typeErrors.fn([{name: 7, born: new Date(0)}]);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].path).toEqual([0, 'name']);
    });

    it('restores JSON params and stringifies returns', () => {
        const reflection = getReflectionFromMarkers(savePet.rtFns, savePet.handler, 'savePet');
        const wire = JSON.parse('[{"name":"rex","born":"1970-01-01T00:00:00.123Z"}]');
        const restored = reflection.paramsJitFns.restoreFromJson.fn(wire) as [Pet];
        expect(restored[0].born).toBeInstanceOf(Date);
        const str = reflection.returnJitFns.stringifyJson.fn({name: 'rex', born: new Date(123)});
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
        // arity survives even when the handler source is minified away (no source parse involved)
        const degraded = (() => undefined) as unknown as (ctx: any, pet: Pet, notes?: string) => Pet;
        const degradedReflection = getReflectionFromMarkers(savePet.rtFns, degraded, 'savePetDegraded');
        expect(degradedReflection.paramsCount).toBe(2);
    });

    it('resolves full jit entries (code/hash) from the ts-runtypes cache via mion jit hashes', () => {
        // JIT_FUNCTION_IDS is derived from @ts-runtypes getFnHash (same source the emitter uses),
        // so this verifies the derived `<fnHash>_<typeId>` keys resolve to real emitted entries.
        // A version bump re-hashes typeIds but getFnHash tracks it — no manual refresh needed.
        const reflection = getReflectionFromMarkers(savePet.rtFns, savePet.handler, 'savePet');
        const hashes = getJitFnHashes(reflection.paramsJitHash);
        for (const key of ['isType', 'typeErrors', 'restoreFromJson', 'stringifyJson'] as const) {
            const compiled = resolveJIT(hashes[key]);
            expect(compiled, `entry for ${key} (${hashes[key]})`).toBeDefined();
            expect(compiled!.jitFnHash).toBe(hashes[key]);
            if (!compiled!.isNoop) expect(compiled!.code.length).toBeGreaterThan(0);
        }
        expect(reflection.paramsJitFns.isType.jitFnHash).toBe(hashes.isType);
        // rebuild validate from its emitted code (the client metadata lane)
        const compiledIsType = resolveJIT(hashes.isType)!;
        const rebuilt = new Function('utl', compiledIsType.code)(getRTUtils());
        expect(rebuilt([{name: 'rex', born: new Date(0)}, 'note'])).toBe(true);
        expect(rebuilt([{name: 7, born: new Date(0)}])).toBe(false);
    });

    it('throws a clear error when markers were not injected', () => {
        expect(() => getReflectionFromMarkers(undefined, () => 1, 'nope')).toThrow(/no injected type information/);
        expect(() => buildJitFnsFromMarker(undefined, 'x', 'nope')).toThrow(/vite plugin/);
    });
});
