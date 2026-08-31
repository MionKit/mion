/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {getPublicApi, serializeMethodDeps} from './remoteMethods.ts';
import {registerRoutes, initRouter, resetRouter} from '../router.ts';
import {CallContext} from '../types/context.ts';
import {Routes} from '../types/general.ts';
import {MiddleFnMethod, RouteMethod} from '../types/remoteMethods.ts';
import {getJitFnHashes, HandlerType} from '@mionjs/core';
import type {CompiledFnData, PureFnsDataCache, MethodWithOptions} from '@mionjs/core';
import {middleFn, rawMiddleFn, route} from './handlers.ts';
import {getRTUtils} from '@mionjs/run-types';
import type {InitializedTypeFn} from '@mionjs/run-types';

describe('Public Methods should', () => {
  const privateMiddleFn = middleFn((ctx): void => undefined);
  const publicMiddleFn = middleFn((ctx): null => null);
  const paramsMiddleFn = middleFn((ctx, s: string): void => undefined);
  const route1 = route((ctx): string => 'route1');
  const route2 = route((ctx): string => 'route2');

  const routes = {
    first: paramsMiddleFn, // is public as has params
    parse: rawMiddleFn((ctx, req: unknown, resp: unknown, opts: unknown): void => undefined), // private
    users: {
      userBefore: privateMiddleFn, // private
      getUser: route1, // public
      setUser: route2, // public
      pets: {
        getUserPet: route2, // public
      },
      userAfter: privateMiddleFn, // private
    },
    pets: {
      getPet: route1, // public
      setPet: route2, // public
    },
    last: publicMiddleFn, // public MiddleFn
  } satisfies Routes;

  const shared = {auth: {me: null as any}};
  const getSharedData = (): typeof shared => shared;

  beforeEach(() => resetRouter());

  it('not generate public data when  generateSpec = false', async () => {
    await initRouter({contextDataFactory: getSharedData, getPublicRoutesData: false});
    const publicExecutables = await registerRoutes(routes);

    expect(publicExecutables).toEqual({});
  });

  it('generate all the required public fields for middleFn and route', async () => {
    await initRouter({contextDataFactory: getSharedData, getPublicRoutesData: true});
    const testR = {
      auth: paramsMiddleFn,
      routes: {
        route1,
      },
    };
    const api = await registerRoutes(testR);

    expect(api.auth).toEqual(
      expect.objectContaining({
        type: HandlerType.middleFn,
        id: 'auth',
        paramsJitHash: expect.any(String),
        returnJitHash: expect.any(String),
        paramsCount: 1,
        // name assertion, not just arity: reordering two same-arity params is invisible
        // to a count. Names come from the params tuple's member labels via reflection.
        paramNames: ['s'],
      } as Partial<MiddleFnMethod>)
    );

    expect(api.routes.route1).toEqual(
      expect.objectContaining({
        type: HandlerType.route,
        id: 'routes/route1',
        paramsJitHash: expect.any(String),
        returnJitHash: expect.any(String),
        paramsCount: 0,
      } as Partial<RouteMethod>)
    );
  });

  it('be able to convert serialized handler types to json, deserialize and use them for validation', async () => {
    await initRouter({contextDataFactory: getSharedData, getPublicRoutesData: true});
    const testR = {
      addMilliseconds: route((ctx, ms: number, date: Date): number => date.setMilliseconds(date.getMilliseconds() + ms)),
    };
    const api = await registerRoutes(testR);

    const utl = getRTUtils();
    const hashes = getJitFnHashes(api.addMilliseconds.paramsJitHash);
    const compiledIsType = utl.getRT(hashes.isType)!;
    const compiledRestoreFromJson = utl.getRT(hashes.restoreFromJson)!;
    const compiledPrepareForJson = utl.getRT(hashes.prepareForJson)!;

    // Rebuild each fn from its serialized code (the client metadata lane). Since the
    // mion migration the closures take the mion utils, and noop entries
    // (identity transforms) ship no code — their .fn is the native substitute.
    const materialize = (compiled: InitializedTypeFn) =>
      // Rebuilding a compiled fn from its emitted code IS the client metadata lane
      // this test covers.
      // oxlint-disable-next-line typescript/no-implied-eval
      compiled.isNoop ? compiled.fn : new Function('utl', compiled.code!)(utl);

    const isType = materialize(compiledIsType);
    const restoreFromJson = materialize(compiledRestoreFromJson);
    const prepareForJson = materialize(compiledPrepareForJson);

    const date = new Date('2022-12-19T00:24:00.00');

    // ###### Validation ######
    expect(isType([123, date])).toEqual(true);
    expect(isType([123, date])).toEqual(true);
    expect(isType(['noNumber', new Date('noDate')])).toEqual(false);
    expect(isType(['noNumber', new Date('noDate')])).toEqual(false);

    // ###### Serialization ######
    const deserialized = restoreFromJson([123, '2022-12-19T00:24:00.00']);
    expect(deserialized).toEqual([123, date]);

    // ###### Deserialization ######
    const serialized = prepareForJson([123, date]);
    expect(serialized).toEqual([123, date]);
  });

  it('ship every defaultParamValues slot intact through a JSON round trip', async () => {
    await initRouter({contextDataFactory: getSharedData, getPublicRoutesData: true});
    const testR = {
      addMilliseconds: route((ctx, ms: number, date: Date): number => date.setMilliseconds(date.getMilliseconds() + ms)),
    };
    const api = await registerRoutes(testR);

    const deps: Record<string, CompiledFnData> = {};
    const purFnDeps: PureFnsDataCache = {};
    serializeMethodDeps(api.addMilliseconds as MethodWithOptions, deps, purFnDeps);

    // The metadata route ships these as JSON, so assert on what the client actually receives.
    const overTheWire: Record<string, CompiledFnData> = JSON.parse(JSON.stringify(deps));
    const entries = Object.values(overTheWire);
    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      // `args` and `defaultParamValues` describe the same emitted signature — one slot per
      // parameter — so any slot missing here is a slot dropped in transit. Compared as key
      // SETS on purpose: `toEqual` treats a missing key and an undefined one as equal, and
      // JSON.stringify drops undefined-valued keys, so a value-wise round-trip check passes
      // even when slots have gone missing.
      expect(Object.keys(entry.defaultParamValues).sort()).toEqual(Object.keys(entry.args).sort());
      // Both tables hold JS SOURCE FRAGMENTS (identifiers in `args`, default expressions in
      // `defaultParamValues`), spliced back into a signature when the client rebuilds the fn
      // via `new Function(...)`. A non-string here means a runtime value leaked into a
      // source-text slot.
      for (const value of Object.values(entry.defaultParamValues)) expect(typeof value).toBe('string');
    }

    // The error-shaped families are the regression: they carry three slots, and the removed
    // `toWireArgs` workaround collapsed them to one — `{vλl: 'v'}` — injecting an identifier
    // where a default expression belongs.
    const errorShaped = entries.filter((e) => e.familyTag === 'verr' || e.familyTag === 'uke');
    expect(errorShaped.length).toBeGreaterThan(0);
    errorShaped.forEach((entry) => {
      expect(entry.defaultParamValues).toEqual({vλl: '', pλth: '[]', εrr: '[]'});
    });
  });

  it('generate public data when suing prefix and suffix', async () => {
    await initRouter({contextDataFactory: getSharedData, getPublicRoutesData: true, basePath: 'v1', suffix: '.json'});
    const testR = {
      auth: paramsMiddleFn,
      route1,
    };
    const api = await registerRoutes(testR);

    expect(api).toEqual({
      auth: expect.objectContaining({
        type: HandlerType.middleFn,
        id: 'auth',
      }),
      route1: expect.objectContaining({
        type: HandlerType.route,
        id: 'route1',
      }),
    });
  });

  it('generate public data for public routes only', async () => {
    await initRouter({contextDataFactory: getSharedData, getPublicRoutesData: true});
    const publicExecutables = await registerRoutes(routes);

    expect(publicExecutables).toEqual({
      first: expect.objectContaining({
        type: HandlerType.middleFn,
        id: 'first',
      }),
      parse: null,
      users: {
        userBefore: null,
        getUser: expect.objectContaining({
          type: HandlerType.route,
          id: 'users/getUser',
        }),
        setUser: expect.objectContaining({
          type: HandlerType.route,
          id: 'users/setUser',
        }),
        pets: {
          getUserPet: expect.objectContaining({
            type: HandlerType.route,
            id: 'users/pets/getUserPet',
          }),
        },
        userAfter: null,
      },
      pets: {
        getPet: expect.objectContaining({
          type: HandlerType.route,
          id: 'pets/getPet',
        }),
        setPet: expect.objectContaining({
          type: HandlerType.route,
          id: 'pets/setPet',
        }),
      },
      last: expect.objectContaining({
        type: HandlerType.middleFn,
        id: 'last',
      }),
    });
  });

  it('should throw an error when route or middleFn is not already created in the router', () => {
    const testR1 = {route1};
    const testR2 = {middleFn1: paramsMiddleFn};
    expect(() => getPublicApi(testR1)).toThrow(
      `Route or MiddleFn route1 not found. Please check you have called router.registerRoutes first.`
    );
    expect(() => getPublicApi(testR2)).toThrow(
      `Route or MiddleFn middleFn1 not found. Please check you have called router.registerRoutes first.`
    );
  });

  it('should serialize remote method type skipping the context parameter', async () => {
    await initRouter({contextDataFactory: getSharedData, getPublicRoutesData: true});
    const routes = {
      sayHello: route((ctx: CallContext, name: string): string => `Hello ${name}`),
    };
    const api = await registerRoutes(routes);
    expect(api.sayHello).toEqual(
      expect.objectContaining({
        type: HandlerType.route,
        id: 'sayHello',
        paramsCount: 1,
      } as Partial<RouteMethod>)
    );
  });
});
