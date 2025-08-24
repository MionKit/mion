/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReceiveType} from '@deepkit/type';
import {existsSync, writeFileSync, mkdirSync, readFileSync} from 'fs';
import {dirname} from 'path';
import {JitFunctionsCache, PureFunctionsCache} from '@mionkit/core';
import {JitFunctions, runType} from '@mionkit/run-types';
import {AOTConfig, compiledCacheConfig} from './types';
import {MethodsCache} from '@mionkit/router';

/** Saves jit compiled functions to a dist file in the core package, this should be run after typescript has been compiled */
export function compileAndWriteJitFunctions(cache: JitFunctionsCache, config: AOTConfig) {
    return compileAndWriteRunType<JitFunctionsCache>(cache, config, config.caches.jit);
}

/** Saves pure functions to a dist file in the core package, this should be run after typescript has been compiled */
export function compileAndWritePureFunctions(cache: PureFunctionsCache, config: AOTConfig) {
    return compileAndWriteRunType<PureFunctionsCache>(cache, config, config.caches.pure);
}

/** Saves router methods to a dist file, this should be run after typescript has been compiled */
export function compileAndWriteRouterMethods(cache: MethodsCache, config: AOTConfig) {
    return compileAndWriteRunType<MethodsCache>(cache, config, config.caches.router);
}

/** generates code to save any type into a js file and writes the file, file will be fully overwritten */
export function compileAndWriteRunType<T>(
    instance: T,
    config: AOTConfig,
    fileToWrite: compiledCacheConfig,
    type?: ReceiveType<T>
): string {
    // Read original source code if file exists (for pattern replacement)
    let originalSrcCode: string | undefined;
    if (existsSync(fileToWrite.path)) {
        originalSrcCode = readFileSync(fileToWrite.path, 'utf8');
    }

    // Generate file code with appropriate format based on module type
    const fileCode = compileTypeToJs(instance, config, fileToWrite, type, originalSrcCode);
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
    type?: ReceiveType<T>,
    originalSrcCode?: string
): string {
    const rt = runType(type);
    const toCode = rt.createJitFunction(JitFunctions.toCode, config.runTypeOptions);
    const code = toCode(instance);

    // If original source code is provided, replace the export pattern instead of generating full file
    if (originalSrcCode) {
        return replaceExportPattern(originalSrcCode, fileToWrite.exportName, code, config.module);
    }

    // Determine export format based on module type
    const isCommonJS = config.module === 'cjs';
    const exportStatement = isCommonJS
        ? `module.exports = { ${fileToWrite.exportName}: ${code} };\n`
        : `export const ${fileToWrite.exportName} = ${code};\n`;

    return exportStatement;
}

/** Replaces export patterns in existing source code */
function replaceExportPattern(originalSrc: string, exportName: string, compiledCode: string, moduleType: 'esm' | 'cjs'): string {
    if (moduleType === 'cjs') {
        // Replace exact pattern: exports.exportName = {};
        const exactPattern = `exports.${exportName} = {};`;
        if (originalSrc.includes(exactPattern)) {
            return originalSrc.replace(exactPattern, `exports.${exportName} = ${compiledCode};`);
        }
    } else {
        // Replace exact pattern: export const exportName = {};
        const exactPattern = `export const ${exportName} = {};`;
        if (originalSrc.includes(exactPattern)) {
            return originalSrc.replace(exactPattern, `export const ${exportName} = ${compiledCode};`);
        }
    }

    // If no pattern found, throw error
    throw new Error(
        `Could not find export pattern for '${exportName}' in ${moduleType} module format. Expected: ${moduleType === 'cjs' ? `exports.${exportName} = {};` : `export const ${exportName} = {};`}`
    );
}
