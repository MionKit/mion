/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getRTUtils, registerPureFnFactory} from '@ts-runtypes/core';
import type {PureFnId} from '@ts-runtypes/core';

// ############# mion pure functions — ts-runtypes registry, 'mionjs' namespace #############
// The old @mionjs/core pure-fn system (registerPureFnFactory / pureServerFn / bodyHash
// extraction by the deepkit-era vite plugin) is gone. Pure functions now live in the
// ts-runtypes registry, keyed `mionjs::<name>`.
//
// Two registration lanes:
// - FULL build extraction (bodyHash, purity checks PFE9xxx, shippable code): call
//   registerPureFnFactory('mionjs::<name>', factory) with the id as a call-site literal.
//   ⚠️ Import it from '@ts-runtypes/core' directly for now — the scanner does not yet
//   extract calls made through a re-export barrel (verified 2026-07-11; filed upstream).
// - RUNTIME registration (this module's helpers): works everywhere, no build metadata —
//   fine for server-side execution (routesFlow mappings), not for shipping code to clients.

/** Namespace for every mion-owned pure function in the ts-runtypes registry. */
export const MION_PURE_FN_NAMESPACE = 'mionjs';

/** Builds the ts-runtypes registry key for a mion pure fn name. */
export function mionPureFnId(name: string): PureFnId {
    return `${MION_PURE_FN_NAMESPACE}::${name}`;
}

/** Registers a pure function factory under the mionjs namespace (runtime lane). */
export function registerMionPureFn<Fn extends (...args: any[]) => any>(name: string, factory: (utl: unknown) => Fn) {
    return registerPureFnFactory(mionPureFnId(name), factory as never);
}

/** Returns the callable pure fn registered as `mionjs::<name>`, or undefined. */
export function getMionPureFn(name: string): ((...args: any[]) => any) | undefined {
    return getRTUtils().getPureFn(mionPureFnId(name));
}

/** True when `mionjs::<name>` exists in the ts-runtypes pure-fn registry. */
export function hasMionPureFn(name: string): boolean {
    return getRTUtils().getCompiledPureFn(mionPureFnId(name)) !== undefined;
}
