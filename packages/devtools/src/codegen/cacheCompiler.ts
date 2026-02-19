/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReceiveType} from '@deepkit/type';
import {existsSync, writeFileSync, mkdirSync, readFileSync} from 'fs';
import {dirname, join} from 'path';
import {execSync} from 'child_process';
import {JitFunctionsCache, PersistedJitFunctionsCache, PersistedPureFunctionsCache, PureFunctionsCache} from '@mionkit/core';
import {JitFunctions, runType} from '@mionkit/run-types';
import {AOTConfig, compiledCacheConfig} from './types.ts';
import {MethodsCache} from '@mionkit/core';

/**
 * Get the path to the biome binary.
 * Uses the biome package installed in the codegen package.
 */
function getBiomePath(): string {
    // Resolve biome binary from @biomejs/biome package
    const biomePkgPath = require.resolve('@biomejs/biome/package.json');
    return join(dirname(biomePkgPath), 'bin', 'biome');
}

/**
 * Format JavaScript code using biome via CLI.
 * Uses stdin to pass code and --stdin-file-path to specify the file type.
 * @param code - The JavaScript code to format
 * @param filename - Virtual filename for biome to determine parser (e.g., 'file.js')
 * @returns Formatted code
 */
export function formatWithBiome(code: string, filename: string = 'file.js'): string {
    try {
        const biomePath = getBiomePath();
        const formattedCode = execSync(`${biomePath} format --stdin-file-path=${filename}`, {
            input: code,
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large cache files
        });
        return formattedCode;
    } catch (error) {
        // If formatting fails, return the original code
        console.warn(`Biome formatting failed, using unformatted code: ${(error as Error).message}`);
        return code;
    }
}

/** Saves jit compiled functions to a dist file in the core package, this should be run after typescript has been compiled */
export function compileAndWriteJitFunctions(cache: JitFunctionsCache, config: AOTConfig) {
    return compileAndWriteRunType<PersistedJitFunctionsCache>(
        cache as any as PersistedJitFunctionsCache,
        config,
        config.caches.jit
    );
}

/** Saves pure functions to a dist file in the core package, this should be run after typescript has been compiled */
export function compileAndWritePureFunctions(cache: PureFunctionsCache, config: AOTConfig) {
    return compileAndWriteRunType<PersistedPureFunctionsCache>(cache as PersistedPureFunctionsCache, config, config.caches.pure);
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
    let fileCode = compileTypeToJs(instance, config, fileToWrite, type, originalSrcCode);

    // Format code with biome before writing
    fileCode = formatWithBiome(fileCode, 'cache.js');

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
    const toJSCode = rt.createJitFunction(JitFunctions.toJSCode, config.runTypeOptions);
    const code = toJSCode(instance);

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
        // Vite CJS output format: const exportName = {}; ... exports.exportName = exportName;
        // We need to replace both the declaration and keep the export assignment
        const constPattern = `const ${exportName} = {};`;
        if (originalSrc.includes(constPattern)) {
            return originalSrc.replace(constPattern, `const ${exportName} = ${compiledCode};`);
        }

        // Fallback: Replace exact pattern: exports.exportName = {};
        const exactPattern = `exports.${exportName} = {};`;
        if (originalSrc.includes(exactPattern)) {
            return originalSrc.replace(exactPattern, `exports.${exportName} = ${compiledCode};`);
        }
    } else {
        // Vite ESM output format: const exportName = {}; export { exportName };
        const constPattern = `const ${exportName} = {};`;
        if (originalSrc.includes(constPattern)) {
            return originalSrc.replace(constPattern, `const ${exportName} = ${compiledCode};`);
        }

        // Fallback: Replace exact pattern: export const exportName = {};
        const exactPattern = `export const ${exportName} = {};`;
        if (originalSrc.includes(exactPattern)) {
            return originalSrc.replace(exactPattern, `export const ${exportName} = ${compiledCode};`);
        }
    }

    // If no pattern found, throw error
    throw new Error(
        `Could not find export pattern for '${exportName}' in ${moduleType} module format. Expected: 'const ${exportName} = {};' or '${moduleType === 'cjs' ? `exports.${exportName} = {};` : `export const ${exportName} = {};`}'`
    );
}
