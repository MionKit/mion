/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFnSettings} from '@mionkit/run-types/src/constants';

const jitFunctionsRegistry: Map<string, (...args: any[]) => any> = new Map();

export async function loadJitCompilerFunction(jitFn: JitFnSettings): Promise<(...args: any[]) => any> {
    const fn = jitFunctionsRegistry.get(jitFn.id);
    if (fn) return fn;
    if (!jitFn.import) throw new Error(`Jit function ${jitFn.name} has no import function`);
    try {
        const newFn = await jitFn.import();
        jitFunctionsRegistry.set(jitFn.id, newFn);
        return newFn;
    } catch (e: any) {
        console.warn(e);
        throw new Error(`Error loading jit function ${jitFn.name}: ${e?.message}`);
    }
}

/** synchronous version of loadRegisteredFunction, throws an error if the function has not been loaded */
export function getJitCompilerFunction(jitFn: JitFnSettings): (...args: any[]) => any {
    const fn = jitFunctionsRegistry.get(jitFn.id);
    if (fn) return fn;
    throw new Error(`Function ${jitFn.name} has not been loaded.`);
}
