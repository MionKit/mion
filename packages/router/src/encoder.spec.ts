/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The `encoder` option end to end at the router level: what a route literal and the factory literal
// make the build compile, the pair the runtime resolves and ships, the framing derived from the
// chain, and the wire of each strategy through dispatch.
import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter, getRouteExecutable, getRouteExecutionChain, getMiddleFnExecutable} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import {registerBatches} from './batches.ts';
import {headersFromRecord} from './lib/headers.ts';
import {MION_BATCH_PATH} from '@mionjs/core';
import {MION_ROUTES, SerializerModes, serializeBinaryBody, deserializeBinaryBody, type EncoderOption} from '@mionjs/core';
import type {Routes} from './types/general.ts';
import type {RemoteMethod} from './types/remoteMethods.ts';

interface Pet {
  name: string;
  born: Date;
  tags?: string[];
}

const pet = (): Pet => ({name: 'rex', born: new Date('2020-01-02T03:04:05.000Z'), tags: ['good']});

// the two factories this file declares routes through: no router-wide encoder, and a compact one
const mion = createMionRouter();
resetRouter();
const compactMion = createMionRouter({encoder: 'compact'});
resetRouter();

const dispatchJson = (routeId: string, params: unknown[], body: Record<string, unknown> = {}) => {
  const request = {headers: headersFromRecord({}), body: JSON.stringify({[routeId]: params, ...body})};
  return dispatchRoute(`/${routeId}`, request.body, request.headers, headersFromRecord({}), request, {});
};

