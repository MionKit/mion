/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {PureServerFnRef} from '../types/pureFunctions.types.ts';
import {computePureServerFnBodyHash} from './pureFn.ts';

/** The namespace used for all pureServerFn functions */
export const PURE_SERVER_FN_NAMESPACE = 'pureServerFn';

/**
 * Defines a pure server function that will be extracted at build time and executed on the server.
 * At runtime on the client, this returns a lightweight reference containing only bodyHash.
 * The actual function body is stripped in production builds and replaced with the hash reference.
 *
 * Rules:
 * - No closure variables
 * - No external imports except other pureServerFn references
 * - The 'pureServerFn' namespace is assigned automatically
 * - Functions can be named or anonymous (bodyHash is used as identifier)
 */
export function pureServerFn<F extends (...args: any[]) => any>(fn: F): PureServerFnRef<F> {
    // Compute body hash using shared utility from core (body-only, no fnName)
    const bodyHash = computePureServerFnBodyHash(PURE_SERVER_FN_NAMESPACE, fn.toString());

    return {
        fnName: fn.name || undefined, // Optional - for debugging purposes only
        bodyHash,
        fn,
    };
}
