/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {DefaultParser, ParseModeRow, ParseModes, ParserOption, ResolvedParser} from '@mionjs/core';
import type {InjectRunTypeId, InjectTypeFnArgs} from '@mionjs/run-types';

// The families a route compiles come from the `parser` literals: route, then factory, then the default.
// A slot resolving to `never` is not compiled.

type Direction = keyof ResolvedParser;
/** The `parser` literal an options type carries, `never` when it has none. */
type ParserOf<Options> = Options extends {parser: infer E} ? E : never;
/** A widened or union `parser` resolves to `never` and falls through, instead of compiling every family it names. */
type DirectionStrategy<E, D extends Direction> = [E] extends [string]
  ? SingleLiteral<E>
  : [E] extends [Record<D, infer S extends string>]
    ? SingleLiteral<S>
    : never;
/** `Strategy` unless it resolved to `never` (the options named no parser for this direction). */
type FallbackTo<Strategy, Else> = [Strategy] extends [never] ? Else : Strategy;
/** The strategy of one direction: the route literal, then the factory literal, then the default. */
type ResolveStrategy<RouteOpts, RouterOpts, D extends Direction> = FallbackTo<
  DirectionStrategy<ParserOf<RouteOpts>, D>,
  FallbackTo<DirectionStrategy<ParserOf<RouterOpts>, D>, DefaultParser[D]>
>;
// The type twin of PARSE_MODES in @mionjs/core: one row per strategy, holding every family it compiles.
// Indexed access rather than a conditional chain per family, so a new strategy is a row in core and nothing
// here. The `extends keyof` guard is what a deferred strategy needs: ParamsStrategy resolves through
// conditionals, so it cannot satisfy the index constraint on its own.
type ModeFamily<S, K extends keyof ParseModeRow> = S extends keyof ParseModes ? ParseModes[S][K] : never;

/** Options naming no `parser`, the default for a helper called outside the factory. */
type NoParserOptions = Record<never, never>;

/** The params-side strategy literal a route resolves to, also read by the resolved-options view of the API type. */
export type ParamsStrategy<RouteOpts, RouterOpts = NoParserOptions> = ResolveStrategy<RouteOpts, RouterOpts, 'params'>;
/** The return-side strategy literal a route resolves to. */
export type ReturnStrategy<RouteOpts, RouterOpts = NoParserOptions> = ResolveStrategy<RouteOpts, RouterOpts, 'return'>;

// The slots of each marker side that vary with the strategy, read by MarkerSlots below.
type ParamsFn<RouteOpts, RouterOpts, K extends keyof ParseModeRow> = ModeFamily<ParamsStrategy<RouteOpts, RouterOpts>, K>;
type ReturnFn<RouteOpts, RouterOpts, K extends keyof ParseModeRow> = ModeFamily<ReturnStrategy<RouteOpts, RouterOpts>, K>;

/** Intersected onto the factory options so a widened `parser` (plain string, union) is a type error. */
export type ParserLiteralGuard<Options> = Options extends {parser: infer E}
  ? E extends ParserOption
    ? {parser: LiteralParser<E>}
    : never
  : unknown;
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;
type SingleLiteral<S> = [S] extends [string] ? (string extends S ? never : IsUnion<S> extends true ? never : S) : never;
type LiteralParser<E> = E extends string ? SingleLiteral<E> : {[K in keyof E]: SingleLiteral<E[K]>};

// ####### The mion injection slots #######
// The marker parameters every helper carries, written ONCE. types/mionRouter.ts indexes this tuple instead of
// respelling the markers: an alias wrapped AROUND a marker hides it from the mion scanner, a tuple ELEMENT does not.
// Fn keys are MION_FN_KEYS in @mionjs/core; the payload is projected by family tag, so order does not matter.
// 'formatTransform' and the strategy-driven validator are PARAMS-only: a RETURN is written by the handler, never a caller.

/** The four injection slots of a route / middleFn call, in declaration order. */
export type MarkerSlots<Params, Return, RouteOpts, RouterOpts = NoParserOptions> = [
  paramsFns: InjectTypeFnArgs<
    Params,
    ParamsFn<RouteOpts, RouterOpts, 'validate'>,
    ParamsFn<RouteOpts, RouterOpts, 'validationErrors'>,
    'formatTransform',
    ParamsFn<RouteOpts, RouterOpts, 'encode'>,
    ParamsFn<RouteOpts, RouterOpts, 'decode'>
  >,
  returnFns: InjectTypeFnArgs<
    Return,
    ReturnFn<RouteOpts, RouterOpts, 'validate'>,
    ReturnFn<RouteOpts, RouterOpts, 'validationErrors'>,
    ReturnFn<RouteOpts, RouterOpts, 'encode'>,
    ReturnFn<RouteOpts, RouterOpts, 'decode'>
  >,
  paramsId: InjectRunTypeId<Params>,
  returnId: InjectRunTypeId<Return>,
];

/** The two extra slots a headers middleFn carries for its HeadersSubset parameter. */
export type HeaderMarkerSlots<Headers> = [
  headersFns: InjectTypeFnArgs<Headers, 'validate', 'validationErrors'>,
  headersId: InjectRunTypeId<Headers>,
];
