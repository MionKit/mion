/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The `parser` option end to end: what the build compiles, what the runtime resolves, the framing, and each wire.
import {describe, it, expect, beforeEach} from 'vitest';
import {
  createMionRouter,
  resetRouter,
  getAnyExecutable,
  getRouteExecutable,
  getRouteExecutionChain,
  getMiddlewareExecutable,
} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import {headersFromRecord} from './lib/headers.ts';
import {JIT_FUNCTION_IDS, MION_ROUTES, SerializerModes, type ParserOption} from '@mionjs/core';
import type {RemoteMethod} from './types/remoteMethods.ts';

interface Pet {
  name: string;
  born: Date;
  tags?: string[];
}

const pet = (): Pet => ({name: 'rex', born: new Date('2020-01-02T03:04:05.000Z'), tags: ['good']});

// the two factories this file declares routes through: no router-wide parser, and a compact one
const mion = createMionRouter();
resetRouter();
const compactMion = createMionRouter({parser: 'compact'});
resetRouter();

const dispatchJson = (routeId: string, params: unknown[], body: Record<string, unknown> = {}) => {
  const request = {headers: headersFromRecord({}), body: JSON.stringify({[routeId]: params, ...body})};
  return dispatchRoute(`/${routeId}`, request.body, request.headers, headersFromRecord({}), request, {});
};

