/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {DefaultEncoder, EncoderOption, ResolvedEncoder} from '@mionjs/core';

// ####### Type-level encoder resolution #######
// The families a route compiles are DERIVED IN TYPES from the `encoder` literals: the route options
// first, the factory options second, the built-in default last. The mion scanner reads the family
// keys off the resolved signature of each call, so a slot that resolves to a string literal is
// compiled and a slot that resolves to `never` is not. A runtime option can never add a compiled
// function to a route, which is why the router-wide default is a type too.

type Direction = keyof ResolvedEncoder;
/** The `encoder` literal an options type carries, `never` when it has none. */
type EncoderOf<Options> = Options extends {encoder: infer E} ? E : never;
/** One direction of an encoder literal: a string sets both, an object names each. */
type DirectionStrategy<E, D extends Direction> = E extends string ? E : E extends Record<D, infer S extends string> ? S : never;
/** `Strategy` unless it resolved to `never` (the options named no encoder for this direction). */
type FallbackTo<Strategy, Else> = [Strategy] extends [never] ? Else : Strategy;
/** The strategy of one direction: the route literal, then the factory literal, then the default. */
type ResolveStrategy<RouteOpts, RouterOpts, D extends Direction> = FallbackTo<
  DirectionStrategy<EncoderOf<RouteOpts>, D>,
  FallbackTo<DirectionStrategy<EncoderOf<RouterOpts>, D>, DefaultEncoder[D]>
>;
/** `binary` keeps the direction's built-in default json pair compiled beside the binary pair. */
type JsonStrategyOf<S, D extends Direction> = S extends 'binary' ? DefaultEncoder[D] : S;

// The family keys, mirrored by ENCODE_FAMILY_BY_STRATEGY / DECODE_FAMILY_BY_STRATEGY in @mionjs/core
// (mionAdapter reads the strategy back off the injected families through those maps).
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
type ToBinaryFamily<S> = S extends 'binary' ? 'tb' : never;
type FromBinaryFamily<S> = S extends 'binary' ? 'fb' : never;

/** An options type that names no `encoder` (so every direction falls through). Used as the default of
 *  a helper's route options type parameter, and as the router options type of a helper called OUTSIDE
 *  the factory (the router's own internal routes have no router-wide default). */
export type NoEncoderOptions = Record<never, never>;

type ParamsStrategy<RouteOpts, RouterOpts = NoEncoderOptions> = ResolveStrategy<RouteOpts, RouterOpts, 'params'>;
type ReturnStrategy<RouteOpts, RouterOpts = NoEncoderOptions> = ResolveStrategy<RouteOpts, RouterOpts, 'return'>;
type ParamsJson<RouteOpts, RouterOpts = NoEncoderOptions> = JsonStrategyOf<ParamsStrategy<RouteOpts, RouterOpts>, 'params'>;
type ReturnJson<RouteOpts, RouterOpts = NoEncoderOptions> = JsonStrategyOf<ReturnStrategy<RouteOpts, RouterOpts>, 'return'>;

// The four computed slots of each marker side. Spelled out at every helper (the marker alias itself
// must stay literal), these are the only slots that vary with the strategy. `RouterOpts` defaults to
// NoEncoderOptions: a helper OUTSIDE the factory has no router-wide default, so it names only the
// route options and the factory's helpers pass their own options type as the second argument.
export type ParamsEncode<RouteOpts, RouterOpts = NoEncoderOptions> = EncodeFamily<ParamsJson<RouteOpts, RouterOpts>>;
export type ParamsDecode<RouteOpts, RouterOpts = NoEncoderOptions> = DecodeFamily<ParamsJson<RouteOpts, RouterOpts>>;
export type ParamsToBinary<RouteOpts, RouterOpts = NoEncoderOptions> = ToBinaryFamily<ParamsStrategy<RouteOpts, RouterOpts>>;
export type ParamsFromBinary<RouteOpts, RouterOpts = NoEncoderOptions> = FromBinaryFamily<ParamsStrategy<RouteOpts, RouterOpts>>;
export type ReturnEncode<RouteOpts, RouterOpts = NoEncoderOptions> = EncodeFamily<ReturnJson<RouteOpts, RouterOpts>>;
export type ReturnDecode<RouteOpts, RouterOpts = NoEncoderOptions> = DecodeFamily<ReturnJson<RouteOpts, RouterOpts>>;
export type ReturnToBinary<RouteOpts, RouterOpts = NoEncoderOptions> = ToBinaryFamily<ReturnStrategy<RouteOpts, RouterOpts>>;
export type ReturnFromBinary<RouteOpts, RouterOpts = NoEncoderOptions> = FromBinaryFamily<ReturnStrategy<RouteOpts, RouterOpts>>;

/** Intersected onto the factory's options parameter so a widened `encoder` (a plain string, a
 *  union) is a type error: the build can only compile what a single literal names. */
export type EncoderLiteralGuard<Options> = Options extends {encoder: infer E}
  ? E extends EncoderOption
    ? {encoder: LiteralEncoder<E>}
    : never
  : unknown;
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;
type SingleLiteral<S> = [S] extends [string] ? (string extends S ? never : IsUnion<S> extends true ? never : S) : never;
type LiteralEncoder<E> = E extends string ? SingleLiteral<E> : {[K in keyof E]: SingleLiteral<E[K]>};
