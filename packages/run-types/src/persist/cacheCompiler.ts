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
    autoGenMessage: `// ###### DO NOT MODIFY MANUALLY: THIS FILE IS GENERATED AUTOMATICALLY\n// NOTE exported constant name must be 'cΦmpilεdCachε' and file can not contain any other code\n`,
    exportName: 'cΦmpilεdCachε',
    corePackageName: '@mionkit/core',
    jitFunctionsFiles: [`./dist/cjs/_autogen/jitFunctionsCache`, `./dist/esm/_autogen/jitFunctionsCache`],
    pureFunctionsFiles: [`./dist/cjs/_autogen/pureFunctionsCache`, `./dist/esm/_autogen/pureFunctionsCache`],
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

function findFile(packageDir: string, fileNameNoExt: string): string | undefined {
    for (const ext of compilerConstants.jsFilesExtensions) {
        const filePath = join(packageDir, `${fileNameNoExt}${ext}`);
        if (existsSync(filePath)) return filePath;
    }
}

/**
 * Finds a JavaScript file in node modules of the current project.
 * This function is probably overkill and we just need use relative path to core package
 * but is a bit more flexible and will allow to change build configurations in the future.
 */
export function findJSFile(packageName: string, fileNameNoExt: string): string | undefined {
    try {
        let currentDir = __dirname;
        // Traverse up the directory tree until we reach the root
        while (!isRootDir(currentDir)) {
            // Check for node_modules in this directory
            const nodeModulesDir = join(currentDir, 'node_modules');
            if (existsSync(nodeModulesDir)) {
                const packageDir = join(nodeModulesDir, packageName);
                if (existsSync(packageDir)) {
                    const filePath = findFile(packageDir, fileNameNoExt);
                    if (filePath) return filePath;
                }
            }
            // Move up one directory
            const parentDir = join(currentDir, '..');
            if (parentDir === currentDir) break; // Prevent infinite loop
            currentDir = parentDir;
        }
    } catch (error) {
        console.error(`Error finding JS file: packageName=${packageName}, fileNameNoExt=${fileNameNoExt}`, error);
    }
    return undefined;
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
