/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {EncoderOption, JsonStrategy, ResolvedEncoder, WireStrategy} from './types/general.types.ts';

// The `encoder` option is a BUILD-TIME literal, so the runtime only reads a resolved pair back and
// checks it against what was compiled (mionAdapter reads the strategy off the injected families).

/** The built-in defaults: `clone` both ways. Never touches the encoded value, and builds the
 *  payload from the DECLARED type, so anything the type does not declare never reaches the wire. */
export const DEFAULT_ENCODER = Object.freeze({params: 'clone', return: 'clone'} as const) satisfies ResolvedEncoder;
/** The default pair as literal types, for the router's helper types. */
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

/** The encoder pair of a route or middleFn: route option, then router option, then the default. */
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

/** The JSON strategy a direction compiles. `binary` keeps the built-in default pair beside it, for
 *  the optimistic first request and the binary-encode fallback. */
export function jsonStrategyOf(strategy: WireStrategy, direction: keyof ResolvedEncoder): JsonStrategy {
  return strategy === 'binary' ? (DEFAULT_ENCODER[direction] as JsonStrategy) : strategy;
}
