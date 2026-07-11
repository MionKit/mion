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
    resolveInjectedRunType,
    getParamNamesFromRunType,
    InjectRunTypeId,
    InjectTypeFnArgs,
    RtMarkerPayload,
} from '../index.ts';

// A mion-route-like wrapper so the plugin injects real payloads for the tests.
type AnyHandler = (ctx: any, ...params: any[]) => any;
type HandlerParams<H extends AnyHandler> = Parameters<H> extends [any, ...infer P] ? P : [];
type HandlerReturn<H extends AnyHandler> = Awaited<ReturnType<H>>;

function fakeRoute<H extends AnyHandler>(
    handler: H,
    paramsFns?: InjectTypeFnArgs<HandlerParams<H>, 'val', 'verr', 'pj', 'rj', 'sj'>,
    returnFns?: InjectTypeFnArgs<HandlerReturn<H>, 'val', 'verr', 'pj', 'rj', 'sj'>,
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

    it('exposes tuple member names from the runtype graph', () => {
        const paramsRunType = resolveInjectedRunType(savePet.rtFns.paramsId);
        expect(getParamNamesFromRunType(paramsRunType)).toEqual(['pet', 'notes']);
    });

    it('throws a clear error when markers were not injected', () => {
        expect(() => getReflectionFromMarkers(undefined, () => 1, 'nope')).toThrow(/no injected type information/);
        expect(() => buildJitFnsFromMarker(undefined, 'x', 'nope')).toThrow(/vite plugin/);
    });
});
