/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

type RunTypeModule = Awaited<typeof import('@mionkit/runtype')>;
let runTypeModule: RunTypeModule;

export function importFunctionReflectionMethods() {
    importModule();
    return runTypeModule.getFunctionReflectionMethods;
}

export function importSerializedFunctionTypes() {
    importModule();
    return runTypeModule.getSerializedFunctionTypes;
}

function importModule() {
    if (runTypeModule) return runTypeModule;
    runTypeModule = require('@mionkit/runtype');
    return runTypeModule;
}
