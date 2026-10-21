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
type ParserOf<Options> = Options extends {parser: infer Parser} ? Parser : never;
/** A widened or union `parser` resolves to `never` and falls through, instead of compiling every family it names. */
type DirectionStrategy<Parser, Dir extends Direction> = [Parser] extends [string]
  ? SingleLiteral<Parser>
  : [Parser] extends [Record<Dir, infer Strategy extends string>]
    ? SingleLiteral<Strategy>
    : never;
/** `Strategy` unless it resolved to `never` (the options named no parser for this direction). */
type FallbackTo<Strategy, Else> = [Strategy] extends [never] ? Else : Strategy;
/** The strategy of one direction: the route literal, then the factory literal, then the default. */
type ResolveStrategy<RouteOpts, RouterOpts, Dir extends Direction> = FallbackTo<
  DirectionStrategy<ParserOf<RouteOpts>, Dir>,
  FallbackTo<DirectionStrategy<ParserOf<RouterOpts>, Dir>, DefaultParser[Dir]>
>;
// The type twin of PARSE_MODES in @mionjs/core, indexed so a new strategy is a row in core and nothing here.
// The `extends keyof` guard is what a deferred strategy needs: ParamsStrategy resolves through conditionals,
// so it cannot satisfy the index constraint on its own.
type ModeFamily<Strategy, Family extends keyof ParseModeRow> = Strategy extends keyof ParseModes
  ? ParseModes[Strategy][Family]
  : never;

/** The params-side strategy literal a route resolves to, also read by the resolved-options view of the API type. */
export type ParamsStrategy<RouteOpts, RouterOpts> = ResolveStrategy<RouteOpts, RouterOpts, 'params'>;
/** The return-side strategy literal a route resolves to. */
export type ReturnStrategy<RouteOpts, RouterOpts> = ResolveStrategy<RouteOpts, RouterOpts, 'return'>;

// The slots of each marker side that vary with the strategy, read by MarkerSlots below.
type ParamsFn<RouteOpts, RouterOpts, Family extends keyof ParseModeRow> = ModeFamily<
  ParamsStrategy<RouteOpts, RouterOpts>,
  Family
>;
type ReturnFn<RouteOpts, RouterOpts, Family extends keyof ParseModeRow> = ModeFamily<
  ReturnStrategy<RouteOpts, RouterOpts>,
  Family
>;

/** Intersected onto the factory options so a widened `parser` (plain string, union) is a type error. */
export type ParserLiteralGuard<Options> = Options extends {parser: infer Parser}
  ? Parser extends ParserOption
    ? {parser: LiteralParser<Parser>}
    : never
  : unknown;
type IsUnion<Candidate, All = Candidate> = Candidate extends unknown ? ([All] extends [Candidate] ? false : true) : never;
type SingleLiteral<Strategy> = [Strategy] extends [string]
  ? string extends Strategy
    ? never
    : IsUnion<Strategy> extends true
      ? never
      : Strategy
  : never;
type LiteralParser<Parser> = Parser extends string ? SingleLiteral<Parser> : {[Key in keyof Parser]: SingleLiteral<Parser[Key]>};

// ####### The mion injection slots #######
// The marker parameters every helper carries, written ONCE. types/mionRouter.ts indexes this tuple instead of
// respelling the markers: an alias wrapped AROUND a marker hides it from the mion scanner, a tuple ELEMENT does not.
// Fn keys are MION_FN_KEYS in @mionjs/core; the payload is projected by family tag, so order does not matter.
// 'formatTransform' is PARAMS-only: a RETURN is written by the handler, never a caller.

/** Only `compact` changes the wire format; every other JSON strategy writes the same JSON. */
export type WireFormat<Strategy> = Strategy extends 'compact' ? 'compact' : 'json';

/** The injection slots of a route / middleware call, in declaration order. */
export type MarkerSlots<Params, Return, RouteOpts, RouterOpts> = [
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
  // Types plus each direction's wire format: all a safe call depends on.
  // Written out, never an alias: the build walks an alias's arguments, and router options can hold any type.
  syncId: InjectRunTypeId<
    [Params, Return, WireFormat<ParamsStrategy<RouteOpts, RouterOpts>>, WireFormat<ReturnStrategy<RouteOpts, RouterOpts>>]
  >,
];

/** The two extra slots a headers middleware carries for its HeadersSubset parameter. */
export type HeaderMarkerSlots<Headers> = [
  headersFns: InjectTypeFnArgs<Headers, 'validate', 'validationErrors'>,
  headersId: InjectRunTypeId<Headers>,
];
