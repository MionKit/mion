/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {ParamsStrategy, ReturnStrategy} from './parser.ts';
import type {MiddlewareOptions, RouteOptions} from './remoteMethods.ts';

// The options of a route or middleware AS THE ROUTER RESOLVES THEM, at type level: the route literal,
// then the router literal, then the built-in default, the same three steps `getExecutableFromRoute`
// takes at runtime (router.ts). `PublicApi` puts this view on every public method, which is what
// `initRoutes` returns at runtime, so a client build reads the effective options off the API type.
// A value that is not a single literal (a widened `boolean`, a union) stays as written: the build
// cannot pick it, and reports the route instead of guessing.

/** The value of option `K` when the options literal names it, `undefined` otherwise. */
type Named<Opts, K extends PropertyKey> = Opts extends {[P in K]: infer V} ? V : undefined;
type PickRouteOrRouter<RouteValue, RouterValue> = [RouteValue] extends [undefined] ? RouterValue : RouteValue;

/** The keys a `customMionRouter` `handler` part added that the method wrote: an optional one is a key it did not. */
type AddedKeys<Opts, Known extends PropertyKey> = {
  [Key in Exclude<keyof Opts, Known>]: Record<never, never> extends Pick<Opts, Key> ? never : Key;
}[Exclude<keyof Opts, Known>];
/** The resolved view plus each added key, as the literal the method wrote. */
type WithAddedKeys<Resolved, RO, Known extends PropertyKey> = [keyof RO] extends [Known]
  ? Resolved
  : Resolved & {[Key in AddedKeys<NonNullable<RO>, Known>]: NonNullable<RO>[Key]};

/** A route's effective options: `alwaysRun` is always false and `isMutation` is what the helper pinned. */
export type ResolvedRouteOptions<RO, O> = WithAddedKeys<RouteOptionsView<RO, O>, RO, keyof RouteOptions>;
/** A middleware's effective options (headers middlewares included). */
export type ResolvedMiddlewareOptions<RO, O> = WithAddedKeys<MiddlewareOptionsView<RO, O>, RO, keyof MiddlewareOptions>;

// Both views are flat object types, so a method naming no added key gets one literal object.
type RouteOptionsView<RO, O> = {
  alwaysRun: false;
  description: Named<RO, 'description'>;
  parser: {params: ParamsStrategy<RO, O>; return: ReturnStrategy<RO, O>};
  isMutation: Named<RO, 'isMutation'>;
  sanitizeParams: PickRouteOrRouter<Named<RO, 'sanitizeParams'>, Named<O, 'sanitizeParams'>>;
  /** The route's own limit; the one the router settles for a chain declaring none exists only at registration. */
  maxBodySize: Named<RO, 'maxBodySize'>;
};

type MiddlewareOptionsView<RO, O> = {
  alwaysRun: [Named<RO, 'alwaysRun'>] extends [true] ? true : false;
  description: Named<RO, 'description'>;
  parser: {params: ParamsStrategy<RO, O>; return: ReturnStrategy<RO, O>};
  sanitizeParams: PickRouteOrRouter<Named<RO, 'sanitizeParams'>, Named<O, 'sanitizeParams'>>;
  /** The middleware's own contribution to the request limit of the chains it sits in, when declared. */
  maxBodySize: Named<RO, 'maxBodySize'>;
};
