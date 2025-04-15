/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFnSettings} from '@mionkit/run-types/src/constants';

const functionRegistry: Map<string, (...args: any[]) => any> = new Map();

export async function loadComposableFunction(jitFn: JitFnSettings): Promise<(...args: any[]) => any> {
    const fn = functionRegistry.get(jitFn.id);
    if (fn) return fn;
    if (!jitFn.import) throw new Error(`Jit function ${jitFn.name} has no import function`);
    const newFn = await jitFn.import();
    functionRegistry.set(jitFn.id, newFn);
    return newFn;
}

/** synchronous version of loadRegisteredFunction, throws an error if the function has not been loaded */
export function getComposableFunction(jitFn: JitFnSettings): (...args: any[]) => any {
    const fn = functionRegistry.get(jitFn.id);
    if (fn) return fn;
    throw new Error(`Function ${jitFn.name} has not been loaded.`);
}