describe('encoder strategies at the router level', () => {
  beforeEach(() => resetRouter());

  describe('what the build compiles for each literal', () => {
    const plain = mion.route((ctx, p: Pet): Pet => p);
    const compact = mion.route((ctx, p: Pet): Pet => p, {encoder: 'compact'});
    const returnBinary = mion.route((ctx, p: Pet): Pet => p, {encoder: {return: 'binary'}});
    const mixed = mion.route((ctx, p: Pet): Pet => p, {encoder: {params: 'clone', return: 'direct'}});
    const preset = {encoder: 'compact', description: 'positional'} as const;
    const fromPreset = mion.route((ctx, p: Pet): Pet => p, preset);

    it('no literal anywhere: the built-in defaults, params direct and return mutate, no binary', () => {
      mion.initRoutes({plain});
      const exec = getRouteExecutable('plain')!;
      expect(exec.options.encoder).toEqual({params: 'direct', return: 'mutate'});
      expect(exec.paramsJitFns.json.strategy).toBe('direct');
      expect(exec.returnJitFns.json.strategy).toBe('mutate');
      expect(exec.paramsJitFns.binary).toBeUndefined();
      expect(exec.returnJitFns.binary).toBeUndefined();
    });

    it('a string sets both directions', () => {
      mion.initRoutes({compact});
      const exec = getRouteExecutable('compact')!;
      expect(exec.options.encoder).toEqual({params: 'compact', return: 'compact'});
      expect(exec.paramsJitFns.json.strategy).toBe('compact');
      expect(exec.returnJitFns.json.strategy).toBe('compact');
    });

    it('binary on one direction adds the binary pair BESIDE that direction json pair', () => {
      mion.initRoutes({returnBinary});
      const exec = getRouteExecutable('returnBinary')!;
      expect(exec.options.encoder).toEqual({params: 'direct', return: 'binary'});
      expect(exec.paramsJitFns.binary).toBeUndefined();
      expect(exec.returnJitFns.binary).toBeDefined();
      expect(exec.returnJitFns.json.strategy).toBe('mutate');
    });

    it('an object literal names each direction', () => {
      mion.initRoutes({mixed});
      const exec = getRouteExecutable('mixed')!;
      expect(exec.paramsJitFns.json.strategy).toBe('clone');
      expect(exec.returnJitFns.json.strategy).toBe('direct');
    });

    it('an `as const` preset passed by name works like the inline literal', () => {
      mion.initRoutes({fromPreset});
      const exec = getRouteExecutable('fromPreset')!;
      expect(exec.options.encoder).toEqual({params: 'compact', return: 'compact'});
      expect(exec.options.description).toBe('positional');
      expect(exec.returnJitFns.json.strategy).toBe('compact');
    });
  });

  describe('the factory literal is the router-wide default', () => {
    const inherited = compactMion.route((ctx, p: Pet): Pet => p);
    const overridden = compactMion.route((ctx, p: Pet): Pet => p, {encoder: {return: 'direct'}});
    const guard = compactMion.middleFn((ctx, token: string): string => token);
    const anyRoute = mion.route((ctx): string => 'x');

    it('routes and middleFns inherit it; a route literal overrides one direction', () => {
      compactMion.initRoutes({guard, inherited, overridden});
      expect(getRouteExecutable('inherited')!.options.encoder).toEqual({params: 'compact', return: 'compact'});
      expect(getRouteExecutable('inherited')!.paramsJitFns.json.strategy).toBe('compact');
      expect(getRouteExecutable('overridden')!.options.encoder).toEqual({params: 'compact', return: 'direct'});
      expect(getRouteExecutable('overridden')!.returnJitFns.json.strategy).toBe('direct');
      expect(getMiddleFnExecutable('guard')!.options.encoder).toEqual({params: 'compact', return: 'compact'});
      expect(getMiddleFnExecutable('guard')!.paramsJitFns.json.strategy).toBe('compact');
    });

    it('refuses to register a route whose runtime pair differs from what the build compiled', () => {
      // declared through the compact factory, initialized through a router with no encoder: the build
      // compiled compact, the runtime resolves the defaults
      expect(() => createMionRouter({}).initRoutes({inherited})).toThrow(
        /is 'direct' at runtime but the build compiled 'compact'/
      );
    });

    it('rejects a widened factory encoder at the type level', () => {
      const widened = 'compact' as string;
      // @ts-expect-error a plain string is not one literal strategy
      const bad = () => createMionRouter({encoder: widened});
      const union = 'compact' as 'compact' | 'direct';
      // @ts-expect-error a union is not one literal strategy
      const badUnion = () => createMionRouter({encoder: {return: union}});
      // @ts-expect-error the old key is retired
      const old = () => createMionRouter({serializer: 'json'});
      expect([bad, badUnion, old].length).toBe(3);
      // a runtime value that is not a strategy at all is refused at init
      const bogus = {encoder: 'yaml'} as unknown as {encoder: EncoderOption};
      expect(() => createMionRouter(bogus as never).initRoutes({anyRoute})).toThrow(/invalid encoder strategy 'yaml'/);
    });
  });

  describe('framing derived from the chain', () => {
    const mutateRoute = mion.route((ctx, p: Pet): Pet => p);
    const directRoute = mion.route((ctx, p: Pet): Pet => p, {encoder: {return: 'direct'}});
    const compactRoute = mion.route((ctx, p: Pet): Pet => p, {encoder: 'compact'});
    const binaryRoute = mion.route((ctx, p: Pet): Pet => p, {encoder: 'binary'});
    const directMiddleFn = mion.middleFn((ctx): string => 'stamp', {encoder: {return: 'direct'}});
    const silentMiddleFn = mion.middleFn((ctx): void => undefined, {encoder: {return: 'direct'}});

    it('mutate, clone and compact returns frame as json; direct frames as stringifyJson; binary as binary', () => {
      mion.initRoutes({mutateRoute, directRoute, compactRoute, binaryRoute});
      expect(getRouteExecutionChain('/mutateRoute')!.serializer).toBe(SerializerModes.json);
      expect(getRouteExecutionChain('/directRoute')!.serializer).toBe(SerializerModes.stringifyJson);
      expect(getRouteExecutionChain('/compactRoute')!.serializer).toBe(SerializerModes.json);
      expect(getRouteExecutionChain('/binaryRoute')!.serializer).toBe(SerializerModes.binary);
    });

    it('a direct middleFn WITH return data makes its chain stringifyJson; one without data does not', () => {
      mion.initRoutes({directMiddleFn, mutateRoute});
      expect(getRouteExecutionChain('/mutateRoute')!.serializer).toBe(SerializerModes.stringifyJson);
      resetRouter();
      mion.initRoutes({silentMiddleFn, mutateRoute});
      expect(getRouteExecutionChain('/mutateRoute')!.serializer).toBe(SerializerModes.json);
    });

    it('a merged batch chain is binary only when every route answers binary', async () => {
      mion.initRoutes({mutateRoute, directRoute, binaryRoute});
      registerBatches({
        mixedBinary: {routes: ['mutateRoute', 'binaryRoute']},
        withDirect: {routes: ['mutateRoute', 'directRoute']},
        allBinary: {routes: ['binaryRoute']},
      });
      const send = (id: string, body: Record<string, unknown[]>) => {
        const request = {headers: headersFromRecord({}), body: JSON.stringify(body)};
        return dispatchRoute(
          MION_BATCH_PATH,
          request.body,
          request.headers,
          headersFromRecord({}),
          request,
          {},
          undefined,
          `id=${id}`
        );
      };
      const mixed = await send('mixedBinary', {mutateRoute: [pet()], binaryRoute: [pet()]});
      expect(mixed.serializer).toBe(SerializerModes.json);
      expect(mixed.body.mutateRoute).toEqual(pet());
      expect(mixed.body.binaryRoute).toEqual(pet());
      const direct = await send('withDirect', {mutateRoute: [pet()], directRoute: [pet()]});
      expect(direct.serializer).toBe(SerializerModes.stringifyJson);
      expect(JSON.parse(direct.rawBody as string).directRoute.name).toBe('rex');
      const all = await send('allBinary', {binaryRoute: [pet()]});
      expect(all.serializer).toBe(SerializerModes.binary);
    });
  });

  describe('the wire of each strategy through dispatch', () => {
    const compactRoute = mion.route((ctx, p: Pet, note: string): Pet => ({...p, name: `${p.name}:${note}`}), {
      encoder: 'compact',
    });
    const shared = pet();
    const cloneRoute = mion.route((ctx): Pet => shared, {encoder: 'clone'});
    const binaryRoute = mion.route((ctx, p: Pet): Pet => p, {encoder: 'binary'});
    const directRoute = mion.route((ctx, p: Pet): Pet => p, {encoder: 'direct'});

    it('compact params arrive as positional arrays and the handler gets the objects back', async () => {
      mion.initRoutes({compactRoute});
      const encode = getRouteExecutable('compactRoute')!.paramsJitFns.json.encode.fn;
      const wire = JSON.parse(JSON.stringify(encode([pet(), 'hi'])));
      // positional: the object rides without its key names
      expect(Array.isArray(wire[0])).toBe(true);
      expect(wire[0]).not.toHaveProperty('name');
      const response = await dispatchJson('compactRoute', wire);
      expect(response.hasErrors).toBe(false);
      // the compact return is positional too, the platform stringifies it as is
      expect(response.serializer).toBe(SerializerModes.json);
      const encodedReturn = response.body.compactRoute as unknown[];
      expect(Array.isArray(encodedReturn)).toBe(true);
      const decode = getRouteExecutable('compactRoute')!.returnJitFns.json.decode.fn;
      expect(decode(JSON.parse(JSON.stringify(encodedReturn)))).toEqual({...pet(), name: 'rex:hi'});
    });

    it('keyed json to a compact route is rejected as invalid params, never guessed', async () => {
      mion.initRoutes({compactRoute});
      const response = await dispatchJson('compactRoute', [pet(), 'hi']);
      expect(response.hasErrors).toBe(true);
      const errors = response.body[MION_ROUTES.thrownErrors] as Record<string, {type: string}>;
      expect(errors.compactRoute.type).toMatch(/serialization-error|validation-error/);
    });

    it('clone builds a fresh JSON-safe value and leaves the handler object untouched', async () => {
      mion.initRoutes({cloneRoute});
      const response = await dispatchJson('cloneRoute', []);
      expect(response.hasErrors).toBe(false);
      const encoded = response.body.cloneRoute as {born: unknown};
      expect(encoded).not.toBe(shared);
      expect(encoded.born).toBe(shared.born.toISOString());
      expect(shared.born).toBeInstanceOf(Date);
    });

    it('direct returns the string the encoder wrote', async () => {
      mion.initRoutes({directRoute});
      const response = await dispatchJson('directRoute', [pet()]);
      expect(response.serializer).toBe(SerializerModes.stringifyJson);
      expect(JSON.parse(response.rawBody as string).directRoute).toEqual(JSON.parse(JSON.stringify(pet())));
    });

    it('a JSON request to a binary route still decodes: binary is added beside the json pair', async () => {
      mion.initRoutes({binaryRoute});
      const response = await dispatchJson('binaryRoute', [pet()]);
      expect(response.hasErrors).toBe(false);
      expect((response.body.binaryRoute as Pet).name).toBe('rex');
      // and the binary wire works as well
      const path = '/binaryRoute';
      const chain = getRouteExecutionChain(path)!.methods as RemoteMethod[];
      const buffer = serializeBinaryBody(path, chain, {binaryRoute: [pet()]}, false).serializer.getBuffer();
      const binaryResponse = await dispatchRoute(
        path,
        buffer,
        headersFromRecord({'content-type': 'application/octet-stream'}),
        headersFromRecord({}),
        {headers: headersFromRecord({}), body: buffer},
        {},
        SerializerModes.binary
      );
      const {body} = deserializeBinaryBody(path, binaryResponse.binSerializer!.getBufferView(), true);
      expect(body.binaryRoute).toEqual(pet());
    });
  });
});
