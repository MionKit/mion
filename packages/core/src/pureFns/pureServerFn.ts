/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {PureFnDef, PureServerFnRef} from '../types/pureFunctions.types.ts';
import {computePureServerFnBodyHash} from './pureFn.ts';

/** The namespace used for all pureServerFn functions */
export const PURE_SERVER_FN_NAMESPACE = 'pureServerFn';

/** Extracts PureServerFnRef data from a PureFnDef at runtime */
export function extractDataFromPureFnDef<F extends (...args: any[]) => any>(def: PureFnDef<F>): PureServerFnRef<F> {
    const namespace = def.namespace || PURE_SERVER_FN_NAMESPACE;
    const bodyHash = computePureServerFnBodyHash(namespace, def.pureFn.toString());
    const fnName = def.fnName || def.pureFn.name || bodyHash;
    const isFactory = def.isFactory || false;
    return {namespace, fnName, bodyHash, pureFn: def.pureFn, isFactory};
}

/** Extracts PureServerFnRef data from a list of PureFnDef objects, adding cross-dependencies */
export function extractDataFromPureFnDefList<F extends (...args: any[]) => any>(defs: PureFnDef<F>[]): PureServerFnRef<F>[] {
    const refs = defs.map((def) => extractDataFromPureFnDef(def));
    const allKeys = refs.map((ref) => `${ref.namespace}::${ref.fnName}`);
    for (const ref of refs) {
        const ownKey = `${ref.namespace}::${ref.fnName}`;
        ref.dependencies = allKeys.filter((key) => key !== ownKey);
    }
    return refs;
}

/**
 * Defines a pure server function that will be extracted at build time and executed on the server.
 * At runtime on the client, this returns a lightweight reference containing a PureServerFnRef.
 *
 * This is intended to be used for mapping functions from routes responses to routes inputs
 * when calling multiple routes in a single call (Workflows)
 *
 * Rules:
 * - No closure variables
 * - No external imports except other pureServerFn references
 * - The 'pureServerFn' namespace is assigned automatically
 * - Functions can be named or anonymous (bodyHash is used as identifier)
 *
 * Example:
 * ```ts
 * const myPureServerFn = pureServerFn({ pureFn: function mapUserPreferences(users: User[]) {
 *   return users.map(user => ({id: user.preferences_id}));
 * }});
 * ```
 */
export function pureServerFn<F extends (...args: any[]) => any>(def: PureFnDef<F>): PureServerFnRef<F> {
    return extractDataFromPureFnDef(def);
}

/** Allows to register a group of pure functions and mark them as dependencies of each other */
export function pureServerFnGroup<F extends (...args: any[]) => any>(defs: PureFnDef<F>[]): PureServerFnRef<F>[] {
    return extractDataFromPureFnDefList(defs);
}
