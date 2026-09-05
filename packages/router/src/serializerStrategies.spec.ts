/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {binaryTestRoutes} from '@mionjs/test-server';
import {
  createMionRouter,
  getMiddleFnExecutable,
  getRouteExecutable,
  getRouteExecutionChain,
  getRouterOptions,
  resetRouter,
} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import {headersFromRecord} from './lib/headers.ts';
import {getBatchExecutionChain, registerBatches} from './batches.ts';
import {deserializeBinaryBody, MION_ROUTES, SerializerModes} from '@mionjs/core';
import type {RtMarkerPayload} from '@mionjs/core';
import type {Routes} from './types/general.ts';

type SimpleUser = {name: string; age: number};
type Stamp = {when: Date; tags: string[]};

// Three factories, one per router default under test. Each definition carries exactly what the build injected for the
// options of the factory that declared it; the router runtime is reset in between (the once-guard, nothing else).
resetRouter(); // the test-server fixture created its own factory at import
const mion = createMionRouter();
resetRouter();
const compactMion = createMionRouter({serializer: 'compact'});
resetRouter();
const directMion = createMionRouter({serializer: {return: 'direct'}});
resetRouter();

const PRESET = {serializer: 'clone'} as const;

/** The family tags the build injected for one side of a definition, sorted. */
function families(def: {rtFns?: RtMarkerPayload}, side: 'paramsFns' | 'returnFns'): string[] {
  return (def.rtFns![side] as unknown[][]).map((tuple) => tuple[0] as string).sort();
}

const dispatchJson = (id: string, params: unknown[]) => {
  const headers = headersFromRecord({});
  const body = JSON.stringify({[id]: params});
  return dispatchRoute(`/${id}`, body, headers, headersFromRecord({}), {headers, body}, {});
};

describe('serializer strategies: the compiled families follow the option', () => {
  const plain = mion.route((ctx, user: SimpleUser): Stamp => ({when: new Date(0), tags: [user.name]}));
  const compact = mion.route((ctx, user: SimpleUser): Stamp => ({when: new Date(0), tags: [user.name]}), {serializer: 'compact'});
  const returnBinary = mion.route((ctx, user: SimpleUser): Stamp => ({when: new Date(0), tags: []}), {
    serializer: {return: 'binary'},
  });
  const preset = mion.route((ctx, user: SimpleUser): Stamp => ({when: new Date(0), tags: []}), PRESET);
  const inherits = compactMion.route((ctx, user: SimpleUser): Stamp => ({when: new Date(0), tags: []}));
  const overrides = compactMion.route((ctx, user: SimpleUser): Stamp => ({when: new Date(0), tags: []}), {
    serializer: {return: 'direct'},
  });

  it('no option: the built-in pair per direction, and nothing binary', () => {
    expect(families(plain, 'paramsFns')).toEqual(['fmt', 'huk', 'rj', 'sj', 'uke', 'val', 'verr']);
    expect(families(plain, 'returnFns')).toEqual(['huk', 'pj', 'rj', 'uke', 'val', 'verr']);
  });

  it('a string sets both directions', () => {
    expect(families(compact, 'paramsFns')).toEqual(['cj', 'cjr', 'fmt', 'huk', 'uke', 'val', 'verr']);
    expect(families(compact, 'returnFns')).toEqual(['cj', 'cjr', 'huk', 'uke', 'val', 'verr']);
  });

  it('binary adds the binary pair beside the built-in json pair of its direction', () => {
    expect(families(returnBinary, 'paramsFns')).toEqual(['fmt', 'huk', 'rj', 'sj', 'uke', 'val', 'verr']);
    expect(families(returnBinary, 'returnFns')).toEqual(['fb', 'huk', 'pj', 'rj', 'tb', 'uke', 'val', 'verr']);
  });

  it('an `as const` preset passed by name is a literal to the build', () => {
    expect(families(preset, 'paramsFns')).toContain('pjs');
    expect(families(preset, 'returnFns')).toContain('pjs');
  });

  it('the factory default flows into every route, and a route literal overrides it per direction', () => {
    expect(families(inherits, 'paramsFns')).toContain('cj');
    expect(families(inherits, 'returnFns')).toContain('cjr');
    expect(families(overrides, 'paramsFns')).toContain('cj');
    expect(families(overrides, 'returnFns')).toEqual(['huk', 'rj', 'sj', 'uke', 'val', 'verr']);
  });
});

describe('serializer strategies: resolution at registration', () => {
  const plain = mion.route((ctx, user: SimpleUser): SimpleUser => user);
  const mixed = mion.route((ctx, user: SimpleUser): SimpleUser => user, {serializer: {params: 'compact', return: 'direct'}});
  const middle = mion.middleFn((ctx, token?: string): string => token ?? '');
  const compactMiddle = compactMion.middleFn((ctx, token?: string): string => token ?? '');
  const compactRoute = compactMion.route((ctx, user: SimpleUser): SimpleUser => user);

  beforeEach(() => resetRouter());

  it('stores the serializer resolved per direction on routes and middleFns', () => {
    createMionRouter().initRoutes({plain, mixed, middle});
    expect(getRouteExecutable('plain')!.options.serializer).toEqual({params: 'direct', return: 'mutate'});
    expect(getRouteExecutable('mixed')!.options.serializer).toEqual({params: 'compact', return: 'direct'});
    expect(getMiddleFnExecutable('middle')!.options.serializer).toEqual({params: 'direct', return: 'mutate'});
  });

  it('applies the router default to a route or middleFn without option', () => {
    createMionRouter({serializer: 'compact'}).initRoutes({compactRoute, compactMiddle});
    expect(getRouteExecutable('compactRoute')!.options.serializer).toEqual({params: 'compact', return: 'compact'});
    expect(getMiddleFnExecutable('compactMiddle')!.options.serializer).toEqual({params: 'compact', return: 'compact'});
    expect(getRouterOptions().serializer).toBe('compact');
  });

  it('refuses a route whose build saw other options than the router it is initialized with', () => {
    expect(() => createMionRouter({serializer: 'compact'}).initRoutes({plain})).toThrow(
      /'plain' was compiled with the params serializer 'direct' but resolves to 'compact'/
    );
    resetRouter();
    expect(() => createMionRouter().initRoutes({compactRoute})).toThrow(
      /'compactRoute' was compiled with the params serializer 'compact' but resolves to 'direct'/
    );
  });

  it('rejects a widened factory serializer at the type level', () => {
    const widened: {serializer: 'compact' | 'direct'} = {serializer: 'compact'};
    // @ts-expect-error a union is not one literal per direction: the build could not read it
    const make = () => createMionRouter(widened);
    expect(make).toBeTypeOf('function');
  });
});

