/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getOrCreateGlobal} from './src/utils.ts';

// side effect: register every ts-runtypes format (patterns, pure fns, mocking fns). Type-only
// imports of format aliases get erased by the transpiler, so registration must ride a module
// that is always value-imported — @mionjs/core is (every mion package depends on it).
import '@ts-runtypes/core/formats';
// side effect: register mion error classes (TypedError/RpcError) with the ts-runtypes
// class-serializer registry so JSON/binary decoders rebuild real instances.
import './src/runtypes/mionClassSerializers.ts';

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
export * from './src/types/formats/formats.types.ts';
export * from './src/types/formats/formatsParams.types.ts';
export * from './src/types/formats/formatBrands.types.ts';
export * from './src/binary/dataView.ts';
export * from './src/binary/bodySerializer.ts';
export * from './src/binary/bodyDeserializer.ts';
export * from './src/constants.ts';
export * from './src/errors.ts';
export * from './src/jit/jitUtils.ts';
export * from './src/routerUtils.ts';
export * from './src/utils.ts';
export * from './src/headers.ts';
// mion <-> ts-runtypes adapter + pure-fn registry (folded in from the removed @mionjs/run-types)
export * from './src/runtypes/mionAdapter.ts';
export * from './src/runtypes/mionPureFns.ts';
