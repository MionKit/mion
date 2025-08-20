/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReceiveType} from '@deepkit/type';
import {existsSync, writeFileSync, mkdirSync} from 'fs';
import {dirname} from 'path';
import {JitFunctionsCache, PureFunctionsCache, CompiledCacheFile} from '@mionkit/core';
import {JitFunctions} from '../constants.functions';
import {runType} from '../lib/runType';
import {RunTypeOptions} from '../types';

export type SrcCodeCompilerConstants = Readonly<{
    autoGenMessage: string;
    exportName: string;
    files: CompiledCacheFile;
    typeName: string;
    opts?: RunTypeOptions;
}>;

export const runTypeCompilerConstants = {
    autoGenMessage: `// ###### DO NOT MODIFY MANUALLY: THIS FILE IS GENERATED AUTOMATICALLY\n// NOTE exported constant name must be 'cΦmpilεdCachε' and file can not contain any other code\n`,
    exportName: 'cΦmpilεdCachε',
};

/** Saves jit compiled functions to a dist file in the core package, this should be run after typescript has been compiled */
export function compileAndWriteJitFunctions(cache: JitFunctionsCache, file: CompiledCacheFile) {
    const compOpts = {
        ...runTypeCompilerConstants,
        typeName: 'JIT functions',
        files: file,
        opts: {isJitFnCode: true},
    } satisfies SrcCodeCompilerConstants;

    return compileAndWriteRunType<JitFunctionsCache>(cache, compOpts);
}

/** Saves pure functions to a dist file in the core package, this should be run after typescript has been compiled */
export function compileAndWritePureFunctions(cache: PureFunctionsCache, file: CompiledCacheFile) {
    const compOpts = {
        ...runTypeCompilerConstants,
        typeName: 'Pure functions',
        files: file,
        opts: {isPureFnCode: true},
    } satisfies SrcCodeCompilerConstants;

    return compileAndWriteRunType<PureFunctionsCache>(cache, compOpts);
}

/** generates code to save any type into a js file and writes the file, file will be fully overwritten */
export function compileAndWriteRunType<T>(instance: T, constants: SrcCodeCompilerConstants, type?: ReceiveType<T>) {
    // Determine which file to write based on the function type
    let fileToWrite: {path: string; module: 'cjs' | 'esm'} | null = null;

    if (constants.opts?.isJitFnCode && constants.files.jit.path) {
        fileToWrite = constants.files.jit;
    } else if (constants.opts?.isPureFnCode && constants.files.pure.path) {
        fileToWrite = constants.files.pure;
    }

    if (fileToWrite && fileToWrite.path) {
        // Generate file code with appropriate format based on module type
        const fileCode = compileTypeToJs(instance, constants, fileToWrite.module, type);

        // Ensure directory exists before writing file
        const dir = dirname(fileToWrite.path);
        if (!existsSync(dir)) {
            mkdirSync(dir, {recursive: true});
        }
        writeFileSync(fileToWrite.path, fileCode, 'utf8');

        return fileCode;
    }

    return '';
}

/** generates code to save any type into a js file */
export function compileTypeToJs<T>(
    instance: T,
    constants: SrcCodeCompilerConstants,
    moduleType?: 'cjs' | 'esm',
    type?: ReceiveType<T>
): string {
    const opts = constants.opts || {};
    const rt = runType(type);
    const toCode = rt.createJitFunction(JitFunctions.toCode, opts);
    const code = toCode(instance);

    // Determine export format based on module type
    const isCommonJS = moduleType === 'cjs';
    const exportStatement = isCommonJS
        ? `module.exports = { ${constants.exportName}: ${code} };\n`
        : `export const ${constants.exportName} = ${code}\n`;

    const fileCode = `${constants.autoGenMessage}${exportStatement}`;
    return fileCode;
}
