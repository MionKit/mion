/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, afterEach} from 'vitest';
import {MionHeaders} from '../types/context.ts';
import {createMionRouter, resetRouter, getRouteExecutable} from '../router.ts';
import {
  getRoutePath,
  SerializableMethodsData,
  MethodsCache,
  MION_ROUTES,
  RpcError,
  CompiledFnData,
  HandlerType,
  RouteOnlyOptions,
  RemoteMethodOpts,
  CoreRouterOptions,
  SerializerModes,
} from '@mionjs/core';
import {Routes} from '../types/general.ts';
import {mionClientRoutes} from './client.routes.ts';
import {headersFromRecord} from '../lib/headers.ts';
import {dispatchRoute} from '../dispatch.ts';
import {createValidateFn, createGetValidationErrorsFn, createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';
import {getSerializableMethod} from '../lib/remoteMethods.ts';

const mion = createMionRouter();

type RawRequest = {
  headers: MionHeaders;
  body: string;
};

describe('PublicMethods run type functionality', () => {
  const route1 = mion.route((ctx): string => 'something');
  const routes = {route1} satisfies Routes;

  type ClientReturn = SerializableMethodsData | RpcError<string>;

  afterEach(() => resetRouter());

  it('can validate return type ClientReturn', () => {
    const validate = createValidateFn<ClientReturn>();
    expect(
      validate(
        new RpcError({
          publicMessage: 'error',
          message: 'error',
          type: 'test-error',
        })
      )
    ).toBe(true);
  });

  it('can validate return type ClientReturn + errors', async () => {
    mion.initRoutes(routes);
    const executable = getRouteExecutable('route1')!;
    const publicMethod = getSerializableMethod(executable!);

    const response: SerializableMethodsData = {
      methods: {[publicMethod.id]: publicMethod},
      deps: {},
      purFnDeps: {},
    };

    const typeErrorsMethodsData = createGetValidationErrorsFn<SerializableMethodsData>();
    const typeErrorsPublicMethods = createGetValidationErrorsFn<MethodsCache>();
    const typeErrors = createGetValidationErrorsFn<ClientReturn>();

    expect(typeErrorsPublicMethods({hello: publicMethod})).toEqual([]);
    expect(typeErrorsMethodsData(response)).toEqual([]);
    expect(typeErrors(response)).toEqual([]);
    expect(
      typeErrors(
        new RpcError({
          publicMessage: 'error',
          message: 'error',
          type: 'test-error',
        })
      )
    ).toEqual([]);
  });

  it('can serialize/deserialize return type PublicMethods | RpcError>', async () => {
    mion.initRoutes(routes);
    const executable = getRouteExecutable('route1')!;
    const publicMethod = getSerializableMethod(executable!);
    const response: SerializableMethodsData = {
      methods: {[publicMethod.id]: publicMethod},
      deps: {},
      purFnDeps: {},
    };
    const encodeJson = createJsonEncoderFn<ClientReturn>();
    const decodeJson = createJsonDecoderFn<ClientReturn>();
    const error = new RpcError({
      publicMessage: 'error',
      message: 'error',
      type: 'test-error',
    });
    const errorClone = new RpcError({
      publicMessage: 'error',
      message: 'error',
      type: 'test-error',
    });
    // operations may modify the original object so we clone it before serializing
    const roundTrip = decodeJson(encodeJson(errorClone)!);
    expect(roundTrip instanceof RpcError).toBeTruthy();
    expect(roundTrip).toEqual(error);
    const responseClone: SerializableMethodsData = {
      methods: {[publicMethod.id]: structuredClone(publicMethod)},
      deps: {},
      purFnDeps: {},
    };
    const jsonStr = encodeJson(responseClone);
    const roundTrip2 = decodeJson(jsonStr!);
    delete (publicMethod as any).handler;
    expect(roundTrip2).toEqual(response);
  });
});

describe('Client Routes should', () => {
  const privateMiddleFn = mion.middleFn((ctx): void => undefined);
  const publicMiddleFn = mion.middleFn((ctx): null => null);
  const auth = mion.middleFn((ctx, token: string): void => undefined);
  const route1 = mion.route((ctx): string => 'route1');
  const route2 = mion.route((ctx): string => 'route2');

  const routes = {
    auth: auth, // is public as has params
    parse: mion.rawMiddleFn((ctx, req: unknown, resp: unknown, opts: unknown): void => undefined), // private
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

  const defaultRouteOpts: RouteOnlyOptions = {
    runOnError: false,
    serializer: {params: 'direct', return: 'mutate'},
    validateParams: true,
    validateReturn: false,
    description: undefined,
    isMutation: undefined,
  };
  const defaultMiddleFnOpts: RemoteMethodOpts = {
    runOnError: false,
    validateParams: true,
    validateReturn: false,
    description: undefined,
    serializer: {params: 'direct', return: 'mutate'},
  };

  const methodsMetadata = {
    'users/getUser': {
      type: HandlerType.route,
      id: 'users/getUser',
      isAsync: false,
      hasReturnData: true,
      nestLevel: 1,
      paramsJitHash: expect.any(String),
      returnJitHash: expect.any(String),
      paramsCount: 0,
      paramNames: [],
      middleFnIds: ['auth', 'last'],
      pointer: ['users', 'getUser'],
      options: defaultRouteOpts,
    },
    'users/setUser': {
      type: HandlerType.route,
      id: 'users/setUser',
      isAsync: false,
      hasReturnData: true,
      nestLevel: 1,
      paramsJitHash: expect.any(String),
      returnJitHash: expect.any(String),
      paramsCount: 0,
      paramNames: [],
      middleFnIds: ['auth', 'last'],
      pointer: ['users', 'setUser'],
      options: defaultRouteOpts,
    },
    'users/pets/getUserPet': {
      type: HandlerType.route,
      id: 'users/pets/getUserPet',
      isAsync: false,
      hasReturnData: true,
      nestLevel: 2,
      paramsJitHash: expect.any(String),
      returnJitHash: expect.any(String),
      paramsCount: 0,
      paramNames: [],
      middleFnIds: ['auth', 'last'],
      pointer: ['users', 'pets', 'getUserPet'],
      options: defaultRouteOpts,
    },
    'pets/getPet': {
      type: HandlerType.route,
      id: 'pets/getPet',
      isAsync: false,
      hasReturnData: true,
      nestLevel: 1,
      paramsJitHash: expect.any(String),
      returnJitHash: expect.any(String),
      paramsCount: 0,
      paramNames: [],
      middleFnIds: ['auth', 'last'],
      pointer: ['pets', 'getPet'],
      options: defaultRouteOpts,
    },
    'pets/setPet': {
      type: HandlerType.route,
      id: 'pets/setPet',
      isAsync: false,
      hasReturnData: true,
      nestLevel: 1,
      paramsJitHash: expect.any(String),
      returnJitHash: expect.any(String),
      paramsCount: 0,
      paramNames: [],
      middleFnIds: ['auth', 'last'],
      pointer: ['pets', 'setPet'],
      options: defaultRouteOpts,
    },
    auth: {
      type: HandlerType.middleFn,
      id: 'auth',
      isAsync: false,
      hasReturnData: false,
      nestLevel: 0,
      paramsJitHash: expect.any(String),
      returnJitHash: expect.any(String),
      paramsCount: 1,
      paramNames: ['token'],
      pointer: ['auth'],
      options: defaultMiddleFnOpts,
    },
    last: {
      type: HandlerType.middleFn,
      id: 'last',
      isAsync: false,
      hasReturnData: true,
      nestLevel: 0,
      paramsJitHash: expect.any(String),
      returnJitHash: expect.any(String),
      paramsCount: 0,
      paramNames: [],
      pointer: ['last'],
      options: defaultMiddleFnOpts,
    },
  } satisfies MethodsCache;

  const methodsId = MION_ROUTES.methodsMetadataById;
  const emptyRouterOpts: CoreRouterOptions = {basePath: '', suffix: '', autoGenerateErrorId: false};
  const methodsPath = getRoutePath([methodsId], emptyRouterOpts);
  const isJitCompiledFn = createValidateFn<CompiledFnData>();
  // deps ride the (already parsed) JSON response; encode+decode replays the wire trip
  const encodeJitCompiledFn = createJsonEncoderFn<CompiledFnData>();
  const decodeJitCompiledFn = createJsonDecoderFn<CompiledFnData>();
  const restoreJitCompiledFn = (dep: unknown) =>
    decodeJitCompiledFn(encodeJitCompiledFn(structuredClone(dep) as CompiledFnData)!);

  afterEach(() => resetRouter());

  it('get Remote MiddleFns Only info from id', async () => {
    createMionRouter({contextDataFactory: getSharedData}).initRoutes({...routes, ...mionClientRoutes});

    const methodIdList = ['auth', 'last']; // all public middleFns
    const request: RawRequest = {
      headers: headersFromRecord({}),
      body: JSON.stringify({
        auth: ['token'], // middleFn is required
        [methodsId]: [methodIdList],
      }),
    };
    const response = await dispatchRoute(methodsPath, request.body, request.headers, headersFromRecord({}), request, {});
    const expectedMethods = {
      auth: methodsMetadata.auth,
      last: methodsMetadata.last,
    };
    const methodsData = response.body[methodsId] as SerializableMethodsData; // serializable data for remote methods
    const dependencies = methodsData.deps; // serializable data for jit functions that are used by the remote methods
    expect(methodsData.methods).toEqual(expectedMethods);
    Object.values(dependencies).forEach((dep) => {
      expect(isJitCompiledFn(restoreJitCompiledFn(dep))).toBe(true);
    });
  });

  it('get Remote Route info from id, it should also return the middleFns from the ExecutionChain', async () => {
    createMionRouter({contextDataFactory: getSharedData}).initRoutes({...routes, ...mionClientRoutes});

    const methodIdList = ['users/getUser']; // all public methods
    const request: RawRequest = {
      headers: headersFromRecord({}),
      body: JSON.stringify({
        auth: ['token'], // middleFn is required (request should be authenticated)
        [methodsId]: [methodIdList],
      }),
    };
    const response = await dispatchRoute(methodsPath, request.body, request.headers, headersFromRecord({}), request, {});
    const expectedMethods = {
      auth: methodsMetadata.auth,
      'users/getUser': methodsMetadata['users/getUser'],
      last: methodsMetadata['last'],
    };
    const methodsData = response.body[methodsId] as SerializableMethodsData; // serializable data for remote methods
    const dependencies = methodsData.deps; // serializable data for jit functions that are used by the remote methods
    expect(methodsData.methods).toEqual(expectedMethods);
    Object.values(dependencies).forEach((dep) => {
      const restored = restoreJitCompiledFn(dep); // we need to restore before checking correct type
      expect(isJitCompiledFn(restored)).toBe(true);
    });
  });

  it('get All Remote Methods info when getAllRemoteMethods is true', async () => {
    createMionRouter({contextDataFactory: getSharedData}).initRoutes({...routes, ...mionClientRoutes});

    const methodIdList = ['auth']; // all public methods
    const getAllRemoteMethods = true;
    const request: RawRequest = {
      headers: headersFromRecord({}),
      body: JSON.stringify({
        auth: ['token'], // middleFn is required
        [methodsId]: [methodIdList, getAllRemoteMethods],
      }),
    };
    const response = await dispatchRoute(methodsPath, request.body, request.headers, headersFromRecord({}), request, {});
    const expectedMethods = methodsMetadata;
    const methodsData = response.body[methodsId] as SerializableMethodsData; // serializable data for remote methods
    const dependencies = methodsData.deps; // serializable data for jit functions that are used by the remote methods
    expect(methodsData.methods).toEqual(expectedMethods);
    Object.values(dependencies).forEach((dep) => {
      const restored = restoreJitCompiledFn(dep); // we need to restore before checking correct type
      expect(isJitCompiledFn(restored)).toBe(true);
    });
  });

  it('fail when remote method is private or not defined', async () => {
    createMionRouter({contextDataFactory: getSharedData}).initRoutes({...routes, ...mionClientRoutes});

    const methodIdList = ['parse', 'helloWorld']; // all public methods
    const request: RawRequest = {
      headers: headersFromRecord({}),
      body: JSON.stringify({
        auth: ['token'], // middleFn is required
        [methodsId]: [methodIdList],
      }),
    };
    const response = await dispatchRoute(methodsPath, request.body, request.headers, headersFromRecord({}), request, {});
    const expectedResponse = new RpcError({
      type: 'rpc-metadata-not-found',
      publicMessage: 'Errors getting Remote Methods Metadata',
      errorData: {
        parse: 'Remote Method parse not found',
        helloWorld: 'Remote Method helloWorld not found',
      },
    });
    expect(response.body[methodsId]).toEqual(expectedResponse);
  });
});

describe('Restore Client Routes jit functions', () => {
  type User = {
    id: string;
    name: string;
    surname: string;
    others: string[];
  };

  const routes = {
    users: {
      getUser: mion.route((ctx, id: string): User => ({id, name: 'John', surname: 'Smith', others: []})),
    },
  } satisfies Routes;

  const methodsId = MION_ROUTES.methodsMetadataById;
  const emptyRouterOpts: CoreRouterOptions = {basePath: '', suffix: '', autoGenerateErrorId: false};
  const methodsPath = getRoutePath([methodsId], emptyRouterOpts);

  afterEach(() => resetRouter());

  it('should restore jit functions', async () => {
    mion.initRoutes({...routes, ...mionClientRoutes});

    const request: RawRequest = {
      headers: headersFromRecord({}),
      body: JSON.stringify({
        [methodsId]: [['users/getUser'], true],
      }),
    };
    await dispatchRoute(methodsPath, request.body, request.headers, headersFromRecord({}), request, {});
  });
});

describe('methodsMetadata middleware should force JSON serialization', () => {
  const metadataKey = MION_ROUTES.methodsMetadata;

  afterEach(() => resetRouter());

  it('should force stringifyJson when route uses default json serializer', async () => {
    const routes = {
      sayHello: mion.route((ctx, name: string): string => `Hello, ${name}!`),
    } satisfies Routes;
    mion.initRoutes(routes);

    const request: RawRequest = {
      headers: headersFromRecord({}),
      body: JSON.stringify({
        sayHello: ['World'],
        [metadataKey]: [['sayHello']],
      }),
    };
    const response = await dispatchRoute('/sayHello', request.body, request.headers, headersFromRecord({}), request, {});

    expect(response.serializer).toBe(SerializerModes.stringifyJson);
    expect(typeof response.rawBody).toBe('string');
    const parsed = JSON.parse(response.rawBody as string);
    expect(parsed.sayHello).toBe('Hello, World!');
    // stringifyJson serializes union return type as [discriminatorIndex, value]
    const metadataRaw = parsed[metadataKey];
    expect(metadataRaw).toBeDefined();
    const metadata = (Array.isArray(metadataRaw) ? metadataRaw[1] : metadataRaw) as SerializableMethodsData;
    expect(metadata.methods).toHaveProperty('sayHello');
  });

  it('should keep stringifyJson when route already uses a direct serializer', async () => {
    const routes = {
      sayHello: mion.route((ctx, name: string): string => `Hello, ${name}!`, {serializer: 'direct'}),
    } satisfies Routes;
    mion.initRoutes(routes);

    const request: RawRequest = {
      headers: headersFromRecord({}),
      body: JSON.stringify({
        sayHello: ['World'],
        [metadataKey]: [['sayHello']],
      }),
    };
    const response = await dispatchRoute('/sayHello', request.body, request.headers, headersFromRecord({}), request, {});

    expect(response.serializer).toBe(SerializerModes.stringifyJson);
    expect(typeof response.rawBody).toBe('string');
    const parsed = JSON.parse(response.rawBody as string);
    expect(parsed.sayHello).toBe('Hello, World!');
    const metadataRaw = parsed[metadataKey];
    expect(metadataRaw).toBeDefined();
    const metadata = (Array.isArray(metadataRaw) ? metadataRaw[1] : metadataRaw) as SerializableMethodsData;
    expect(metadata.methods).toHaveProperty('sayHello');
  });

  it('should force stringifyJson when route uses binary serializer', async () => {
    const routes = {
      sayHello: mion.route((ctx, name: string): string => `Hello, ${name}!`, {serializer: 'binary'}),
    } satisfies Routes;
    mion.initRoutes(routes);

    const request: RawRequest = {
      headers: headersFromRecord({}),
      body: JSON.stringify({
        sayHello: ['World'],
        [metadataKey]: [['sayHello']],
      }),
    };
    const response = await dispatchRoute('/sayHello', request.body, request.headers, headersFromRecord({}), request, {});

    expect(response.serializer).toBe(SerializerModes.stringifyJson);
    expect(typeof response.rawBody).toBe('string');
    const parsed = JSON.parse(response.rawBody as string);
    expect(parsed.sayHello).toBe('Hello, World!');
    const metadataRaw = parsed[metadataKey];
    expect(metadataRaw).toBeDefined();
    const metadata = (Array.isArray(metadataRaw) ? metadataRaw[1] : metadataRaw) as SerializableMethodsData;
    expect(metadata.methods).toHaveProperty('sayHello');
  });

  it('should keep original serializer when methodsMetadata is not requested', async () => {
    const routes = {
      sayHello: mion.route((ctx, name: string): string => `Hello, ${name}!`),
    } satisfies Routes;
    mion.initRoutes(routes);

    const request: RawRequest = {
      headers: headersFromRecord({}),
      body: JSON.stringify({
        sayHello: ['World'],
      }),
    };
    const response = await dispatchRoute('/sayHello', request.body, request.headers, headersFromRecord({}), request, {});

    // Default serializer is 'json' (SerializerModes.json)
    expect(response.serializer).toBe(SerializerModes.json);
    expect(response.body.sayHello).toBe('Hello, World!');
  });
});

describe('metadata is generated for everything the client can call', () => {
  // Not access control: routes are the public API, and a middleFn that takes params, takes headers or
  // returns data has to be described so the client can encode the call and decode the answer. Only a
  // raw middleFn and a middleFn with neither params nor return data have nothing to describe.
  const silent = mion.middleFn((ctx): void => undefined);
  const returnsData = mion.middleFn((ctx): null => null);
  const takesParams = mion.middleFn((ctx, token: string): void => undefined);
  const raw = mion.rawMiddleFn((ctx, req: unknown, resp: unknown, opts: unknown): void => undefined);
  const routes = {
    raw,
    takesParams,
    users: {silent, getUser: mion.route((ctx): string => 'user'), returnsData},
  } satisfies Routes;
  const methodsId = MION_ROUTES.methodsMetadataById;
  const methodsPath = getRoutePath([methodsId], {basePath: '', suffix: ''} as CoreRouterOptions);

  afterEach(() => resetRouter());

  async function describeAll(): Promise<SerializableMethodsData> {
    createMionRouter({contextDataFactory: () => ({user: null})}).initRoutes({...routes, ...mionClientRoutes});
    const request: RawRequest = {
      headers: headersFromRecord({}),
      body: JSON.stringify({takesParams: ['token'], [methodsId]: [[], true]}),
    };
    const response = await dispatchRoute(methodsPath, request.body, request.headers, headersFromRecord({}), request, {});
    return response.body[methodsId] as SerializableMethodsData;
  }

  it('lists every route and every param-taking or data-returning middleFn, and nothing else', async () => {
    const data = await describeAll();
    expect(Object.keys(data.methods).sort()).toEqual(['takesParams', 'users/getUser', 'users/returnsData']);
  });

  it('answers a by-id request for a middleFn with params but reports a raw or silent one as not found', async () => {
    createMionRouter({contextDataFactory: () => ({user: null})}).initRoutes({...routes, ...mionClientRoutes});
    const request: RawRequest = {
      headers: headersFromRecord({}),
      body: JSON.stringify({takesParams: ['token'], [methodsId]: [['takesParams', 'raw', 'users/silent']]}),
    };
    const response = await dispatchRoute(methodsPath, request.body, request.headers, headersFromRecord({}), request, {});
    const result = response.body[methodsId] as RpcError<string>;
    expect(result.type).toBe('rpc-metadata-not-found');
    expect(result.errorData).toEqual({raw: 'Remote Method raw not found'});
  });
});
