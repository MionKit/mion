/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {ParamsStrategy, ReturnStrategy} from './encoder.ts';

// The options of a route or middleFn AS THE ROUTER RESOLVES THEM, at type level: the route literal,
// then the router literal, then the built-in default, the same three steps `getExecutableFromRoute`
// takes at runtime (router.ts). `PublicApi` puts this view on every public method, which is what
// `initRoutes` returns at runtime, so a client build reads the effective options off the API type.
// A value that is not a single literal (a widened `boolean`, a union) stays as written: the build
// cannot pick it, and reports the route instead of guessing.

/** The value of option `K` when the options literal names it, `undefined` otherwise. */
type Named<Opts, K extends PropertyKey> = Opts extends {[P in K]: infer V} ? V : undefined;
/** The first level that names the option: route literal, then router literal, then the default. */
type Pick3<RouteValue, RouterValue, Default> = [RouteValue] extends [undefined]
  ? [RouterValue] extends [undefined]
    ? Default
    : RouterValue
  : RouteValue;

// Both views are flat object types (no intersection) so the build reads them as one literal object.

/** A route's effective options: `alwaysRun` is always false and `isMutation` is what the helper pinned. */
export type ResolvedRouteOptions<RO, O> = {
  alwaysRun: false;
  validateParams: Pick3<Named<RO, 'validateParams'>, undefined, true>;
  validateReturn: Pick3<Named<RO, 'validateReturn'>, undefined, false>;
  description: Named<RO, 'description'>;
  encoder: {params: ParamsStrategy<RO, O>; return: ReturnStrategy<RO, O>};
  isMutation: Named<RO, 'isMutation'>;
  strictTypes: Pick3<Named<RO, 'strictTypes'>, Named<O, 'strictTypes'>, undefined>;
  sanitizeParams: Pick3<Named<RO, 'sanitizeParams'>, Named<O, 'sanitizeParams'>, undefined>;
  /** The route's OWN limit when it declares one. The number the router settles for a chain that
   *  declares none (derived from the types times the router factor, else the platform adapter's)
   *  exists only at the server's registration, so the type does not carry it. */
  maxBodySize: Named<RO, 'maxBodySize'>;
};

/** A middleFn's effective options (headers middleFns included). */
export type ResolvedMiddleFnOptions<RO, O> = {
  alwaysRun: [Named<RO, 'alwaysRun'>] extends [true] ? true : false;
  validateParams: Pick3<Named<RO, 'validateParams'>, undefined, true>;
  validateReturn: Pick3<Named<RO, 'validateReturn'>, undefined, false>;
  description: Named<RO, 'description'>;
  encoder: {params: ParamsStrategy<RO, O>; return: ReturnStrategy<RO, O>};
  strictTypes: Pick3<Named<RO, 'strictTypes'>, Named<O, 'strictTypes'>, undefined>;
  sanitizeParams: Pick3<Named<RO, 'sanitizeParams'>, Named<O, 'sanitizeParams'>, undefined>;
  /** The middleFn's own contribution to the request limit of the chains it sits in, when declared. */
  maxBodySize: Named<RO, 'maxBodySize'>;
};
