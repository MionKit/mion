/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {DefaultEncoder, EncoderOption, ResolvedEncoder} from '@mionjs/core';
import type {InjectRunTypeId, InjectTypeFnArgs} from '@mionjs/run-types';

// Type-level encoder resolution: the families a route compiles come from the `encoder` literals,
// route first, then factory, then the built-in default. A slot resolving to `never` is not compiled.

type Direction = keyof ResolvedEncoder;
/** The `encoder` literal an options type carries, `never` when it has none. */
type EncoderOf<Options> = Options extends {encoder: infer E} ? E : never;
/** One direction of an encoder literal: a string sets both, an object names each. Non-distributive
 *  and filtered through SingleLiteral, so a widened or union `encoder` resolves to `never` and falls
 *  through instead of compiling every family its union names. */
type DirectionStrategy<E, D extends Direction> = [E] extends [string]
  ? SingleLiteral<E>
  : [E] extends [Record<D, infer S extends string>]
    ? SingleLiteral<S>
    : never;
/** `Strategy` unless it resolved to `never` (the options named no encoder for this direction). */
type FallbackTo<Strategy, Else> = [Strategy] extends [never] ? Else : Strategy;
/** The strategy of one direction: the route literal, then the factory literal, then the default. */
type ResolveStrategy<RouteOpts, RouterOpts, D extends Direction> = FallbackTo<
  DirectionStrategy<EncoderOf<RouteOpts>, D>,
  FallbackTo<DirectionStrategy<EncoderOf<RouterOpts>, D>, DefaultEncoder[D]>
>;
// Mirrored by ENCODE_FAMILY_BY_STRATEGY / DECODE_FAMILY_BY_STRATEGY in @mionjs/core.
type EncodeFamily<S> = S extends 'clone'
  ? 'pjs'
  : S extends 'mutate'
    ? 'pj'
    : S extends 'direct'
      ? 'sj'
      : S extends 'compact'
        ? 'cj'
        : never;
type DecodeFamily<S> = S extends 'compact' ? 'cjr' : S extends string ? 'rj' : never;

/** Options naming no `encoder`, the default for a helper called outside the factory. */
type NoEncoderOptions = Record<never, never>;

type ParamsStrategy<RouteOpts, RouterOpts = NoEncoderOptions> = ResolveStrategy<RouteOpts, RouterOpts, 'params'>;
type ReturnStrategy<RouteOpts, RouterOpts = NoEncoderOptions> = ResolveStrategy<RouteOpts, RouterOpts, 'return'>;

// The two slots of each marker side that vary with the strategy, read by MarkerSlots below.
type ParamsEncode<RouteOpts, RouterOpts = NoEncoderOptions> = EncodeFamily<ParamsStrategy<RouteOpts, RouterOpts>>;
type ParamsDecode<RouteOpts, RouterOpts = NoEncoderOptions> = DecodeFamily<ParamsStrategy<RouteOpts, RouterOpts>>;
type ReturnEncode<RouteOpts, RouterOpts = NoEncoderOptions> = EncodeFamily<ReturnStrategy<RouteOpts, RouterOpts>>;
type ReturnDecode<RouteOpts, RouterOpts = NoEncoderOptions> = DecodeFamily<ReturnStrategy<RouteOpts, RouterOpts>>;

/** Intersected onto the factory options so a widened `encoder` (plain string, union) is a type error. */
export type EncoderLiteralGuard<Options> = Options extends {encoder: infer E}
  ? E extends EncoderOption
    ? {encoder: LiteralEncoder<E>}
    : never
  : unknown;
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;
type SingleLiteral<S> = [S] extends [string] ? (string extends S ? never : IsUnion<S> extends true ? never : S) : never;
type LiteralEncoder<E> = E extends string ? SingleLiteral<E> : {[K in keyof E]: SingleLiteral<E[K]>};

// ####### The mion injection slots #######
// The trailing marker parameters every route / middleFn helper carries, written ONCE. The helper
// signatures in types/mionRouter.ts index this tuple (`MarkerSlots<...>[0]`) instead of respelling
// the markers: a type alias wrapped directly AROUND a marker hides it from the mion scanner, but a
// tuple ELEMENT keeps the marker's own alias, so the scanner still reads it at the call site.
// The fn key vocabulary is MION_FN_KEYS in @mionjs/core; the payload is projected by family tag, so
// order does not matter, and a strategy slot resolving to `never` is not compiled.
// 'fmt' (the sanitizeParams lane) is requested on the PARAMS side only.

/** The four injection slots of a route / middleFn call, in declaration order. */
export type MarkerSlots<Params, Return, RouteOpts, RouterOpts = NoEncoderOptions> = [
  paramsFns: InjectTypeFnArgs<
    Params,
    'val',
    'verr',
    'huk',
    'uke',
    'fmt',
    ParamsEncode<RouteOpts, RouterOpts>,
    ParamsDecode<RouteOpts, RouterOpts>
  >,
  returnFns: InjectTypeFnArgs<
    Return,
    'val',
    'verr',
    'huk',
    'uke',
    ReturnEncode<RouteOpts, RouterOpts>,
    ReturnDecode<RouteOpts, RouterOpts>
  >,
  paramsId: InjectRunTypeId<Params>,
  returnId: InjectRunTypeId<Return>,
];

/** The two extra slots a headers middleFn carries for its HeadersSubset parameter. */
export type HeaderMarkerSlots<Headers> = [
  headersFns: InjectTypeFnArgs<Headers, 'val', 'verr'>,
  headersId: InjectRunTypeId<Headers>,
];
