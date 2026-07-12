/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it} from 'vitest';
import {
    buildJitFnsFromMarker,
    getReflectionFromMarkers,
    getParamNamesFromHandler,
    getRTUtils,
    InjectRunTypeId,
    InjectTypeFnArgs,
    RtMarkerPayload,
} from '../index.ts';
import {getJitFnHashes, getJitUtils} from '@mionjs/core';

// A mion-route-like wrapper so the plugin injects real payloads for the tests.
type AnyHandler = (ctx: any, ...params: any[]) => any;
type HandlerParams<H extends AnyHandler> = Parameters<H> extends [any, ...infer P] ? P : [];
type HandlerReturn<H extends AnyHandler> = Awaited<ReturnType<H>>;

function fakeRoute<H extends AnyHandler>(
    handler: H,
    paramsFns?: InjectTypeFnArgs<HandlerParams<H>, 'val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke'>,
    returnFns?: InjectTypeFnArgs<HandlerReturn<H>, 'val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke'>,
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

    it('builds full method reflection (names, jit fns, hashes, flags)', () => {
        const reflection = getReflectionFromMarkers(savePet.rtFns, savePet.handler, 'savePet');
        expect(reflection.paramNames).toEqual(['pet', 'notes']);
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

    it('derives param names from the handler source (skipping ctx)', () => {
        expect(getParamNamesFromHandler(savePet.handler)).toEqual(['pet', 'notes']);
        expect(getParamNamesFromHandler((ctx: unknown) => 1)).toEqual([]);
        expect(getParamNamesFromHandler(() => 1)).toEqual([]);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        expect(getParamNamesFromHandler(async function named(ctx: unknown, a: number, b = 'x,y(z'): Promise<void> {})).toEqual([
            'a',
            'b',
        ]);
        expect(getParamNamesFromHandler((ctx: unknown, {a}: {a: number}, ...rest: string[]) => rest.length + a)).toEqual([
            'param0',
            'rest',
        ]);
    });

    it('keeps distinct param names for structurally identical tuples (dedup-safe)', () => {
        // ts-runtypes dedupes `[s: string]` and `[name: string]` into ONE runtype node
        // (tuple labels are not part of the structural id), so names must NOT come from
        // the runtype graph. These two share a typeId but keep their own paramNames.
        const routeA = fakeRoute((ctx: unknown, s: string): void => undefined);
        const routeB = fakeRoute((ctx: unknown, name: string): void => undefined);
        const reflectionA = getReflectionFromMarkers(routeA.rtFns, routeA.handler, 'routeA');
        const reflectionB = getReflectionFromMarkers(routeB.rtFns, routeB.handler, 'routeB');
        expect(reflectionA.paramsJitHash).toBe(reflectionB.paramsJitHash);
        expect(reflectionA.paramNames).toEqual(['s']);
        expect(reflectionB.paramNames).toEqual(['name']);
    });

    it('resolves full jit entries (code/hash) from the ts-runtypes cache via mion jit hashes', () => {
        // Pins the JIT_FUNCTION_IDS prefixes to the ts-runtypes per-family fn hashes:
        // if a ts-runtypes bump re-hashes families, this fails loudly (update core constants).
        const reflection = getReflectionFromMarkers(savePet.rtFns, savePet.handler, 'savePet');
        const hashes = getJitFnHashes(reflection.paramsJitHash);
        for (const key of ['isType', 'typeErrors', 'restoreFromJson', 'stringifyJson'] as const) {
            const compiled = getJitUtils().getJIT(hashes[key]);
            expect(compiled, `entry for ${key} (${hashes[key]})`).toBeDefined();
            expect(compiled!.jitFnHash).toBe(hashes[key]);
            if (!compiled!.isNoop) expect(compiled!.code.length).toBeGreaterThan(0);
        }
        expect(reflection.paramsJitFns.isType.jitFnHash).toBe(hashes.isType);
        // rebuild validate from its emitted code (the client metadata lane)
        const compiledIsType = getJitUtils().getJIT(hashes.isType)!;
        const rebuilt = new Function('utl', compiledIsType.code)(getRTUtils());
        expect(rebuilt([{name: 'rex', born: new Date(0)}, 'note'])).toBe(true);
        expect(rebuilt([{name: 7, born: new Date(0)}])).toBe(false);
    });

    it('throws a clear error when markers were not injected', () => {
        expect(() => getReflectionFromMarkers(undefined, () => 1, 'nope')).toThrow(/no injected type information/);
        expect(() => buildJitFnsFromMarker(undefined, 'x', 'nope')).toThrow(/vite plugin/);
    });
});
