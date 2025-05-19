/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReceiveType} from '@deepkit/type';
import {existsSync, writeFileSync} from 'fs';
import {join} from 'path';
import {JitFunctionsCache, PureFunctionsCache} from '@mionkit/core/src/types';
import {JitFunctions} from '../constants';
import {runType} from '../lib/runType';

export const compilerConstants = {
    autoGenMessage: `// ###### DO NOT MODIFY MANUALLY: THIS FILE IS GENERATED AUTOMATICALLY\n// NOTE exported constant name must be 'cΦmpilεd' and file can not contain any other code\n`,
    exportName: 'cΦmpilεd',
    corePackageName: '@mionkit/core',
    jitFunctionsFiles: [`./dist/cjs/compiled/jitFunctionsCache`, `./dist/esm/compiled/jitFunctionsCache`],
    pureFunctionsFiles: [`./dist/cjs/compiled/pureFunctionsCache`, `./dist/esm/compiled/pureFunctionsCache`],
    jsFilesExtensions: ['.js', '.mjs', '.cjs', '.jsx'],
};

/** Checks if the given directory is a root directory */
function isRootDir(dir: string): boolean {
    // On Windows, root directories look like 'C:\', 'D:\', etc.
    if (process.platform === 'win32') {
        return /^[A-Z]:\\$/i.test(dir);
    }
    // On Unix-like systems (macOS, Linux), the root directory is '/'
    return dir === '/';
}

/**
 * Finds a JavaScript file in the file system, working across different JavaScript runtimes
 * including Node.js, Bun, and others.
 *
 * @param packageName The name of the package to find
 * @param fileNameNoExt The file path within the package, without extension
 * @returns The full path to the file if found, undefined otherwise
 */
export function findJSFile(packageName: string, fileNameNoExt: string): string | undefined {
    // First try the current approach - looking in the current directory
    let fileName: string | undefined;

    // Try with each supported extension
    for (const ext of compilerConstants.jsFilesExtensions) {
        const jsName = join(__dirname, `${fileNameNoExt}${ext}`);
        if (existsSync(jsName)) {
            return jsName;
        }
    }

    // If not found, try to find the package in node_modules directories
    try {
        // Start with the current directory and scan upwards
        let currentDir = __dirname;
        const rootDir = currentDir.split(packageName)[0]; // Find the root of the package

        // Try to find the package in node_modules
        while (currentDir !== rootDir && !isRootDir(currentDir)) {
            // Check for the file directly in this directory
            for (const ext of compilerConstants.jsFilesExtensions) {
                const filePath = join(currentDir, fileNameNoExt + ext);
                if (existsSync(filePath)) {
                    return filePath;
                }
            }

            // Check for node_modules in this directory
            const nodeModulesPath = join(currentDir, 'node_modules', packageName);
            if (existsSync(nodeModulesPath)) {
                // If we found the package, look for the specific file
                for (const ext of compilerConstants.jsFilesExtensions) {
                    const filePath = join(nodeModulesPath, fileNameNoExt + ext);
                    if (existsSync(filePath)) {
                        return filePath;
                    }
                }
            }

            // Move up one directory
            const parentDir = join(currentDir, '..');
            if (parentDir === currentDir) {
                break; // Prevent infinite loop
            }
            currentDir = parentDir;
        }
    } catch (error) {
        console.error(`Error finding JS file: packageName=${packageName}, fileNameNoExt=${fileNameNoExt}`, error);
    }

    return fileName;
}

/** Saves jit compiled functions to a dist file in the core package, this should be run after typescript has been compiled */
export function compileAndWriteJitFunctions(cache: JitFunctionsCache) {
    const fullFileNames = compilerConstants.jitFunctionsFiles.map((file) =>
        findJSFile(compilerConstants.corePackageName, file)
    ) as string[];
    if (!fullFileNames.every(Boolean)) {
        const missingFiles = fullFileNames.filter((file) => !file);
        throw new Error(`Can't find files to save compiled JIT functions: ${missingFiles.join(',')}`);
    }
    const fileCode = compileTypeToJs<JitFunctionsCache>(cache);
    fullFileNames.forEach((fullFileName: string) => writeFileSync(fullFileName, fileCode, 'utf8'));
    return fileCode;
}

/** Saves pure functions to a dist file in the core package, this should be run after typescript has been compiled */
export function compileAndWritePureFunctions(cache: PureFunctionsCache) {
    const fullFileNames = compilerConstants.pureFunctionsFiles.map((file) =>
        findJSFile(compilerConstants.corePackageName, file)
    ) as string[];
    if (!fullFileNames.every(Boolean)) {
        const missingFiles = fullFileNames.filter((file) => !file);
        throw new Error(`Can't find files to save compiled JIT functions: ${missingFiles.join(',')}`);
    }
    const fileCode = compileTypeToJs<PureFunctionsCache>(cache);
    fullFileNames.forEach((fullFileName: string) => writeFileSync(fullFileName, fileCode, 'utf8'));
    return fileCode;
}

/** generates code to save any type into a js file and writes the file, file will be fully overwritten */
export function compileAndSaveTypeToJs<T>(instance: T, fullFileName: string, type?: ReceiveType<T>): string {
    const fileCode = compileTypeToJs(instance, type);
    writeFileSync(fullFileName, fileCode, 'utf8');
    return fileCode;
}

/** generates code to save any type into a js file */
export function compileTypeToJs<T>(instance: T, type?: ReceiveType<T>): string {
    const rt = runType(type);
    const toCode = rt.createJitFunction(JitFunctions.toCode);
    const code = toCode(instance);
    const fileCode = `${compilerConstants.autoGenMessage}export const ${compilerConstants.exportName} = ${code}\n`;
    return fileCode;
}
