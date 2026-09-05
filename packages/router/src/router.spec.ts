/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {
  createMionRouter,
  geMiddleFnsSize,
  geRoutesSize,
  getComplexity,
  getMiddleFnExecutable,
  getRouteExecutionChain,
  getRouteExecutable,
  resetRouter,
  addStartMiddleFns,
  addEndMiddleFns,
} from './router.ts';
import {type Routes} from './types/general.ts';
import {HandlerType, HeadersSubset} from '@mionjs/core';
import {isPublicExecutable} from './types/guards.ts';

const mion = createMionRouter();

describe('Create routes should', () => {
  const middleFn1 = mion.middleFn((): void => undefined);
  const route1 = mion.route((): string => 'route1');
  const route2 = mion.route((): string => 'route2');

  const routes = {
    first: middleFn1,
    users: {
      userBefore: middleFn1,
      getUser: route1,
      setUser: route2,
      pets: {
        getUserPet: route2,
        userPetsAfter: middleFn1,
      },
      userAfter: middleFn1,
    },
    pets: {
      getPet: route1,
      setPet: route2,
    },
    last: middleFn1,
  } satisfies Routes;

  const middleFnExecutables = {
    first: {
      id: 'first',
      type: HandlerType.middleFn,
    },
    userBefore: {
      id: 'users/userBefore',
      type: HandlerType.middleFn,
    },
    userAfter: {
      id: 'users/userAfter',
      type: HandlerType.middleFn,
    },
    userPetsAfter: {
      id: 'users/pets/userPetsAfter',
      type: HandlerType.middleFn,
    },
    last: {
      id: 'last',
      type: HandlerType.middleFn,
    },
  };

  const routeExecutables = {
    usersGetUser: {
      id: 'users/getUser',
      type: HandlerType.route,
    },
    usersPetsGetUserPet: {
      id: 'users/pets/getUserPet',
      type: HandlerType.route,
    },
    petsGetPet: {
      id: 'pets/getPet',
      type: HandlerType.route,
    },
  };

  const defaultExecutables = {
    mionDeserializeRequest: {
      id: 'mionDeserializeRequest',
      type: HandlerType.rawMiddleFn,
    },
    mionMethodsMetadata: {
      id: 'mion@methodsMetadata',
      type: HandlerType.middleFn,
    },
    mionSerializeResponse: {
      id: 'mionSerializeResponse',
      type: HandlerType.rawMiddleFn,
    },
  };

  function addDefaultExecutables(exec: any[]) {
    return [
      expect.objectContaining({...defaultExecutables.mionDeserializeRequest}),
      ...exec,
      expect.objectContaining({...defaultExecutables.mionMethodsMetadata}),
      expect.objectContaining({...defaultExecutables.mionSerializeResponse}),
    ];
  }

  beforeEach(() => resetRouter());

  it('create a flat routes Map', async () => {
    await mion.initRoutes(routes);

    expect(geRoutesSize()).toEqual(8); // includes +3 mion Error routes (notFound, thrownErrors, platformError)
    expect(geMiddleFnsSize()).toEqual(6);

    expect(getRouteExecutionChain('/users/getUser')?.methods).toEqual(
      addDefaultExecutables([
        expect.objectContaining({...middleFnExecutables.first}),
        expect.objectContaining({...middleFnExecutables.userBefore}),
        expect.objectContaining({...routeExecutables.usersGetUser}),
        expect.objectContaining({...middleFnExecutables.userAfter}),
        expect.objectContaining({...middleFnExecutables.last}),
      ])
    );
    expect(getRouteExecutionChain('/users/setUser')).toBeTruthy();
    expect(getRouteExecutionChain('/users/pets/getUserPet')?.methods).toEqual(
      addDefaultExecutables([
        expect.objectContaining({...middleFnExecutables.first}),
        expect.objectContaining({...middleFnExecutables.userBefore}),
        expect.objectContaining({...routeExecutables.usersPetsGetUserPet}),
        expect.objectContaining({...middleFnExecutables.userPetsAfter}),
        expect.objectContaining({...middleFnExecutables.userAfter}),
        expect.objectContaining({...middleFnExecutables.last}),
      ])
    );
    expect(getRouteExecutionChain('/pets/getPet')?.methods).toEqual(
      addDefaultExecutables([
        expect.objectContaining({...middleFnExecutables.first}),
        expect.objectContaining({...routeExecutables.petsGetPet}),
        expect.objectContaining({...middleFnExecutables.last}),
      ])
    );
    expect(getRouteExecutionChain('/pets/setPet')).toBeTruthy();
  });

  it('add default values to middleFns', async () => {
    const defaultMiddleFnValues = {
      first: mion.middleFn((): void => undefined),
      second: mion.middleFn((): null => null),
    };
    await mion.initRoutes(defaultMiddleFnValues);

    expect(getMiddleFnExecutable('first')).toEqual(
      expect.objectContaining({
        id: 'first',
        nestLevel: 0,
        type: HandlerType.middleFn,
        hasReturnData: false,
        options: expect.objectContaining({
          runOnError: false,
        }),
      })
    );

    expect(getMiddleFnExecutable('second')).toEqual(
      expect.objectContaining({
        id: 'second',
        nestLevel: 0,
        type: HandlerType.middleFn,
        hasReturnData: true,
        options: expect.objectContaining({
          runOnError: false,
        }),
      })
    );
  });

  it('add default values to routes', async () => {
    const defaultRouteValues = {sayHello: mion.route((): null => null)};
    await mion.initRoutes(defaultRouteValues);

    expect(getRouteExecutable('sayHello')).toEqual(
      expect.objectContaining({
        id: 'sayHello',
        nestLevel: 0,
        type: HandlerType.route,
        hasReturnData: true,
        options: expect.objectContaining({
          runOnError: false,
        }),
      })
    );
  });

  it('set isMutation correctly for route(), query() and mutation()', async () => {
    await mion.initRoutes({
      getUser: mion.query((): null => null),
      createUser: mion.mutation((): null => null),
      sayHello: mion.route((): null => null),
    });

    expect(getRouteExecutable('getUser')).toEqual(
      expect.objectContaining({
        options: expect.objectContaining({isMutation: false}),
      })
    );
    expect(getRouteExecutable('createUser')).toEqual(
      expect.objectContaining({
        options: expect.objectContaining({isMutation: true}),
      })
    );
    expect(getRouteExecutable('sayHello')).toEqual(
      expect.objectContaining({
        options: expect.objectContaining({isMutation: undefined}),
      })
    );
  });

  it('add prefix & suffix to routes', async () => {
    await createMionRouter({basePath: 'api/v1', suffix: '.json'}).initRoutes(routes);

    expect(geRoutesSize()).toEqual(8); // includes +3 mion Error routes (notFound, thrownErrors, platformError)
    expect(geMiddleFnsSize()).toEqual(6);

    expect(getRouteExecutionChain('/api/v1/users/getUser.json')).toBeTruthy();
    expect(getRouteExecutionChain('/api/v1/users/setUser.json')).toBeTruthy();
    expect(getRouteExecutionChain('/api/v1/users/pets/getUserPet.json')).toBeTruthy();
    expect(getRouteExecutionChain('/api/v1/pets/getPet.json')).toBeTruthy();
    expect(getRouteExecutionChain('/api/v1/pets/setPet.json')).toBeTruthy();
  });

  it('throw an error when a routes are invalid', async () => {
    const empty = {};
    const emptySub = {sayHello: {}};
    const invalidValues = {sayHello: {total: 2}};
    const numericNames = {directory: {2: route1}};

    // initRoutes initializes the router before registering, so each rejected attempt needs a reset
    await expect(mion.initRoutes(empty)).rejects.toThrow('Invalid route: *. Can Not define empty routes');
    resetRouter();
    await expect(mion.initRoutes(emptySub)).rejects.toThrow('Invalid route: sayHello. Can Not define empty routes');
    resetRouter();
    await expect(mion.initRoutes(invalidValues as any)).rejects.toThrow(
      'Invalid route: sayHello/total. Type <number> is not a valid route.'
    );
    resetRouter();
    await expect(mion.initRoutes(numericNames)).rejects.toThrow(
      'Invalid route: directory/2. Numeric route names are not allowed'
    );
  });

  it('throw an error when contextDataFactory returns invalid values', async () => {
    const errorMessage = 'contextDataFactory must return a plain object with at least one property';

    const initWith = (contextDataFactory: () => any) => createMionRouter({contextDataFactory}).initRoutes(routes);

    await expect(initWith(() => undefined)).rejects.toThrow(errorMessage);
    resetRouter();
    await expect(initWith(() => null)).rejects.toThrow(errorMessage);
    resetRouter();
    await expect(initWith(() => 'string')).rejects.toThrow(errorMessage);
    resetRouter();
    await expect(initWith(() => 42)).rejects.toThrow(errorMessage);
    resetRouter();
    await expect(initWith(() => [])).rejects.toThrow(errorMessage);
    resetRouter();
    await expect(initWith(() => ({}))).rejects.toThrow(errorMessage);
  });

  it('accept valid contextDataFactory that returns an object with properties', async () => {
    await expect(createMionRouter({contextDataFactory: () => ({user: null})}).initRoutes(routes)).resolves.not.toThrow();
    resetRouter();
    await expect(
      createMionRouter({contextDataFactory: () => ({user: null, data: 'test'})}).initRoutes(routes)
    ).resolves.not.toThrow();
  });

  it('optimize parsing routes (complexity) when there are multiple routes in a row', async () => {
    const bestCase = {
      first: middleFn1,
      route1: route1,
      route2: route2,
      route3: route1,
      route4: route2,
      route5: route1,
      route6: route2,
      route7: route1,
      route8: route2,
      route9: route1,
      route10: route2,
      pets: {
        petsFirst: middleFn1,
        route1: route1,
        route2: route2,
        route3: route1,
        route4: route2,
        route5: route1,
        route6: route2,
        route7: route1,
        route8: route2,
        route9: route1,
        route10: route2,
        petsLast: middleFn1,
      },
      last: middleFn1,
    };
    const worstCase = {
      first: middleFn1,
      route1: route1,
      route12: route2,
      pets: {
        petsFirst: middleFn1,
        route1: route1,
        route12: route2,
        petsLast: middleFn1,
      },
      last: middleFn1,
    };
    const bestCaseTotalRoutes = 20;
    const worstCaseTotalRoutes = 4;
    const ratio = bestCaseTotalRoutes / worstCaseTotalRoutes;

    await mion.initRoutes(bestCase);
    const bestCaseComplexity = getComplexity();
    resetRouter();
    await mion.initRoutes(worstCase);
    const worstCaseComplexity = getComplexity();

    expect(worstCaseComplexity * ratio > bestCaseComplexity).toBeTruthy();
  });

  it('differentiate async vs non async routes', async () => {
    const defaultRouteValues = {
      sayHello: mion.route((): null => null),
      asyncSayHello: mion.route(async (): Promise<string> => {
        const hello = await new Promise<string>((res) => {
          setTimeout(() => res('hello'), 50);
        });
        return hello;
      }),
      noReturnType: mion.route(() => null),
      asyncNoReturnType: mion.route(async () => null),
    };
    await mion.initRoutes(defaultRouteValues);

    expect(getRouteExecutable('sayHello')?.isAsync).toEqual(false);
    expect(getRouteExecutable('asyncSayHello')?.isAsync).toEqual(true);

    // Since the mion migration return types are always resolved by the checker
    // (inference included), so an un-annotated sync handler is correctly detected as
    // sync (the old runtime reflection assumed async when it could not see the type).
    // Dispatch always awaits results, so isAsync is metadata only.
    expect(getRouteExecutable('noReturnType')?.isAsync).toEqual(false);
    expect(getRouteExecutable('asyncNoReturnType')?.isAsync).toEqual(true);
  });

  it('add start and end global middleFns', async () => {
    const prependMiddleFns = {
      p1: mion.rawMiddleFn((ctx, cb: () => void): void => cb()),
      p2: mion.rawMiddleFn((ctx, cb: () => void): void => cb()),
    };

    const appendMiddleFns = {
      a1: mion.rawMiddleFn((ctx, cb: () => void): void => cb()),
      a2: mion.rawMiddleFn((ctx, cb: () => void): void => cb()),
    };
    addStartMiddleFns(prependMiddleFns, false);
    addEndMiddleFns(appendMiddleFns, false);

    await mion.initRoutes(routes);

    const expectedExecutionChain = addDefaultExecutables([
      expect.objectContaining({id: 'p1', type: HandlerType.rawMiddleFn}),
      expect.objectContaining({id: 'p2', type: HandlerType.rawMiddleFn}),
      expect.objectContaining({id: 'first', type: HandlerType.middleFn}),
      expect.objectContaining({id: 'pets/getPet', type: HandlerType.route}),
      expect.objectContaining({id: 'last', type: HandlerType.middleFn}),
      expect.objectContaining({id: 'a1', type: HandlerType.rawMiddleFn}),
      expect.objectContaining({id: 'a2', type: HandlerType.rawMiddleFn}),
    ]);

    expect(getRouteExecutionChain('/pets/getPet')?.methods).toEqual(expectedExecutionChain);
    expect(() => addStartMiddleFns(prependMiddleFns)).toThrow(
      'Can not add start middleFns after the router has been initialized'
    );
    expect(() => addEndMiddleFns(appendMiddleFns)).toThrow('Can not add end middleFns after the router has been initialized');
  });

  it('Headers Functions should be considered public (non-private)', async () => {
    const routesWithHeadersMiddleFn = {
      auth: mion.headersFn((ctx, h: HeadersSubset<'Authorization'>): void => {
        // Headers MiddleFn with no return data and no body params
      }),
      sayHello: mion.route((): string => 'hello'),
    } satisfies Routes;
    await mion.initRoutes(routesWithHeadersMiddleFn);

    const authMiddleFn = getMiddleFnExecutable('auth');
    expect(authMiddleFn).toBeDefined();
    expect(authMiddleFn!.type).toEqual(HandlerType.headersMiddleFn);
    // Headers Functions should be public because they have headerNames, even if they have no return data or body params
    expect(isPublicExecutable(authMiddleFn!)).toBe(true);
  });
});
