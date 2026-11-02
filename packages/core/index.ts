/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// TypedError/RpcError register themselves with the class-serializer registry at the bottom of
// ./src/errors.ts (exported below), so JSON decoders rebuild real instances.

export * from './src/types/general.types.ts';
export * from './src/types/method.types.ts';
export * from './src/types/pureFunctions.types.ts';
export * from './src/constants.ts';
export * from './src/parser.ts';
export * from './src/errors.ts';
export * from './src/routerUtils.ts';
export * from './src/utils.ts';
export * from './src/headers.ts';
// mion <-> mion adapter (marker payloads -> the reflection shapes the router consumes)
export * from './src/runtypes/mionAdapter.ts';
// batch input-mapper transport + its lookup security gate
export * from './src/runtypes/inputMappers.ts';
