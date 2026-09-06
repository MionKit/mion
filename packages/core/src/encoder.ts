/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {EncoderOption, JsonStrategy, ResolvedEncoder, WireStrategy} from './types/general.types.ts';

// ############# encoder strategy resolution #############
// The `encoder` option is a BUILD-TIME literal: the families a route compiles are derived from it
// in the router's helper types, so the runtime can only read a resolved pair back and check that it
// matches what was actually compiled (mionAdapter reads the strategy off the injected families).

/** The built-in defaults, today's wire: the client sends a `direct` string, the server answers a
 *  `mutate`d value the platform stringifies. */
export const DEFAULT_ENCODER = Object.freeze({params: 'direct', return: 'mutate'} as const) satisfies ResolvedEncoder;
/** The default pair as literal types, so the router's helper types derive the default families from it. */
export type DefaultEncoder = typeof DEFAULT_ENCODER;

export const WIRE_STRATEGIES = ['clone', 'mutate', 'direct', 'compact', 'binary'] as const satisfies readonly WireStrategy[];

export function isWireStrategy(value: unknown): value is WireStrategy {
  return typeof value === 'string' && (WIRE_STRATEGIES as readonly string[]).includes(value);
}

function directionOf(
  option: EncoderOption | undefined,
  direction: keyof ResolvedEncoder,
  label: string
): WireStrategy | undefined {
  if (option === undefined) return undefined;
  const value = typeof option === 'string' ? option : option[direction];
  if (value === undefined) return undefined;
  if (!isWireStrategy(value))
    throw new Error(
      `mion: invalid encoder strategy '${String(value)}' for ${label} ${direction}; expected one of ${WIRE_STRATEGIES.join(', ')}`
    );
  return value;
}

/** Resolves the encoder pair of a route or middleFn: the route option wins per direction, then the
 *  router option, then the built-in default. */
export function resolveEncoder(
  routeOption: EncoderOption | undefined,
  routerOption: EncoderOption | undefined,
  label = 'route'
): ResolvedEncoder {
  return {
    params: directionOf(routeOption, 'params', label) ?? directionOf(routerOption, 'params', 'router') ?? DEFAULT_ENCODER.params,
    return: directionOf(routeOption, 'return', label) ?? directionOf(routerOption, 'return', 'router') ?? DEFAULT_ENCODER.return,
  };
}

/** The JSON strategy a direction compiles. `binary` keeps that direction's BUILT-IN default JSON
 *  pair compiled beside the binary pair: the optimistic first request and the binary-encode
 *  fallback both need it. */
export function jsonStrategyOf(strategy: WireStrategy, direction: keyof ResolvedEncoder): JsonStrategy {
  return strategy === 'binary' ? (DEFAULT_ENCODER[direction] as JsonStrategy) : strategy;
}
