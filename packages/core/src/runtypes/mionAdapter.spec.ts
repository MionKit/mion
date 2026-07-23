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
    getParamNamesFromHandler,
    getParamCountFromRunType,
    reconcileParamNames,
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
        expect(getParamNamesFromHandler(async function named(ctx: unknown, a: number, b = 'x,y(z'): Promise<void> {})).toEqual([
            'a',
            'b',
        ]);
        expect(getParamNamesFromHandler((ctx: unknown, {a}: {a: number}, ...rest: string[]) => rest.length + a)).toEqual([
            'param0',
            'rest',
        ]);
    });

    // R34 — param arity is authoritative from the params tuple runtype, not source parsing.
    it('takes the param COUNT from the runtype and keeps validation alive when source parsing degrades', () => {
        // savePet has 2 params (pet, notes?). The runtype arity is 2 regardless of the handler source.
        expect(getParamCountFromRunType(resolveInjectedRunType(savePet.rtFns.paramsId))).toBe(2);
        // Simulate a minified/transpiled bundle whose handler.toString() no longer exposes the params:
        const degraded = (() => undefined) as unknown as (ctx: any, pet: Pet, notes?: string) => Pet;
        expect(getParamNamesFromHandler(degraded)).toEqual([]); // source parse yields nothing…
        const reflection = getReflectionFromMarkers(savePet.rtFns, degraded, 'savePetDegraded');
        expect(reflection.paramNames).toEqual(['param0', 'param1']); // …but arity survives via the runtype
        // and the client-side pre-validation gate (paramNames.length === 0) therefore stays active
        expect(reflection.paramNames.length).toBe(2);
    });

    it('reconcileParamNames fills/truncates parsed names to the runtype arity', () => {
        expect(reconcileParamNames(['a', 'b'], 2)).toEqual(['a', 'b']);
        expect(reconcileParamNames([], 2)).toEqual(['param0', 'param1']);
        expect(reconcileParamNames(['a'], 3)).toEqual(['a', 'param1', 'param2']);
        expect(reconcileParamNames(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
        expect(reconcileParamNames([], 0)).toEqual([]);
    });

    it('reads param names from the handler source, independent of tuple labels', () => {
        // Since @ts-runtypes 0.9.2 tuple labels ARE folded into the structural id, so
        // `[s: string]` and `[name: string]` get DISTINCT typeIds (they no longer dedupe).
        // mion still derives paramNames from the handler SOURCE (the definitive names,
        // robust to destructuring), not the runtype graph.
        const routeA = fakeRoute((ctx: unknown, s: string): void => undefined);
        const routeB = fakeRoute((ctx: unknown, name: string): void => undefined);
        const reflectionA = getReflectionFromMarkers(routeA.rtFns, routeA.handler, 'routeA');
        const reflectionB = getReflectionFromMarkers(routeB.rtFns, routeB.handler, 'routeB');
        expect(reflectionA.paramsJitHash).not.toBe(reflectionB.paramsJitHash);
        expect(reflectionA.paramNames).toEqual(['s']);
        expect(reflectionB.paramNames).toEqual(['name']);
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
