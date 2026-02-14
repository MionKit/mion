/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ExtractedPureFn, PureServerFnRegistry, PureServerFnRegistryEntry} from './types.ts';

const REGISTRY_VERSION = '1.0.0';

/** Serializes extracted pure functions into a registry structure (keyed by namespace::fnName) */
export function createRegistry(extractedFns: ExtractedPureFn[]): PureServerFnRegistry {
    const entries: Record<string, PureServerFnRegistryEntry> = {};

    for (const fn of extractedFns) {
        // Use namespace::fnName as the key
        const key = `${fn.namespace}::${fn.fnName}`;
        entries[key] = {
            namespace: fn.namespace,
            fnName: fn.fnName,
            paramNames: fn.paramNames,
            code: fn.code,
            bodyHash: fn.bodyHash,
            dependencies: fn.dependencies,
            isFactory: fn.isFactory,
        };
    }

    return {
        version: REGISTRY_VERSION,
        entries,
    };
}
