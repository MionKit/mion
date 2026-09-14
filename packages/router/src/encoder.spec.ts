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
import {MION_ROUTES, SerializerModes, type EncoderOption} from '@mionjs/core';
import type {RemoteMethod} from './types/remoteMethods.ts';

interface Pet {
  name: string;
  born: Date;
  tags?: string[];
}

// A union of object literals: the one shape compact keeps keyed on the wire.
type Animal = {kind: 'cat'; lives: number} | {kind: 'dog'; goodBoy: boolean};

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
    const mixed = mion.route((ctx, p: Pet): Pet => p, {encoder: {params: 'clone', return: 'direct'}});
    const preset = {encoder: 'compact', description: 'positional'} as const;
    const fromPreset = mion.route((ctx, p: Pet): Pet => p, preset);

    it('no literal anywhere: the built-in default, clone on both directions', () => {
      mion.initRoutes({plain});
      const exec = getRouteExecutable('plain')!;
      expect(exec.options.encoder).toEqual({params: 'clone', return: 'clone'});
      expect(exec.paramsJitFns.json.strategy).toBe('clone');
      expect(exec.returnJitFns.json.strategy).toBe('clone');
    });

    it('a string sets both directions', () => {
      mion.initRoutes({compact});
      const exec = getRouteExecutable('compact')!;
      expect(exec.options.encoder).toEqual({params: 'compact', return: 'compact'});
      expect(exec.paramsJitFns.json.strategy).toBe('compact');
      expect(exec.returnJitFns.json.strategy).toBe('compact');
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

    // the cases above share the file's two factories; these two build their own router so the whole
    // path from the factory literal to the compiled functions is visible in one test
    it('a router-wide compact reaches a route that names no encoder', () => {
      const ownRouter = createMionRouter({encoder: 'compact'});
      const noLiteral = ownRouter.route((ctx, p: Pet): Pet => p);
      ownRouter.initRoutes({noLiteral});
      const exec = getRouteExecutable('noLiteral')!;
      expect(exec.options.encoder).toEqual({params: 'compact', return: 'compact'});
      expect(exec.paramsJitFns.json.strategy).toBe('compact');
      expect(exec.returnJitFns.json.strategy).toBe('compact');
    });

    it('a route literal of direct beats a router-wide compact', () => {
      const ownRouter = createMionRouter({encoder: 'compact'});
      const goesDirect = ownRouter.route((ctx, p: Pet): Pet => p, {encoder: 'direct'});
      ownRouter.initRoutes({goesDirect});
      const exec = getRouteExecutable('goesDirect')!;
      expect(exec.options.encoder).toEqual({params: 'direct', return: 'direct'});
      expect(exec.paramsJitFns.json.strategy).toBe('direct');
      expect(exec.returnJitFns.json.strategy).toBe('direct');
    });

    it('refuses to register a route whose runtime pair differs from what the build compiled', () => {
      // declared through the compact factory but initialized with no encoder: build compact, runtime defaults
      expect(() => createMionRouter({}).initRoutes({inherited})).toThrow(
        /is 'clone' at runtime but the build compiled 'compact'/
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

  // The strictTypes pair follows the wire like every other slot. A `compact` route carries no key
  // names on the wire at all, so there is nothing for an unknown-key check to find and the route
  // compiles neither function. The answer side never compiles them on any wire: it is written by
  // the handler, never by a caller, and nothing reads them.
  describe('the unknown-key pair follows the wire', () => {
    const cloneRoute = mion.route((ctx, p: Pet): Pet => p, {encoder: 'clone'});
    const mutateRoute = mion.route((ctx, p: Pet): Pet => p, {encoder: 'mutate'});
    const directRoute = mion.route((ctx, p: Pet): Pet => p, {encoder: 'direct'});
    const compactRoute = mion.route((ctx, p: Pet): Pet => p, {encoder: 'compact'});
    const compactParamsOnly = mion.route((ctx, p: Pet): Pet => p, {encoder: {params: 'compact', return: 'clone'}});
    const compactReturnOnly = mion.route((ctx, p: Pet): Pet => p, {encoder: {params: 'clone', return: 'compact'}});
    const compactGuard = compactMion.middleFn((ctx, p: Pet): Pet => p);

    it('a keyed wire compiles the pair', () => {
      mion.initRoutes({cloneRoute, mutateRoute, directRoute});
      for (const id of ['cloneRoute', 'mutateRoute', 'directRoute']) {
        const fns = getRouteExecutable(id)!.paramsJitFns;
        expect([id, !!fns.hasUnknownKeys]).toEqual([id, true]);
        expect([id, !!fns.unknownKeyErrors]).toEqual([id, true]);
      }
    });

    it('a compact params wire compiles neither', () => {
      mion.initRoutes({compactRoute, compactParamsOnly});
      for (const id of ['compactRoute', 'compactParamsOnly']) {
        const fns = getRouteExecutable(id)!.paramsJitFns;
        expect([id, fns.hasUnknownKeys]).toEqual([id, undefined]);
        expect([id, fns.unknownKeyErrors]).toEqual([id, undefined]);
      }
    });

    it('only the params direction decides: a compact return keeps the params pair', () => {
      mion.initRoutes({compactReturnOnly});
      const fns = getRouteExecutable('compactReturnOnly')!.paramsJitFns;
      expect(!!fns.hasUnknownKeys).toBe(true);
      expect(!!fns.unknownKeyErrors).toBe(true);
    });

    it('a middleFn follows its router-wide wire too', () => {
      compactMion.initRoutes({compactGuard});
      const fns = getMiddleFnExecutable('compactGuard')!.paramsJitFns;
      expect(fns.hasUnknownKeys).toBeUndefined();
      expect(fns.unknownKeyErrors).toBeUndefined();
    });

    it('no wire compiles the pair for the answer side', () => {
      mion.initRoutes({cloneRoute, mutateRoute, directRoute, compactRoute});
      for (const id of ['cloneRoute', 'mutateRoute', 'directRoute', 'compactRoute']) {
        const fns = getRouteExecutable(id)!.returnJitFns;
        expect([id, fns.hasUnknownKeys]).toEqual([id, undefined]);
        expect([id, fns.unknownKeyErrors]).toEqual([id, undefined]);
      }
    });
  });

  describe('framing derived from the chain', () => {
    const defaultRoute = mion.route((ctx, p: Pet): Pet => p);
    const directRoute = mion.route((ctx, p: Pet): Pet => p, {encoder: {return: 'direct'}});
    const compactRoute = mion.route((ctx, p: Pet): Pet => p, {encoder: 'compact'});
    const directMiddleFn = mion.middleFn((ctx): string => 'stamp', {encoder: {return: 'direct'}});
    const silentMiddleFn = mion.middleFn((ctx): void => undefined, {encoder: {return: 'direct'}});

    it('clone, mutate and compact returns frame as json; direct frames as stringifyJson', () => {
      mion.initRoutes({defaultRoute, directRoute, compactRoute});
      expect(getRouteExecutionChain('/defaultRoute')!.serializer).toBe(SerializerModes.json);
      expect(getRouteExecutionChain('/directRoute')!.serializer).toBe(SerializerModes.stringifyJson);
      expect(getRouteExecutionChain('/compactRoute')!.serializer).toBe(SerializerModes.json);
    });

    it('a direct middleFn WITH return data makes its chain stringifyJson; one without data does not', () => {
      mion.initRoutes({directMiddleFn, defaultRoute});
      expect(getRouteExecutionChain('/defaultRoute')!.serializer).toBe(SerializerModes.stringifyJson);
      resetRouter();
      mion.initRoutes({silentMiddleFn, defaultRoute});
      expect(getRouteExecutionChain('/defaultRoute')!.serializer).toBe(SerializerModes.json);
    });
  });

  describe('the wire of each strategy through dispatch', () => {
    const compactRoute = mion.route((ctx, p: Pet, note: string): Pet => ({...p, name: `${p.name}:${note}`}), {
      encoder: 'compact',
    });
    const shared = pet();
    const cloneRoute = mion.route((ctx): Pet => shared, {encoder: 'clone'});
    // the wide row a handler reads from a store, and the narrow slice its return type declares
    const wideRow = {...pet(), secret: 'do not send', notes: 'internal', size: 42};
    const trimmedRoute = mion.route((ctx): Pick<Pet, 'name'> => wideRow as Pick<Pet, 'name'>);
    const mutateRoute = mion.route((ctx): Pick<Pet, 'name'> => ({...wideRow}) as Pick<Pet, 'name'>, {encoder: 'mutate'});
    const directRoute = mion.route((ctx, p: Pet): Pet => p, {encoder: 'direct'});
    const unionRoute = mion.route((ctx, a: Animal): Animal => a, {encoder: 'compact'});
    // No transform anywhere, which is the shape the client's optimistic first request serves: it
    // has no codec yet, so it sends plain keyed JSON and the value has to survive without one.
    const plainCompact = mion.route((ctx, p: Pick<Pet, 'name'>): Pick<Pet, 'name'> => p, {encoder: 'compact'});

    // A union member is the one shape compact keeps KEYED, so its key names DO travel and a caller
    // could smuggle an undeclared one past validation, whose declared shape still matches. Both
    // directions rebuild the member from its declared props, which is what lets a compact route
    // skip the unknown-key check.
    it('a union param on the compact wire drops what the type did not declare', async () => {
      mion.initRoutes({unionRoute});
      const exec = getRouteExecutable('unionRoute')!;
      const encode = exec.paramsJitFns.json.encode.fn;
      const wire = JSON.parse(JSON.stringify(encode([{kind: 'cat', lives: 9, extra: 'sent'} as Animal])));
      expect(JSON.stringify(wire)).not.toContain('sent');

      // the same shape hand-written by a caller who added a key of their own
      const hostile = JSON.parse(JSON.stringify(wire));
      const merged = (Array.isArray(hostile) ? hostile[0] : hostile) as unknown[];
      (merged[1] as Record<string, unknown>).extra = 'smuggled';
      const response = await dispatchJson('unionRoute', hostile);
      expect(response.hasErrors).toBe(false);
      expect(JSON.stringify(response.body.unionRoute)).not.toContain('smuggled');
    });

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

    // The client's optimistic first request sends the keyed form to a route it has not fetched yet,
    // so the decoder reads it, but it rebuilds the object from the DECLARED names rather than
    // taking it as it came. Nothing else would stop an undeclared key: validation accepts a keyed
    // object whose declared shape matches, and a compact route compiles no unknown-key check. The
    // `born` Date still needs the real codec, which is what the second round trip brings.
    it('keyed json to a compact route is rebuilt from the declared names, never taken as it came', async () => {
      mion.initRoutes({plainCompact});
      const response = await dispatchJson('plainCompact', [{name: 'rex', extra: 'sneaky'}]);
      expect(response.hasErrors).toBe(false);
      expect(response.body.plainCompact).toEqual(['rex']);
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

    it('direct returns the string the encoder wrote', async () => {
      mion.initRoutes({directRoute});
      const response = await dispatchJson('directRoute', [pet()]);
      expect(response.serializer).toBe(SerializerModes.stringifyJson);
      expect(JSON.parse(response.rawBody as string).directRoute).toEqual(JSON.parse(JSON.stringify(pet())));
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
      expect(stampExec.options.encoder).toEqual({params: 'compact', return: 'compact'});
      expect(routeExec.options.encoder).toEqual({params: 'compact', return: 'compact'});

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
    // the router-wide value; a mismatch is what assertCompiledEncoder refuses to start on
    const expectBuiltInsPinned = () => {
      for (const id of Object.values(MION_ROUTES) as string[]) {
        const method = getAnyExecutable(id) as RemoteMethod | undefined;
        if (!method?.options?.encoder) continue;
        expect([id, method.paramsJitFns.json.strategy]).toEqual([id, method.options.encoder.params]);
        expect([id, method.returnJitFns.json.strategy]).toEqual([id, method.options.encoder.return]);
      }
    };

    // one test per strategy, each with an INLINE literal: a variable holding the union would widen
    // the encoder, which resolves to the default instead of the value under test
    it('pin their own wire under a router-wide compact', () => {
      const ownRouter = createMionRouter({encoder: 'compact'});
      ownRouter.initRoutes({noLiteral: ownRouter.route((ctx, p: Pet): Pet => p)});
      expectBuiltInsPinned();
    });

    it('pin their own wire under a router-wide direct', () => {
      const ownRouter = createMionRouter({encoder: 'direct'});
      ownRouter.initRoutes({noLiteral: ownRouter.route((ctx, p: Pet): Pet => p)});
      expectBuiltInsPinned();
    });

    it('pin their own wire under a router-wide mutate', () => {
      const ownRouter = createMionRouter({encoder: 'mutate'});
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
      const badRoute = mion.route((ctx, p: Pet): Pet => p, {encoder: 'binary' as unknown as 'compact'});
      expect(() => mion.initRoutes({badRoute})).toThrow(/invalid encoder strategy 'binary'/);
      resetRouter();
      const badMiddleFn = mion.middleFn((ctx): string => 'x', {encoder: 'binary' as unknown as 'compact'});
      const okRoute = mion.route((ctx, p: Pet): Pet => p);
      expect(() => mion.initRoutes({badMiddleFn, okRoute})).toThrow(/invalid encoder strategy 'binary'/);
      resetRouter();
      const badRouter = createMionRouter({encoder: 'binary' as unknown as 'compact'});
      const inherits = badRouter.route((ctx, p: Pet): Pet => p);
      expect(() => badRouter.initRoutes({inherits})).toThrow(/invalid encoder strategy 'binary'/);
    });

    it('names the strategies that do exist', () => {
      const badRoute = mion.route((ctx, p: Pet): Pet => p, {encoder: 'binary' as unknown as 'compact'});
      expect(() => mion.initRoutes({badRoute})).toThrow(/clone, mutate, direct, compact/);
    });
  });
});
