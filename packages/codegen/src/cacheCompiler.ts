/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReceiveType} from '@deepkit/type';
import {existsSync, writeFileSync, mkdirSync} from 'fs';
import {dirname} from 'path';
import {JitFunctionsCache, PureFunctionsCache} from '@mionkit/core';
import {JitFunctions, runType} from '@mionkit/run-types';
import {AOTConfig, compiledCacheConfig} from './types';
import {getDefaultAOTConfig} from './constants';
import {MethodsCache} from '@mionkit/router';

/** Saves jit compiled functions to a dist file in the core package, this should be run after typescript has been compiled */
export function compileAndWriteJitFunctions(cache: JitFunctionsCache, config: Partial<AOTConfig>) {
    const defaultCong = getDefaultAOTConfig(config);
    return compileAndWriteRunType<JitFunctionsCache>(cache, defaultCong, defaultCong.caches.jit);
}

/** Saves pure functions to a dist file in the core package, this should be run after typescript has been compiled */
export function compileAndWritePureFunctions(cache: PureFunctionsCache, config: Partial<AOTConfig>) {
    const defaultCong = getDefaultAOTConfig(config);
    return compileAndWriteRunType<PureFunctionsCache>(cache, defaultCong, defaultCong.caches.pure);
}

/** Saves router methods to a dist file, this should be run after typescript has been compiled */
export function compileAndWriteRouterMethods(cache: MethodsCache, config: Partial<AOTConfig>) {
    const defaultCong = getDefaultAOTConfig(config);
    return compileAndWriteRunType<MethodsCache>(cache, defaultCong, defaultCong.caches.router);
}

/** generates code to save any type into a js file and writes the file, file will be fully overwritten */
export function compileAndWriteRunType<T>(
    instance: T,
    config: AOTConfig,
    fileToWrite: compiledCacheConfig,
    type?: ReceiveType<T>
): string {
    // Generate file code with appropriate format based on module type
    const fileCode = compileTypeToJs(instance, config, fileToWrite, type);
    console.log('fileToWrite:', fileToWrite);

    // Ensure directory exists before writing file
    const dir = dirname(fileToWrite.path);
    if (!existsSync(dir)) {
        mkdirSync(dir, {recursive: true});
    }
    writeFileSync(fileToWrite.path, fileCode, 'utf8');

    return fileCode;
}

/** generates code to save any type into a js file */
export function compileTypeToJs<T>(
    instance: T,
    config: AOTConfig,
    fileToWrite: compiledCacheConfig,
    type?: ReceiveType<T>
): string {
    const rt = runType(type);
    const toCode = rt.createJitFunction(JitFunctions.toCode, config.runTypeOptions);
    const code = toCode(instance);

    // Determine export format based on module type
    const isCommonJS = config.module === 'cjs';
    const exportStatement = isCommonJS
        ? `module.exports = { ${fileToWrite.exportName}: ${code} };\n`
        : `export const ${fileToWrite.exportName} = ${code};\n`;

    return `${config.fileHeader}\n${exportStatement}`;
}
