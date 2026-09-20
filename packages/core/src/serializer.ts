/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {SerializerOption, ResolvedSerializer, SerializerStrategy} from './types/general.types.ts';

// The `serializer` option is a BUILD-TIME literal, so the runtime only reads a resolved pair back and
// checks it against what was compiled (mionAdapter reads the strategy off the injected families).

/** The built-in defaults: `clone` both ways. Never touches the encoded value, and builds the
 *  payload from the DECLARED type, so anything the type does not declare never reaches the wire. */
export const DEFAULT_SERIALIZER = Object.freeze({params: 'clone', return: 'clone'} as const) satisfies ResolvedSerializer;
/** The default pair as literal types, for the router's helper types. */
export type DefaultSerializer = typeof DEFAULT_SERIALIZER;

export const SERIALIZER_STRATEGIES = ['clone', 'mutate', 'compact'] as const satisfies readonly SerializerStrategy[];

export function isSerializerStrategy(value: unknown): value is SerializerStrategy {
  return typeof value === 'string' && (SERIALIZER_STRATEGIES as readonly string[]).includes(value);
}

function directionOf(
  option: SerializerOption | undefined,
  direction: keyof ResolvedSerializer,
  label: string
): SerializerStrategy | undefined {
  if (option === undefined) return undefined;
  const value = typeof option === 'string' ? option : option[direction];
  if (value === undefined) return undefined;
  if (!isSerializerStrategy(value))
    throw new Error(
      `mion: invalid serializer strategy '${String(value)}' for ${label} ${direction}; expected one of ${SERIALIZER_STRATEGIES.join(', ')}`
    );
  return value;
}

/** The serializer pair of a route or middleFn: route option, then router option, then the default. */
export function resolveSerializer(
  routeOption: SerializerOption | undefined,
  routerOption: SerializerOption | undefined,
  label = 'route'
): ResolvedSerializer {
  return {
    params:
      directionOf(routeOption, 'params', label) ?? directionOf(routerOption, 'params', 'router') ?? DEFAULT_SERIALIZER.params,
    return:
      directionOf(routeOption, 'return', label) ?? directionOf(routerOption, 'return', 'router') ?? DEFAULT_SERIALIZER.return,
  };
}