describe('serializer strategies: the response framing follows the chain', () => {
  const plain = mion.route((ctx, user: SimpleUser): SimpleUser => user);
  const direct = mion.route((ctx, user: SimpleUser): SimpleUser => user, {serializer: {return: 'direct'}});
  const binary = mion.route((ctx, user: SimpleUser): SimpleUser => user, {serializer: {return: 'binary'}});
  const directMiddle = mion.middleFn((ctx, token?: string): string => token ?? '', {serializer: {return: 'direct'}});
  const inheritsDirect = directMion.route((ctx, user: SimpleUser): SimpleUser => user);

  beforeEach(() => resetRouter());

  it('json when every member hands the platform a value, stringifyJson once a member writes its own string', () => {
    createMionRouter().initRoutes({plain, direct, binary, scoped: {directMiddle, plainInside: plain}});
    expect(getRouteExecutionChain('/plain')!.serializer).toBe(SerializerModes.json);
    expect(getRouteExecutionChain('/direct')!.serializer).toBe(SerializerModes.stringifyJson);
    expect(getRouteExecutionChain('/binary')!.serializer).toBe(SerializerModes.binary);
    // a direct middleFn in the chain of a mutate route makes the router join the strings
    expect(getRouteExecutionChain('/scoped/plainInside')!.serializer).toBe(SerializerModes.stringifyJson);
  });

  it('a direct router default frames every response as stringifyJson', () => {
    createMionRouter({serializer: {return: 'direct'}}).initRoutes({inheritsDirect});
    expect(getRouteExecutionChain('/inheritsDirect')!.serializer).toBe(SerializerModes.stringifyJson);
  });

  it('a merged batch chain is framed by its members too', () => {
    createMionRouter().initRoutes({plain, direct});
    registerBatches({plainOnly: {routes: ['plain']}, withDirect: {routes: ['plain', 'direct']}});
    const opts = getRouterOptions();
    expect(getBatchExecutionChain({}, opts, 'id=plainOnly').executionChain.serializer).toBe(SerializerModes.json);
    expect(getBatchExecutionChain({}, opts, 'id=withDirect').executionChain.serializer).toBe(SerializerModes.stringifyJson);
  });
});

describe('serializer strategies: compact end to end at the router level', () => {
  const bump = compactMion.route((ctx, user: SimpleUser): SimpleUser => ({...user, age: user.age + 1}));
  const stamp = compactMion.route((ctx, when: Date, tags: string[]): Stamp => ({when, tags}));

  beforeEach(() => {
    resetRouter();
    createMionRouter({serializer: 'compact'}).initRoutes({bump, stamp});
  });

  it('decodes positional params and answers a positional value', async () => {
    const response = await dispatchJson('bump', [['john', 30]]);
    expect(response.hasErrors).toBe(false);
    // json framing: the body holds the prepared value, positional and key-less
    expect(response.body.bump).toEqual(['john', 31]);
  });

  it('scalars and arrays of scalars ride the compact wire unchanged', async () => {
    const response = await dispatchJson('stamp', ['2024-01-02T00:00:00.000Z', ['a', 'b']]);
    expect(response.hasErrors).toBe(false);
    expect(response.body.stamp).toEqual(['2024-01-02T00:00:00.000Z', ['a', 'b']]);
  });

  it('a keyed object on a compact wire is left to validation, which still holds the type', async () => {
    // the compact decoder converts only its own positional form and leaves anything else for validate
    const accepted = await dispatchJson('bump', [{name: 'john', age: 30}]);
    expect(accepted.hasErrors).toBe(false);
    expect(accepted.body.bump).toEqual(['john', 31]);
    const rejected = await dispatchJson('bump', [{name: 'john', age: 'thirty'}]);
    expect(rejected.hasErrors).toBe(true);
    expect(rejected.body[MION_ROUTES.thrownErrors]?.bump).toMatchObject({type: 'validation-error'});
  });
});

describe('serializer strategies: a binary route still answers a plain JSON request', () => {
  beforeEach(() => {
    resetRouter();
    createMionRouter({serializer: 'binary'}).initRoutes(binaryTestRoutes satisfies Routes);
  });

  it('decodes the JSON params with the json pair kept beside the binary one, and answers binary', async () => {
    const response = await dispatchJson('echo', ['hello']);
    expect(response.hasErrors).toBe(false);
    expect(response.serializer).toBe(SerializerModes.binary);
    const {body} = deserializeBinaryBody('/echo', response.binSerializer!.getBufferView(), true);
    expect(body.echo).toBe('hello');
  });
});