describe('parser strategies at the router level', () => {
  beforeEach(() => resetRouter());

  describe('what the build compiles for each literal', () => {
    const plain = mion.route((ctx, p: Pet): Pet => p);
    const compact = mion.route((ctx, p: Pet): Pet => p, {parser: 'compact'});
    const mixed = mion.route((ctx, p: Pet): Pet => p, {parser: {params: 'clone', return: 'mutate'}});
    const preset = {parser: 'compact', description: 'positional'} as const;
    const fromPreset = mion.route((ctx, p: Pet): Pet => p, preset);

    it('no literal anywhere: the built-in default, clone on both directions', () => {
      mion.initRoutes({plain});
      const exec = getRouteExecutable('plain')!;
      expect(exec.options.parser).toEqual({params: 'clone', return: 'clone'});
      expect(exec.paramsJitFns.json.strategy).toBe('clone');
      expect(exec.returnJitFns.json.strategy).toBe('clone');
    });

    it('a string sets both directions', () => {
      mion.initRoutes({compact});
      const exec = getRouteExecutable('compact')!;
      expect(exec.options.parser).toEqual({params: 'compact', return: 'compact'});
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
      expect(exec.options.parser).toEqual({params: 'compact', return: 'compact'});
      expect(exec.options.description).toBe('positional');
      expect(exec.returnJitFns.json.strategy).toBe('compact');
    });
  });

  describe('the factory literal is the router-wide default', () => {
    const inherited = compactMion.route((ctx, p: Pet): Pet => p);
    const overridden = compactMion.route((ctx, p: Pet): Pet => p, {parser: {return: 'mutate'}});
    const guard = compactMion.middleware((ctx, token: string): string => token);
    const anyRoute = mion.route((ctx): string => 'x');

    it('routes and middlewares inherit it; a route literal overrides one direction', () => {
      compactMion.initRoutes({guard, inherited, overridden});
      expect(getRouteExecutable('inherited')!.options.parser).toEqual({params: 'compact', return: 'compact'});
      expect(getRouteExecutable('inherited')!.paramsJitFns.json.strategy).toBe('compact');
      expect(getRouteExecutable('overridden')!.options.parser).toEqual({params: 'compact', return: 'mutate'});
      expect(getRouteExecutable('overridden')!.returnJitFns.json.strategy).toBe('mutate');
      expect(getMiddlewareExecutable('guard')!.options.parser).toEqual({params: 'compact', return: 'compact'});
      expect(getMiddlewareExecutable('guard')!.paramsJitFns.json.strategy).toBe('compact');
    });

    // these two build their own router, so the path from factory literal to compiled functions is one test
    it('a router-wide compact reaches a route that names no parser', () => {
      const ownRouter = createMionRouter({parser: 'compact'});
      const noLiteral = ownRouter.route((ctx, p: Pet): Pet => p);
      ownRouter.initRoutes({noLiteral});
      const exec = getRouteExecutable('noLiteral')!;
      expect(exec.options.parser).toEqual({params: 'compact', return: 'compact'});
      expect(exec.paramsJitFns.json.strategy).toBe('compact');
      expect(exec.returnJitFns.json.strategy).toBe('compact');
    });

    it('a route literal beats a router-wide compact', () => {
      const ownRouter = createMionRouter({parser: 'compact'});
      const goesMutate = ownRouter.route((ctx, p: Pet): Pet => p, {parser: 'mutate'});
      ownRouter.initRoutes({goesMutate});
      const exec = getRouteExecutable('goesMutate')!;
      expect(exec.options.parser).toEqual({params: 'mutate', return: 'mutate'});
      expect(exec.paramsJitFns.json.strategy).toBe('mutate');
      expect(exec.returnJitFns.json.strategy).toBe('mutate');
    });

    it('refuses to register a route whose runtime pair differs from what the build compiled', () => {
      // declared through the compact factory but initialized with no parser: build compact, runtime defaults
      expect(() => createMionRouter({}).initRoutes({inherited})).toThrow(
        /is 'clone' at runtime but the build compiled 'compact'/
      );
    });

    it('rejects a widened factory parser at the type level', () => {
      const widened = 'compact' as string;
      // @ts-expect-error a plain string is not one literal strategy
      const bad = () => createMionRouter({parser: widened});
      const union = 'compact' as 'compact' | 'mutate';
      // @ts-expect-error a union is not one literal strategy
      const badUnion = () => createMionRouter({parser: {return: union}});
      // @ts-expect-error the old key is retired
      const old = () => createMionRouter({parser: 'json'});
      expect([bad, badUnion, old].length).toBe(3);
      // a runtime value that is not a strategy at all is refused at init
      const bogus = {parser: 'yaml'} as unknown as {parser: ParserOption};
      expect(() => createMionRouter(bogus as never).initRoutes({anyRoute})).toThrow(/invalid parser strategy 'yaml'/);
    });
  });

  // ONE validator per strategy, the same row whichever wire asks. The stripping strategies take the union-scoped
  // one: their decoder already rebuilt the declared shape, so only a sibling member's key can survive.
  describe('the validate family follows the wire', () => {
    const cloneRoute = mion.route((ctx, p: Pet): Pet => p, {parser: 'clone'});
    const defaultRoute = mion.route((ctx, p: Pet): Pet => p);
    const mutateRoute = mion.route((ctx, p: Pet): Pet => p, {parser: 'mutate'});
    const strictRoute = mion.route((ctx, p: Pet): Pet => p, {parser: {params: 'mutateStrict'}});
    const compactRoute = mion.route((ctx, p: Pet): Pet => p, {parser: 'compact'});
    const mutateParamsOnly = mion.route((ctx, p: Pet): Pet => p, {parser: {params: 'mutate', return: 'compact'}});
    const cloneParamsOnly = mion.route((ctx, p: Pet): Pet => p, {parser: {params: 'clone', return: 'mutate'}});
    const compactGuard = compactMion.middleware((ctx, p: Pet): Pet => p);

    const familyOf = (fns: {isType: {rtFnHash: string}}) => fns.isType.rtFnHash.split('_')[0];

    it('each strategy compiles its own params validator', () => {
      mion.initRoutes({cloneRoute, defaultRoute, mutateRoute, strictRoute, compactRoute});
      const expected: Record<string, string> = {
        cloneRoute: JIT_FUNCTION_IDS.validateUnionKeys,
        defaultRoute: JIT_FUNCTION_IDS.validateUnionKeys,
        compactRoute: JIT_FUNCTION_IDS.validateUnionKeys,
        mutateRoute: JIT_FUNCTION_IDS.validate,
        strictRoute: JIT_FUNCTION_IDS.validateStrict,
      };
      for (const [id, family] of Object.entries(expected)) {
        expect([id, familyOf(getRouteExecutable(id)!.paramsJitFns)]).toEqual([id, family]);
      }
    });

    it('only the params direction decides', () => {
      mion.initRoutes({mutateParamsOnly, cloneParamsOnly});
      expect(familyOf(getRouteExecutable('mutateParamsOnly')!.paramsJitFns)).toBe(JIT_FUNCTION_IDS.validate);
      expect(familyOf(getRouteExecutable('cloneParamsOnly')!.paramsJitFns)).toBe(JIT_FUNCTION_IDS.validateUnionKeys);
    });

    it('a middleware follows its router-wide wire too', () => {
      compactMion.initRoutes({compactGuard});
      expect(familyOf(getMiddlewareExecutable('compactGuard')!.paramsJitFns)).toBe(JIT_FUNCTION_IDS.validateUnionKeys);
    });

    it('the answer side compiles the row its own strategy names', () => {
      mion.initRoutes({cloneRoute, mutateRoute, strictRoute, mutateParamsOnly, compactRoute});
      // strictRoute names only params, so its return falls back to the default `clone`
      const expected: Record<string, string> = {
        cloneRoute: JIT_FUNCTION_IDS.validateUnionKeys,
        compactRoute: JIT_FUNCTION_IDS.validateUnionKeys,
        strictRoute: JIT_FUNCTION_IDS.validateUnionKeys,
        mutateParamsOnly: JIT_FUNCTION_IDS.validateUnionKeys,
        mutateRoute: JIT_FUNCTION_IDS.validate,
      };
      for (const [id, family] of Object.entries(expected)) {
        expect([id, familyOf(getRouteExecutable(id)!.returnJitFns)]).toEqual([id, family]);
      }
    });
  });

  // Framing does not vary: a route hands the adapter a JSON-safe value whatever its strategy, and
  // `stringifyJson` is left for the REQUEST body and the client's own wire.
  describe('every chain frames its response as json', () => {
    const defaultRoute = mion.route((ctx, p: Pet): Pet => p);
    const mutateRoute = mion.route((ctx, p: Pet): Pet => p, {parser: {return: 'mutate'}});
    const compactRoute = mion.route((ctx, p: Pet): Pet => p, {parser: 'compact'});
    const mutateMiddleware = mion.middleware((ctx): string => 'stamp', {parser: {return: 'mutate'}});

    it('whatever the route strategy', () => {
      mion.initRoutes({defaultRoute, mutateRoute, compactRoute});
      expect(getRouteExecutionChain('/defaultRoute')!.serializer).toBe(SerializerModes.json);
      expect(getRouteExecutionChain('/mutateRoute')!.serializer).toBe(SerializerModes.json);
      expect(getRouteExecutionChain('/compactRoute')!.serializer).toBe(SerializerModes.json);
    });

    it('and whatever a middleware in the chain returns', () => {
      mion.initRoutes({mutateMiddleware, defaultRoute});
      expect(getRouteExecutionChain('/defaultRoute')!.serializer).toBe(SerializerModes.json);
    });
  });

  describe('the wire of each strategy through dispatch', () => {
    const compactRoute = mion.route((ctx, p: Pet, note: string): Pet => ({...p, name: `${p.name}:${note}`}), {
      parser: 'compact',
    });
    const shared = pet();
    const cloneRoute = mion.route((ctx): Pet => shared, {parser: 'clone'});
    // the wide row a handler reads from a store, and the narrow slice its return type declares
    const wideRow = {...pet(), secret: 'do not send', notes: 'internal', size: 42};
    const trimmedRoute = mion.route((ctx): Pick<Pet, 'name'> => wideRow as Pick<Pet, 'name'>);
    const mutateRoute = mion.route((ctx): Pick<Pet, 'name'> => ({...wideRow}) as Pick<Pet, 'name'>, {parser: 'mutate'});

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

  // The CLIENT decodes a return with the same PARSE_MODES row the server encoded with, so `mutate` rebuilds at
  // neither end and its undeclared keys reach the caller.
  describe('what arrives at the caller', () => {
    interface Slice {
      name: string;
    }
    const wideRow = {name: 'rex', secret: 'do not send', notes: 'internal'};
    const cloneOut = mion.route((ctx): Slice => ({...wideRow}) as Slice, {parser: {return: 'clone'}});
    const mutateOut = mion.route((ctx): Slice => ({...wideRow}) as Slice, {parser: {return: 'mutate'}});

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

    // `clone` above is the strategy that drops an undeclared key.
    it('mutate sends the undeclared ones, and the caller gets them too', async () => {
      mion.initRoutes({mutateOut});
      const response = await dispatchJson('mutateOut', []);
      expect(response.body.mutateOut).toMatchObject({secret: 'do not send'});
      expect(Object.keys(await decodedReturn('mutateOut')).sort()).toEqual(['name', 'notes', 'secret']);
    });

    // A cache key is `<familyPrefix>_<typeId>`, so the prefix says which decoder was compiled.
    it('so both sides of mutate compile the same decode family', () => {
      const bothWays = mion.route((ctx, slice: Slice): Slice => slice, {parser: 'mutate'});
      mion.initRoutes({bothWays});
      const exec = getRouteExecutable('bothWays')!;
      const family = (hash: string) => hash.split('_')[0];
      expect(family(exec.paramsJitFns.json.decode.rtFnHash)).toBe(family(exec.returnJitFns.json.decode.rtFnHash));
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
      {parser: {params: 'mutate'}}
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
      // A union of an array and a number carries no object member of its own, and validation does not
      // cover it: on a plain object literal only the decoder drops an undeclared key, no validator refuses it.
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

  // A middleware declaring no `parser` inherits the route's wire like any chain member. Its params and
  // its return value must BOTH survive the round trip; a member dropped from the body is silent data loss.
  describe('a chain member with no parser of its own', () => {
    const stamp = compactMion.middleware((ctx, tag?: string): {tag: string} | null => (tag ? {tag} : null));
    const compactRoute = compactMion.route((ctx, p: Pet): Pet => p);

    it('a plain middleware carries its params AND its return value on the compact wire', async () => {
      compactMion.initRoutes({stamp, compactRoute});
      const stampExec = getMiddlewareExecutable('stamp')!;
      const routeExec = getRouteExecutable('compactRoute')!;
      // the middleware rides the router-wide wire, exactly like the route
      expect(stampExec.options.parser).toEqual({params: 'compact', return: 'compact'});
      expect(routeExec.options.parser).toEqual({params: 'compact', return: 'compact'});

      const encodeStamp = stampExec.paramsJitFns.json.encode.fn;
      const encodeRoute = routeExec.paramsJitFns.json.encode.fn;
      const body = {
        stamp: JSON.parse(JSON.stringify(encodeStamp(['marked']))),
        compactRoute: JSON.parse(JSON.stringify(encodeRoute([pet()]))),
      };
      const request = {headers: headersFromRecord({}), body: JSON.stringify(body)};
      const response = await dispatchRoute('/compactRoute', request.body, request.headers, headersFromRecord({}), request, {});
      expect(response.hasErrors).toBe(false);
      // the middleware read its params (so they reached the server) and its return value is on the wire
      const decodeStamp = stampExec.returnJitFns.json.decode.fn;
      expect(decodeStamp(response.body.stamp)).toEqual({tag: 'marked'});
      expect(response.body.compactRoute).toBeDefined();
    });
  });

  // mion's built-ins (@thrownErrors, notFound, platformError, the metadata middleware) are DECLARED at module level and
  // cannot inherit a router-wide `parser`: createMionRouter is generic, so a marker call site inside it carries an
  // unresolved type parameter. The build compiles them against the default, so each must PIN it or it refuses to start.
  describe("mion's own built-in methods", () => {
    const plainRoute = mion.route((ctx, p: Pet): Pet => p);

    // a pair differing from the method's own compiled functions is what assertCompiledParser refuses
    const expectBuiltInsPinned = () => {
      for (const id of Object.values(MION_ROUTES) as string[]) {
        const method = getAnyExecutable(id) as RemoteMethod | undefined;
        const pinned = method?.options?.parser;
        if (!pinned) continue;
        expect([id, method.paramsJitFns.json.strategy]).toEqual([id, pinned.params]);
        expect([id, method.returnJitFns.json.strategy]).toEqual([id, pinned.return]);
      }
    };

    // an INLINE literal per test: a variable holding the union widens the parser back to the default
    it('pin their own wire under a router-wide compact', () => {
      const ownRouter = createMionRouter({parser: 'compact'});
      ownRouter.initRoutes({noLiteral: ownRouter.route((ctx, p: Pet): Pet => p)});
      expectBuiltInsPinned();
    });

    it('pin their own wire under a router-wide clone', () => {
      const ownRouter = createMionRouter({parser: 'clone'});
      ownRouter.initRoutes({noLiteral: ownRouter.route((ctx, p: Pet): Pet => p)});
      expectBuiltInsPinned();
    });

    it('pin their own wire under a router-wide mutate', () => {
      const ownRouter = createMionRouter({parser: 'mutate'});
      ownRouter.initRoutes({noLiteral: ownRouter.route((ctx, p: Pet): Pet => p)});
      expectBuiltInsPinned();
    });

    it('compile real functions, not noop placeholders', () => {
      mion.initRoutes({plainRoute});
      const thrown = getAnyExecutable(MION_ROUTES.thrownErrors) as RemoteMethod;
      const metadata = getAnyExecutable(MION_ROUTES.methodsMetadata) as RemoteMethod;
      // a noop encoder would mean the build never saw the call site
      expect(thrown.returnJitFns.json.encode.isNoop).toBe(false);
      expect(thrown.returnJitHash).not.toBe('');
      expect(metadata.returnJitFns.json.encode.isNoop).toBe(false);
      expect(metadata.returnJitHash).not.toBe('');
    });
  });

  // `binary` is not a wire strategy. The generic strategy error names the ones that are.
  describe('an unknown strategy', () => {
    it('rejects it on a route, on a middleware and on the router option', () => {
      const badRoute = mion.route((ctx, p: Pet): Pet => p, {parser: 'binary' as unknown as 'compact'});
      expect(() => mion.initRoutes({badRoute})).toThrow(/invalid parser strategy 'binary'/);
      resetRouter();
      const badMiddleware = mion.middleware((ctx): string => 'x', {parser: 'binary' as unknown as 'compact'});
      const okRoute = mion.route((ctx, p: Pet): Pet => p);
      expect(() => mion.initRoutes({badMiddleware, okRoute})).toThrow(/invalid parser strategy 'binary'/);
      resetRouter();
      const badRouter = createMionRouter({parser: 'binary' as unknown as 'compact'});
      const inherits = badRouter.route((ctx, p: Pet): Pet => p);
      expect(() => badRouter.initRoutes({inherits})).toThrow(/invalid parser strategy 'binary'/);
    });

    it('names the strategies that do exist', () => {
      const badRoute = mion.route((ctx, p: Pet): Pet => p, {parser: 'binary' as unknown as 'compact'});
      expect(() => mion.initRoutes({badRoute})).toThrow(/clone, mutate, mutateStrict, compact/);
    });
  });
});
