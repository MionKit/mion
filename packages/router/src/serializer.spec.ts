/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The `encoder` option end to end: what the route and factory literals make the build compile, the
// pair the runtime resolves, the framing derived from the chain, and each strategy's wire.
import {describe, it, expect, beforeEach} from 'vitest';
import {
  createMionRouter,
  resetRouter,
  getAnyExecutable,
  getRouteExecutable,
  getRouteExecutionChain,
  getMiddleFnExecutable,
} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import {headersFromRecord} from './lib/headers.ts';
import {MION_ROUTES, SerializerModes, type SerializerOption} from '@mionjs/core';
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
const compactMion = createMionRouter({serializer: 'compact'});
resetRouter();

const dispatchJson = (routeId: string, params: unknown[], body: Record<string, unknown> = {}) => {
  const request = {headers: headersFromRecord({}), body: JSON.stringify({[routeId]: params, ...body})};
  return dispatchRoute(`/${routeId}`, request.body, request.headers, headersFromRecord({}), request, {});
};

describe('serializer strategies at the router level', () => {
  beforeEach(() => resetRouter());

  describe('what the build compiles for each literal', () => {
    const plain = mion.route((ctx, p: Pet): Pet => p);
    const compact = mion.route((ctx, p: Pet): Pet => p, {serializer: 'compact'});
    const mixed = mion.route((ctx, p: Pet): Pet => p, {serializer: {params: 'clone', return: 'mutate'}});
    const preset = {serializer: 'compact', description: 'positional'} as const;
    const fromPreset = mion.route((ctx, p: Pet): Pet => p, preset);

    it('no literal anywhere: the built-in default, clone on both directions', () => {
      mion.initRoutes({plain});
      const exec = getRouteExecutable('plain')!;
      expect(exec.options.serializer).toEqual({params: 'clone', return: 'clone'});
      expect(exec.paramsJitFns.json.strategy).toBe('clone');
      expect(exec.returnJitFns.json.strategy).toBe('clone');
    });

    it('a string sets both directions', () => {
      mion.initRoutes({compact});
      const exec = getRouteExecutable('compact')!;
      expect(exec.options.serializer).toEqual({params: 'compact', return: 'compact'});
      expect(exec.paramsJitFns.json.strategy).toBe('compact');
      expect(exec.returnJitFns.json.strategy).toBe('compact');
    });

    it('an object literal names each direction', () => {
      mion.initRoutes({mixed});
      const exec = getRouteExecutable('mixed')!;
      expect(exec.paramsJitFns.json.strategy).toBe('clone');
      expect(exec.returnJitFns.json.strategy).toBe('mutate');
    });

    it('an `as const` preset passed by name works like the inline literal', () => {
      mion.initRoutes({fromPreset});
      const exec = getRouteExecutable('fromPreset')!;
      expect(exec.options.serializer).toEqual({params: 'compact', return: 'compact'});
      expect(exec.options.description).toBe('positional');
      expect(exec.returnJitFns.json.strategy).toBe('compact');
    });
  });

  describe('the factory literal is the router-wide default', () => {
    const inherited = compactMion.route((ctx, p: Pet): Pet => p);
    const overridden = compactMion.route((ctx, p: Pet): Pet => p, {serializer: {return: 'mutate'}});
    const guard = compactMion.middleFn((ctx, token: string): string => token);
    const anyRoute = mion.route((ctx): string => 'x');

    it('routes and middleFns inherit it; a route literal overrides one direction', () => {
      compactMion.initRoutes({guard, inherited, overridden});
      expect(getRouteExecutable('inherited')!.options.serializer).toEqual({params: 'compact', return: 'compact'});
      expect(getRouteExecutable('inherited')!.paramsJitFns.json.strategy).toBe('compact');
      expect(getRouteExecutable('overridden')!.options.serializer).toEqual({params: 'compact', return: 'mutate'});
      expect(getRouteExecutable('overridden')!.returnJitFns.json.strategy).toBe('mutate');
      expect(getMiddleFnExecutable('guard')!.options.serializer).toEqual({params: 'compact', return: 'compact'});
      expect(getMiddleFnExecutable('guard')!.paramsJitFns.json.strategy).toBe('compact');
    });

    // the cases above share the file's two factories; these two build their own router so the whole
    // path from the factory literal to the compiled functions is visible in one test
    it('a router-wide compact reaches a route that names no encoder', () => {
      const ownRouter = createMionRouter({serializer: 'compact'});
      const noLiteral = ownRouter.route((ctx, p: Pet): Pet => p);
      ownRouter.initRoutes({noLiteral});
      const exec = getRouteExecutable('noLiteral')!;
      expect(exec.options.serializer).toEqual({params: 'compact', return: 'compact'});
      expect(exec.paramsJitFns.json.strategy).toBe('compact');
      expect(exec.returnJitFns.json.strategy).toBe('compact');
    });

    it('a route literal beats a router-wide compact', () => {
      const ownRouter = createMionRouter({serializer: 'compact'});
      const goesMutate = ownRouter.route((ctx, p: Pet): Pet => p, {serializer: 'mutate'});
      ownRouter.initRoutes({goesMutate});
      const exec = getRouteExecutable('goesMutate')!;
      expect(exec.options.serializer).toEqual({params: 'mutate', return: 'mutate'});
      expect(exec.paramsJitFns.json.strategy).toBe('mutate');
      expect(exec.returnJitFns.json.strategy).toBe('mutate');
    });

    it('refuses to register a route whose runtime pair differs from what the build compiled', () => {
      // declared through the compact factory but initialized with no serializer: build compact, runtime defaults
      expect(() => createMionRouter({}).initRoutes({inherited})).toThrow(
        /is 'clone' at runtime but the build compiled 'compact'/
      );
    });

    it('rejects a widened factory serializer at the type level', () => {
      const widened = 'compact' as string;
      // @ts-expect-error a plain string is not one literal strategy
      const bad = () => createMionRouter({serializer: widened});
      const union = 'compact' as 'compact' | 'mutate';
      // @ts-expect-error a union is not one literal strategy
      const badUnion = () => createMionRouter({serializer: {return: union}});
      // @ts-expect-error the old key is retired
      const old = () => createMionRouter({serializer: 'json'});
      expect([bad, badUnion, old].length).toBe(3);
      // a runtime value that is not a strategy at all is refused at init
      const bogus = {serializer: 'yaml'} as unknown as {serializer: SerializerOption};
      expect(() => createMionRouter(bogus as never).initRoutes({anyRoute})).toThrow(/invalid serializer strategy 'yaml'/);
    });
  });

  // The strictTypes pair follows the SERVER's params decoder. `clone` and `compact` rebuild the
  // params from the declared type as they decode, so an undeclared key is gone before the handler
  // and there is nothing for an unknown-key check to find. Only `mutate` restores in place and
  // keeps every key, so only it keeps the pair. The answer side never compiles them on any wire: it
  // is written by the handler, never by a caller, and nothing reads them.
  describe('the unknown-key pair follows the wire', () => {
    const cloneRoute = mion.route((ctx, p: Pet): Pet => p, {serializer: 'clone'});
    const defaultRoute = mion.route((ctx, p: Pet): Pet => p);
    const mutateRoute = mion.route((ctx, p: Pet): Pet => p, {serializer: 'mutate'});
    const compactRoute = mion.route((ctx, p: Pet): Pet => p, {serializer: 'compact'});
    const mutateParamsOnly = mion.route((ctx, p: Pet): Pet => p, {serializer: {params: 'mutate', return: 'compact'}});
    const cloneParamsOnly = mion.route((ctx, p: Pet): Pet => p, {serializer: {params: 'clone', return: 'mutate'}});
    const compactGuard = compactMion.middleFn((ctx, p: Pet): Pet => p);

    it('a wire that restores in place compiles the pair', () => {
      mion.initRoutes({mutateRoute, mutateParamsOnly});
      for (const id of ['mutateRoute', 'mutateParamsOnly']) {
        const fns = getRouteExecutable(id)!.paramsJitFns;
        expect([id, !!fns.hasUnknownKeys]).toEqual([id, true]);
        expect([id, !!fns.unknownKeyErrors]).toEqual([id, true]);
      }
    });

    it('a rebuilding wire compiles neither, the default one included', () => {
      mion.initRoutes({cloneRoute, defaultRoute, compactRoute});
      for (const id of ['cloneRoute', 'defaultRoute', 'compactRoute']) {
        const fns = getRouteExecutable(id)!.paramsJitFns;
        expect([id, fns.hasUnknownKeys]).toEqual([id, undefined]);
        expect([id, fns.unknownKeyErrors]).toEqual([id, undefined]);
      }
    });

    it('only the params direction decides', () => {
      mion.initRoutes({mutateParamsOnly, cloneParamsOnly});
      const kept = getRouteExecutable('mutateParamsOnly')!.paramsJitFns;
      expect(!!kept.hasUnknownKeys).toBe(true);
      expect(!!kept.unknownKeyErrors).toBe(true);
      const dropped = getRouteExecutable('cloneParamsOnly')!.paramsJitFns;
      expect(dropped.hasUnknownKeys).toBeUndefined();
      expect(dropped.unknownKeyErrors).toBeUndefined();
    });

    it('a middleFn follows its router-wide wire too', () => {
      compactMion.initRoutes({compactGuard});
      const fns = getMiddleFnExecutable('compactGuard')!.paramsJitFns;
      expect(fns.hasUnknownKeys).toBeUndefined();
      expect(fns.unknownKeyErrors).toBeUndefined();
    });

    it('no wire compiles the pair for the answer side', () => {
      mion.initRoutes({cloneRoute, mutateRoute, mutateParamsOnly, compactRoute});
      for (const id of ['cloneRoute', 'mutateRoute', 'mutateParamsOnly', 'compactRoute']) {
        const fns = getRouteExecutable(id)!.returnJitFns;
        expect([id, fns.hasUnknownKeys]).toEqual([id, undefined]);
        expect([id, fns.unknownKeyErrors]).toEqual([id, undefined]);
      }
    });
  });

  // Response framing no longer varies: a route hands the adapter a JSON-safe value whatever its
  // strategy, and `stringifyJson` is left for the REQUEST body and the client's own wire.
  describe('every chain frames its response as json', () => {
    const defaultRoute = mion.route((ctx, p: Pet): Pet => p);
    const mutateRoute = mion.route((ctx, p: Pet): Pet => p, {serializer: {return: 'mutate'}});
    const compactRoute = mion.route((ctx, p: Pet): Pet => p, {serializer: 'compact'});
    const mutateMiddleFn = mion.middleFn((ctx): string => 'stamp', {serializer: {return: 'mutate'}});

    it('whatever the route strategy', () => {
      mion.initRoutes({defaultRoute, mutateRoute, compactRoute});
      expect(getRouteExecutionChain('/defaultRoute')!.serializer).toBe(SerializerModes.json);
      expect(getRouteExecutionChain('/mutateRoute')!.serializer).toBe(SerializerModes.json);
      expect(getRouteExecutionChain('/compactRoute')!.serializer).toBe(SerializerModes.json);
    });

    it('and whatever a middleFn in the chain returns', () => {
      mion.initRoutes({mutateMiddleFn, defaultRoute});
      expect(getRouteExecutionChain('/defaultRoute')!.serializer).toBe(SerializerModes.json);
    });
  });

  describe('the wire of each strategy through dispatch', () => {
    const compactRoute = mion.route((ctx, p: Pet, note: string): Pet => ({...p, name: `${p.name}:${note}`}), {
      serializer: 'compact',
    });
    const shared = pet();
    const cloneRoute = mion.route((ctx): Pet => shared, {serializer: 'clone'});
    // the wide row a handler reads from a store, and the narrow slice its return type declares
    const wideRow = {...pet(), secret: 'do not send', notes: 'internal', size: 42};
    const trimmedRoute = mion.route((ctx): Pick<Pet, 'name'> => wideRow as Pick<Pet, 'name'>);
    const mutateRoute = mion.route((ctx): Pick<Pet, 'name'> => ({...wideRow}) as Pick<Pet, 'name'>, {serializer: 'mutate'});

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

    it('the default drops every property the return type does not declare', async () => {
      mion.initRoutes({trimmedRoute});
      const response = await dispatchJson('trimmedRoute', []);
      expect(response.hasErrors).toBe(false);
      // the handler returned the whole row; only the declared property rides
      expect(response.body.trimmedRoute).toEqual({name: 'rex'});
      expect(JSON.stringify(response.body)).not.toContain('do not send');
    });

    it('mutate keeps the undeclared properties on the wire, which is the trade for its speed', async () => {
      mion.initRoutes({mutateRoute});
      const response = await dispatchJson('mutateRoute', []);
      expect(response.hasErrors).toBe(false);
      expect(response.body.mutateRoute).toMatchObject({name: 'rex', secret: 'do not send'});
    });
  });

  // Encoding is only half the promise. A route's strategy also decides what survives on the way
  // IN, because the caller need not be a mion client: curl, another language or a patched client
  // can send whatever it likes, and only the decoder stands between that and the handler.
  // The return wire is decoded by the CLIENT, and the client's decoder is not the server's. Whatever
  // a strategy puts on the wire, a caller of a mion client never sees a property the return type
  // does not declare: `mutate` sends its undeclared keys and the client still drops them.
  describe('what arrives at the caller', () => {
    interface Slice {
      name: string;
    }
    const wideRow = {name: 'rex', secret: 'do not send', notes: 'internal'};
    const cloneOut = mion.route((ctx): Slice => ({...wideRow}) as Slice, {serializer: {return: 'clone'}});
    const mutateOut = mion.route((ctx): Slice => ({...wideRow}) as Slice, {serializer: {return: 'mutate'}});

    const decodedReturn = async (id: 'cloneOut' | 'mutateOut') => {
      const response = await dispatchJson(id, []);
      expect(response.hasErrors).toBe(false);
      const decode = getRouteExecutable(id)!.returnJitFns.json.decode.fn!;
      // the wire the platform would write, read back the way the client reads it
      return decode(JSON.parse(JSON.stringify(response.body[id]))) as Slice;
    };

    it('clone sends only the declared property, and the caller gets only that', async () => {
      mion.initRoutes({cloneOut});
      expect(Object.keys(await decodedReturn('cloneOut'))).toEqual(['name']);
    });

    it('mutate sends the undeclared ones, and the caller still gets only the declared property', async () => {
      mion.initRoutes({mutateOut});
      const response = await dispatchJson('mutateOut', []);
      // on the wire: mutate is the strategy that passes the object through
      expect(response.body.mutateOut).toMatchObject({secret: 'do not send'});
      // at the caller: the client's decoder rebuilds the declared shape
      expect(Object.keys(await decodedReturn('mutateOut'))).toEqual(['name']);
    });

    // A cache key is `<familyPrefix>_<typeId>`, so the prefix is what says which decoder was
    // compiled. On a route that is `mutate` BOTH ways the two sides still differ, which is the
    // split itself.
    it('so the two sides of mutate compile different decode families', () => {
      const bothWays = mion.route((ctx, slice: Slice): Slice => slice, {serializer: 'mutate'});
      mion.initRoutes({bothWays});
      const exec = getRouteExecutable('bothWays')!;
      const family = (hash: string) => hash.split('_')[0];
      expect(family(exec.paramsJitFns.json.decode.rtFnHash)).not.toBe(family(exec.returnJitFns.json.decode.rtFnHash));
    });
  });

  describe('what arrives at the handler', () => {
    interface SimplePet {
      name: string;
      born: Date;
    }
    interface Nested {
      pet: SimplePet;
    }
    type Bag = Record<string, string>;

    const seen: Record<string, unknown> = {};
    const cloneIn = mion.route((ctx, p: SimplePet): string => {
      seen.clone = p;
      return p.name;
    });
    const nestedIn = mion.route((ctx, n: Nested): string => {
      seen.nested = n;
      return n.pet.name;
    });
    const mutateIn = mion.route(
      (ctx, p: SimplePet): string => {
        seen.mutate = p;
        return p.name;
      },
      {serializer: {params: 'mutate'}}
    );
    const bagIn = mion.route((ctx, bag: Bag): number => {
      seen.bag = bag;
      return Object.keys(bag).length;
    });

    const wirePet = {name: 'rex', born: '2020-01-02T03:04:05.000Z'};

    it('clone drops an undeclared key before the handler sees it', async () => {
      mion.initRoutes({cloneIn});
      const response = await dispatchJson('cloneIn', [{...wirePet, extra: 'nope'}]);
      expect(response.hasErrors).toBe(false);
      expect(Object.keys(seen.clone as object).sort()).toEqual(['born', 'name']);
      // gone, not set to undefined: the key must not survive a spread
      expect('extra' in (seen.clone as object)).toBe(false);
    });

    it('clone drops an undeclared key nested one object deeper too', async () => {
      mion.initRoutes({nestedIn});
      const response = await dispatchJson('nestedIn', [{pet: {...wirePet, extra: 'nope'}, other: 1}]);
      expect(response.hasErrors).toBe(false);
      const arrived = seen.nested as Nested;
      expect(Object.keys(arrived).sort()).toEqual(['pet']);
      expect(Object.keys(arrived.pet).sort()).toEqual(['born', 'name']);
    });

    it('clone still restores the declared values it keeps', async () => {
      mion.initRoutes({cloneIn});
      await dispatchJson('cloneIn', [{...wirePet, extra: 'nope'}]);
      const arrived = seen.clone as SimplePet;
      expect(arrived.name).toBe('rex');
      expect(arrived.born).toBeInstanceOf(Date);
      expect(arrived.born.toISOString()).toBe('2020-01-02T03:04:05.000Z');
    });

    it('mutate hands the handler what arrived, undeclared keys and all', async () => {
      mion.initRoutes({mutateIn});
      const response = await dispatchJson('mutateIn', [{...wirePet, extra: 'nope'}]);
      expect(response.hasErrors).toBe(false);
      expect(seen.mutate).toMatchObject({name: 'rex', extra: 'nope'});
    });

    it('a key an index signature declares is kept, it is not undeclared', async () => {
      mion.initRoutes({bagIn});
      const response = await dispatchJson('bagIn', [{a: 'x', b: 'y'}]);
      expect(response.hasErrors).toBe(false);
      expect(seen.bag).toEqual({a: 'x', b: 'y'});
    });

    it('a prototype-named key on the wire is refused, never written onto the object', async () => {
      mion.initRoutes({bagIn});
      const request = {headers: headersFromRecord({}), body: '{"bagIn":[{"__proto__":"x"}]}'};
      const response = await dispatchRoute('/bagIn', request.body, request.headers, headersFromRecord({}), request, {});
      expect(response.hasErrors).toBe(true);
      expect(({} as Record<string, unknown>).x).toBeUndefined();
    });

    it('clone drops an undeclared key hiding inside a union member', async () => {
      // A union of an array and a number carries no object member of its own, so the
      // encoder and decoder both used to hand it straight through and the object inside the array
      // kept whatever the caller sent. Validation does not cover it: undeclared keys on an object
      // literal are accepted unless strictTypes is on.
      const unionIn = mion.route((ctx, p: {a: string}[] | number): string => {
        seen.union = p;
        return typeof p === 'number' ? 'num' : String(p.length);
      });
      mion.initRoutes({unionIn});
      const response = await dispatchJson('unionIn', [[{a: 'x', extra: 'nope'}]]);
      expect(response.hasErrors).toBe(false);
      const arrived = seen.union as {a: string}[];
      expect(Object.keys(arrived[0]).sort()).toEqual(['a']);
      expect('extra' in arrived[0]).toBe(false);
    });

    it('the clone return drops an undeclared key inside a union member as well', async () => {
      const wide = [{a: 'x', secret: 'do not send'}];
      const unionOut = mion.route((ctx): {a: string}[] | number => wide as {a: string}[]);
      mion.initRoutes({unionOut});
      const response = await dispatchJson('unionOut', []);
      expect(response.hasErrors).toBe(false);
      const body = response.body.unionOut as {a: string}[];
      expect(Object.keys(body[0]).sort()).toEqual(['a']);
    });

    it('the clone return drops an undeclared key too, so the rule reads the same both ways', async () => {
      const wide = {name: 'rex', born: new Date('2020-01-02T03:04:05.000Z'), secret: 'do not send'};
      const bothWays = mion.route((ctx): SimplePet => wide as SimplePet);
      mion.initRoutes({bothWays});
      const response = await dispatchJson('bothWays', []);
      expect(response.hasErrors).toBe(false);
      expect(Object.keys(response.body.bothWays as object).sort()).toEqual(['born', 'name']);
    });
  });

  // A middleFn declaring no `encoder` of its own inherits the route's wire like any chain member.
  // Its params and its return value must BOTH survive the round trip: a chain member whose data is
  // dropped from the body is silent data loss, which is what this pins against.
  describe('a chain member with no encoder of its own', () => {
    const stamp = compactMion.middleFn((ctx, tag?: string): {tag: string} | null => (tag ? {tag} : null));
    const compactRoute = compactMion.route((ctx, p: Pet): Pet => p);

    it('a plain middleFn carries its params AND its return value on the compact wire', async () => {
      compactMion.initRoutes({stamp, compactRoute});
      const stampExec = getMiddleFnExecutable('stamp')!;
      const routeExec = getRouteExecutable('compactRoute')!;
      // the middleFn rides the router-wide wire, exactly like the route
      expect(stampExec.options.serializer).toEqual({params: 'compact', return: 'compact'});
      expect(routeExec.options.serializer).toEqual({params: 'compact', return: 'compact'});

      const encodeStamp = stampExec.paramsJitFns.json.encode.fn;
      const encodeRoute = routeExec.paramsJitFns.json.encode.fn;
      const body = {
        stamp: JSON.parse(JSON.stringify(encodeStamp(['marked']))),
        compactRoute: JSON.parse(JSON.stringify(encodeRoute([pet()]))),
      };
      const request = {headers: headersFromRecord({}), body: JSON.stringify(body)};
      const response = await dispatchRoute('/compactRoute', request.body, request.headers, headersFromRecord({}), request, {});
      expect(response.hasErrors).toBe(false);
      // the middleFn read its params (so they reached the server) and its return value is on the wire
      const decodeStamp = stampExec.returnJitFns.json.decode.fn;
      expect(decodeStamp(response.body.stamp)).toEqual({tag: 'marked'});
      expect(response.body.compactRoute).toBeDefined();
    });
  });

  // mion's own built-in methods (@thrownErrors, notFound, platformError, the metadata middleFn)
  // are DECLARED at module level, through the same helper bodies the factory closes over. They
  // cannot inherit a router-wide `encoder`: createMionRouter is generic, so a marker call site
  // inside it would carry an unresolved type parameter, and initRouter takes the widened options
  // type. The build therefore compiles them against the built-in default, and each one must PIN
  // that default. An unpinned one resolves the router-wide value at runtime, disagrees with what
  // the build compiled, and refuses to start.
  describe("mion's own built-in methods", () => {
    const plainRoute = mion.route((ctx, p: Pet): Pet => p);

    // each built-in method's resolved pair must be the one its own compiled functions carry, never
    // the router-wide value; a mismatch is what assertCompiledSerializer refuses to start on
    const expectBuiltInsPinned = () => {
      for (const id of Object.values(MION_ROUTES) as string[]) {
        const method = getAnyExecutable(id) as RemoteMethod | undefined;
        const pinned = method?.options?.serializer;
        if (!pinned) continue;
        expect([id, method.paramsJitFns.json.strategy]).toEqual([id, pinned.params]);
        expect([id, method.returnJitFns.json.strategy]).toEqual([id, pinned.return]);
      }
    };

    // one test per strategy, each with an INLINE literal: a variable holding the union would widen
    // the serializer, which resolves to the default instead of the value under test
    it('pin their own wire under a router-wide compact', () => {
      const ownRouter = createMionRouter({serializer: 'compact'});
      ownRouter.initRoutes({noLiteral: ownRouter.route((ctx, p: Pet): Pet => p)});
      expectBuiltInsPinned();
    });

    it('pin their own wire under a router-wide direct', () => {
      const ownRouter = createMionRouter({serializer: 'mutate'});
      ownRouter.initRoutes({noLiteral: ownRouter.route((ctx, p: Pet): Pet => p)});
      expectBuiltInsPinned();
    });

    it('pin their own wire under a router-wide mutate', () => {
      const ownRouter = createMionRouter({serializer: 'mutate'});
      ownRouter.initRoutes({noLiteral: ownRouter.route((ctx, p: Pet): Pet => p)});
      expectBuiltInsPinned();
    });

    it('compile real functions, not noop placeholders', () => {
      mion.initRoutes({plainRoute});
      const thrown = getAnyExecutable(MION_ROUTES.thrownErrors) as RemoteMethod;
      const metadata = getAnyExecutable(MION_ROUTES.methodsMetadata) as RemoteMethod;
      // a typed built-in method needs its compiled functions like any other: a noop encoder here
      // would mean the build never saw the call site
      expect(thrown.returnJitFns.json.encode.isNoop).toBe(false);
      expect(thrown.returnJitHash).not.toBe('');
      expect(metadata.returnJitFns.json.encode.isNoop).toBe(false);
      expect(metadata.returnJitHash).not.toBe('');
    });
  });

  // `binary` is not a wire strategy. The generic strategy error names the ones that are.
  describe('an unknown strategy', () => {
    it('rejects it on a route, on a middleFn and on the router option', () => {
      const badRoute = mion.route((ctx, p: Pet): Pet => p, {serializer: 'binary' as unknown as 'compact'});
      expect(() => mion.initRoutes({badRoute})).toThrow(/invalid serializer strategy 'binary'/);
      resetRouter();
      const badMiddleFn = mion.middleFn((ctx): string => 'x', {serializer: 'binary' as unknown as 'compact'});
      const okRoute = mion.route((ctx, p: Pet): Pet => p);
      expect(() => mion.initRoutes({badMiddleFn, okRoute})).toThrow(/invalid serializer strategy 'binary'/);
      resetRouter();
      const badRouter = createMionRouter({serializer: 'binary' as unknown as 'compact'});
      const inherits = badRouter.route((ctx, p: Pet): Pet => p);
      expect(() => badRouter.initRoutes({inherits})).toThrow(/invalid serializer strategy 'binary'/);
    });

    it('names the strategies that do exist', () => {
      const badRoute = mion.route((ctx, p: Pet): Pet => p, {serializer: 'binary' as unknown as 'compact'});
      expect(() => mion.initRoutes({badRoute})).toThrow(/clone, mutate, compact/);
    });
  });
});
