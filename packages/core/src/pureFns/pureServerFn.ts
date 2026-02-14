/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Mutable} from '../types/general.types.ts';
import {PureServerFnRef} from '../types/pureFunctions.types.ts';
import {computePureServerFnBodyHash} from './pureFn.ts';

/** The namespace used for all pureServerFn functions */
export const PURE_SERVER_FN_NAMESPACE = 'pureServerFn';

/**
 * Defines a pure server function that will be extracted at build time and executed on the server.
 * At runtime on the client, this returns a lightweight reference containing a PureServerFnRef.
 *
 * This is intended to be used for mapping functions from routes responses to routes inputs
 * when calling multiple routes ins a single call (Workflows)
 *
 * Rules:
 * - No closure variables
 * - No external imports except other pureServerFn references
 * - The 'pureServerFn' namespace is assigned automatically
 * - Functions can be named or anonymous (bodyHash is used as identifier)
 *
 * ei:
 *
 * const myPureServerFn = pureServerFn(function mapUserPreferences(users: User[]) {
 *   return users.map(user => {id: user.preferences_id});
 * });
 */
export function pureServerFn<F extends (...args: any[]) => any>(
    pureFn: F,
    namespace?: string,
    name?: string
): PureServerFnRef<F> {
    // Compute body hash using shared utility from core (body-only, no fnName)
    const bodyHash = computePureServerFnBodyHash(PURE_SERVER_FN_NAMESPACE, pureFn.toString());

    return {
        namespace: namespace || PURE_SERVER_FN_NAMESPACE,
        fnName: name || pureFn.name || bodyHash,
        bodyHash,
        fn: pureFn,
        isFactoryWithJitUtils: false,
    };
}

/**
 * Defines a sever pure facture functions. these are pure functions that receives JITUtils as uniquer argument
 * and should return a pure function that will be executed on the server.
 *
 * This is intended to be used for JIT serializable function.
 * The factory function can initialize the context with heavy elements adn return a lightweight function.
 *
 */
export function pureServerFactoryFn<F extends (...args: any[]) => any>(
    pureFactoryFn: F,
    namespace: string,
    name?: string
): PureServerFnRef<F> {
    // Compute body hash using shared utility from core (body-only, no fnName)
    const bodyHash = computePureServerFnBodyHash(PURE_SERVER_FN_NAMESPACE, pureFactoryFn.toString());

    const fnName = name || pureFactoryFn.name;
    if (!fnName) throw new Error('pureServerFactoryFn must have a name');

    return {
        namespace: namespace || PURE_SERVER_FN_NAMESPACE,
        fnName,
        bodyHash,
        fn: pureFactoryFn,
        isFactoryWithJitUtils: true,
    };
}

/** Allows to register a group of pure functions and mark them as dependencies of each other  */
export function pureServerFnGroup<F extends (...args: any[]) => any>(pureFnRefList: PureServerFnRef<F>[]): PureServerFnRef<F>[] {
    const dependencies = pureFnRefList.map((pureFnRef) => {
        return pureFnRef.namespace + '::' + pureFnRef.fnName;
    });
    pureFnRefList.forEach((pureFnRef) => {
        (pureFnRef as Mutable<PureServerFnRef>).dependencies = [...dependencies];
    });
    return pureFnRefList;
}
