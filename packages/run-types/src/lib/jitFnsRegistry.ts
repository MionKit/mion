/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {JitFnID} from '../types.ts';
import {JitFnSettings, jitFunctionList, jitFunctionsById} from '../constants.functions.ts';

type resolvedCompiler = {
    jitFnSettings: JitFnSettings;
    compiler: (...args: any[]) => any;
};

const jitFunctionsRegistry: Map<string, resolvedCompiler> = new Map();
const nativeIds: Set<string> = new Set(jitFunctionList.filter((f) => !f.import).map((f) => f.id));

export async function registerJitFunctionCompiler(jitFnSettings: JitFnSettings): Promise<(...args: any[]) => any> {
    const existing = jitFunctionsRegistry.get(jitFnSettings.id);
    if (nativeIds.has(jitFnSettings.id))
        throw new Error(`Jit function ${jitFnSettings.name} is native and can not be registered`);
    if (existing) return existing.compiler;
    if (!jitFnSettings.import) throw new Error(`Jit function ${jitFnSettings.name} has no import function`);
    try {
        const newFn = await jitFnSettings.import();
        jitFunctionsRegistry.set(jitFnSettings.id, {
            jitFnSettings: jitFnSettings,
            compiler: newFn,
        });
        return newFn;
    } catch (e: any) {
        console.warn(e);
        throw new Error(`Error loading jit function ${jitFnSettings.name}: ${e?.message}`);
    }
}

/** synchronous version of loadRegisteredFunction, throws an error if the function has not been loaded */
export function getJitFunctionCompiler(jitFnSettings: JitFnSettings): (...args: any[]) => any {
    const existing = jitFunctionsRegistry.get(jitFnSettings.id);
    if (existing) return existing.compiler;
    throw new Error(`Function ${jitFnSettings.name} has not been loaded.`);
}

export function getJitFnSettings(fnID: JitFnID): JitFnSettings {
    const fnConfig = jitFunctionsById[fnID] || jitFunctionsRegistry.get(fnID)?.jitFnSettings;
    if (fnConfig === undefined) throw new Error(`Unknown jit function id: ${fnID}`);
    return fnConfig;
}

export function getJITFnName(fnID: JitFnID): string {
    return getJitFnSettings(fnID).name;
}
