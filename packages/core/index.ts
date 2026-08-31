/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getOrCreateGlobal} from './src/utils.ts';

// side effect: register every mion format (patterns, pure fns, mocking fns). Type-only
// imports of format aliases get erased by the transpiler, so registration must ride a module
// that is always value-imported — @mionjs/core is (every mion package depends on it).
// REQUIRED even though mion owns no format types of its own: the Go-emitted validator cache
// resolves format checks through `utl.getPureFn('rtFormats::isUUID')` & co at RUNTIME, so any
// route whose params use a mion format needs these registrations loaded. Removing this
// line is a runtime break, not a type-only one.
import '@mionjs/run-types/formats';
// mion error classes (TypedError/RpcError) register themselves with the mion
// class-serializer registry at the bottom of ./src/errors.ts (exported below), so JSON/binary
// decoders rebuild real instances.

const __mionLoadCounter = getOrCreateGlobal('mion.core.loadCounter', () => ({count: 0}));
__mionLoadCounter.count += 1;
if (__mionLoadCounter.count > 1 && typeof process !== 'undefined' && !process.env?.MION_SUPPRESS_DUAL_LOAD_WARN) {
  console.warn(
    `[mion] @mionjs/core has been loaded ${__mionLoadCounter.count} times in this process. ` +
      `This indicates @mionjs/* is not properly bundled — most often a missing/incorrect ssr.noExternal config. ` +
      `mion requires ssr.noExternal: [/@mionjs\\//] to guarantee single-instance state. ` +
      `Set MION_SUPPRESS_DUAL_LOAD_WARN=1 to silence.`
  );
}

export * from './src/types/general.types.ts';
export * from './src/types/method.types.ts';
export * from './src/types/pureFunctions.types.ts';
export * from './src/binary/options.ts';
export * from './src/binary/dataView.ts';
export * from './src/binary/bufferPool.ts';
export * from './src/binary/sizeStats.ts';
export * from './src/binary/bodySerializer.ts';
export * from './src/binary/bodyDeserializer.ts';
export * from './src/constants.ts';
export * from './src/errors.ts';
export * from './src/routerUtils.ts';
export * from './src/utils.ts';
export * from './src/headers.ts';
// mion <-> mion adapter (marker payloads -> the reflection shapes the router consumes)
export * from './src/runtypes/mionAdapter.ts';
// routesFlow server-mapper transport + its wire-lookup security gate
export * from './src/runtypes/serverMappers.ts';
