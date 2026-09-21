/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {DefaultParser, ParserOption, ResolvedParser} from '@mionjs/core';
import type {InjectRunTypeId, InjectTypeFnArgs} from '@mionjs/run-types';

// The families a route compiles come from the `parser` literals: route first, then factory, then
// the built-in default. A slot resolving to `never` is not compiled.

type Direction = keyof ResolvedParser;
/** The `parser` literal an options type carries, `never` when it has none. */
type ParserOf<Options> = Options extends {parser: infer E} ? E : never;
/** Non-distributive and filtered through SingleLiteral, so a widened or union `parser` resolves to
 *  `never` and falls through instead of compiling every family its union names. */
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
// Mirrored by ENCODE_FAMILY_BY_STRATEGY / DECODE_FAMILY_BY_STRATEGY in @mionjs/core.
type EncodeFamily<S> = S extends 'clone'
  ? 'prepareForJsonClone'
  : S extends 'mutate' | 'mutateStrict'
    ? 'prepareForJsonMutate'
    : S extends 'compact'
      ? 'compactForJson'
      : never;
// The server decodes params from ANY caller, so it rebuilds the declared shape unless the strategy
// exists to pass the object through. The `S extends string` arm leaves a `never` strategy uncompiled.
type ServerDecodeFamily<S> = S extends 'compact'
  ? 'compactFromJson'
  : S extends 'mutate' | 'mutateStrict'
    ? 'restoreFromJsonMutate'
    : S extends string
      ? 'restoreFromJsonClone'
      : never;
// The client decodes a return its own server wrote, and never hands on a property the return type omits.
type ClientDecodeFamily<S> = S extends 'compact' ? 'compactFromJson' : S extends string ? 'restoreFromJsonClone' : never;

/** Options naming no `parser`, the default for a helper called outside the factory. */
type NoParserOptions = Record<never, never>;

/** The params-side strategy literal a route resolves to, also read by the resolved-options view of the API type. */
export type ParamsStrategy<RouteOpts, RouterOpts = NoParserOptions> = ResolveStrategy<RouteOpts, RouterOpts, 'params'>;
/** The return-side strategy literal a route resolves to. */
export type ReturnStrategy<RouteOpts, RouterOpts = NoParserOptions> = ResolveStrategy<RouteOpts, RouterOpts, 'return'>;

// The slots of each marker side that vary with the strategy, read by MarkerSlots below.
type ParamsEncode<RouteOpts, RouterOpts = NoParserOptions> = EncodeFamily<ParamsStrategy<RouteOpts, RouterOpts>>;
type ParamsDecode<RouteOpts, RouterOpts = NoParserOptions> = ServerDecodeFamily<ParamsStrategy<RouteOpts, RouterOpts>>;
type ReturnEncode<RouteOpts, RouterOpts = NoParserOptions> = EncodeFamily<ReturnStrategy<RouteOpts, RouterOpts>>;
type ReturnDecode<RouteOpts, RouterOpts = NoParserOptions> = ClientDecodeFamily<ReturnStrategy<RouteOpts, RouterOpts>>;
// Mirrored by VALIDATE_FAMILY_BY_STRATEGY in @mionjs/core: every strategy compiles exactly ONE validator on
// the params side, and never a separate hasUnknownKeys call.
//
// `clone` and `compact` rebuild the declared shape while decoding, so a plain object's undeclared keys are
// already gone; what they cannot clean is a union, whose members share one pooled key list. `mutate` rebuilds
// nothing and is the permissive strategy. `mutateStrict` rebuilds nothing either and answers for every key.
type ParamsValidate<S> = S extends 'mutateStrict' ? 'validateStrict' : S extends 'mutate' ? 'validate' : 'validateUnionKeys';
type ParamsValidationErrors<S> = S extends 'mutateStrict'
  ? 'validationErrorsStrict'
  : S extends 'mutate'
    ? 'validationErrors'
    : 'validationErrorsUnionKeys';

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
// The marker parameters every helper carries, written ONCE. types/mionRouter.ts indexes this tuple
// (`MarkerSlots<...>[0]`) instead of respelling the markers: an alias wrapped AROUND a marker hides it
// from the mion scanner, a tuple ELEMENT keeps it readable at the call site.
// Fn keys are MION_FN_KEYS in @mionjs/core; the payload is projected by family tag, so order does not matter.
// 'formatTransform' is PARAMS-only, and so is a strategy-driven validator: a RETURN is written by the handler,
// never by a caller, so every wire compiles the plain validate pair.

/** The four injection slots of a route / middleFn call, in declaration order. */
export type MarkerSlots<Params, Return, RouteOpts, RouterOpts = NoParserOptions> = [
  paramsFns: InjectTypeFnArgs<
    Params,
    ParamsValidate<ParamsStrategy<RouteOpts, RouterOpts>>,
    ParamsValidationErrors<ParamsStrategy<RouteOpts, RouterOpts>>,
    'formatTransform',
    ParamsEncode<RouteOpts, RouterOpts>,
    ParamsDecode<RouteOpts, RouterOpts>
  >,
  returnFns: InjectTypeFnArgs<
    Return,
    'validate',
    'validationErrors',
    ReturnEncode<RouteOpts, RouterOpts>,
    ReturnDecode<RouteOpts, RouterOpts>
  >,
  paramsId: InjectRunTypeId<Params>,
  returnId: InjectRunTypeId<Return>,
];

/** The two extra slots a headers middleFn carries for its HeadersSubset parameter. */
export type HeaderMarkerSlots<Headers> = [
  headersFns: InjectTypeFnArgs<Headers, 'validate', 'validationErrors'>,
  headersId: InjectRunTypeId<Headers>,
];
