/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {PURE_SERVER_FN_NAMESPACE} from '@mionkit/core';
import {ExtractedPureFn, PureServerFnRegistry, PureServerFnRegistryEntry} from './types.ts';

const REGISTRY_VERSION = '1.0.0';

/** Serializes extracted pure functions into a registry structure (keyed by bodyHash) */
export function createRegistry(extractedFns: ExtractedPureFn[]): PureServerFnRegistry {
    const entries: Record<string, PureServerFnRegistryEntry> = {};

    for (const fn of extractedFns) {
        // Use bodyHash as the key instead of fnName
        entries[fn.bodyHash] = {
            namespace: PURE_SERVER_FN_NAMESPACE,
            fnName: fn.fnName, // Optional, for debugging
            paramNames: fn.paramNames,
            code: fn.code,
            bodyHash: fn.bodyHash,
            dependencies: fn.dependencies,
        };
    }

    return {
        version: REGISTRY_VERSION,
        entries,
    };
}
