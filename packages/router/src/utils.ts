/* ########
 * 2021 ApiDS
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import * as fs from 'fs';
import * as path from 'path';
import * as pm from 'picomatch';
import {ALLOWED_EXTENSIONS, API_ROUTE_PARAMS_LENGTH} from './constants';
import {ApiCompilerOptions, ApiRoute, ApiRouteOptions, ApiRoutes, DirectoryTree} from './types';

export function isApiRoute(item: any): boolean {
    return typeof item === 'function' && item.length <= API_ROUTE_PARAMS_LENGTH;
}

export function isApiRouteOptions(item: any): boolean {
    const routeOpts = item as ApiRouteOptions<any, any>;
    return routeOpts && routeOpts.handler && isApiRoute(routeOpts.handler);
}

export function isApiRoutes(item: any): boolean {
    if (!item || typeof item !== 'object') return false;
    return Object.keys(getNonApiRouteItems(item as ApiRoutes)).length === 0;
}

export function getNonApiRouteItems(routes: ApiRoutes): {[key: string]: any} {
    const nonRoutes = {};
    for (const key in routes) {
        const value = routes[key];
        const isRoute = isApiRouteOptions(value) || isApiRoute(value);
        if (!isRoute) nonRoutes[key] = value;
    }
    return nonRoutes;
}

export function getAllRouteFiles(opts: ApiCompilerOptions, dirTree: DirectoryTree = getDirectoryTree(opts.srcDir)): string[] {
    const pmInclude = opts.srcInclude ? pm(opts.srcInclude) : undefined;
    const pmIgnore = opts.srcIgnore ? pm(opts.srcIgnore) : undefined;
    const files = _getAllPathsRecursively(dirTree, pmInclude, pmIgnore);
    // TODO: decide if we want to fail or not
    // if (files.length === 0) {
    //     const includeError = opts.srcInclude ? `Include pattern '${opts.srcInclude}'.` : '';
    //     const ignoreError = opts.srcIgnore ? `Ignore pattern '${opts.srcIgnore}'.` : '';
    //     throw new Error(`No router files found in '${opts.srcDir}'! ${includeError} ${ignoreError}`);
    // }
    return files;
}

// recursively get all files that match ina directory
function _getAllPathsRecursively(dirTree: DirectoryTree, pmInclude?: pm.Matcher, pmIgnore?: pm.Matcher): string[] {
    const files: string[] = [];
    const itemInDirectory = Object.keys(dirTree);
    itemInDirectory.forEach((name) => {
        const item = dirTree[name];
        const isFile = typeof item === 'string';
        if (!isFile) return files.push(..._getAllPathsRecursively(item, pmInclude, pmIgnore));
        if (isPathIncluded(item, pmInclude, pmIgnore)) return files.push(item);
    });
    return files;
}

export function isAllowedFileExension(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return !!ALLOWED_EXTENSIONS.find((allowedExt) => allowedExt === ext);
}

export function isPathIncluded(fileName: string, pmInclude?: pm.Matcher, pmIgnore?: pm.Matcher) {
    const isAllowed = isAllowedFileExension(fileName);
    const isIncluded = pmInclude ? pmInclude(fileName) && isAllowed : isAllowed;
    const isExcluded = pmIgnore ? pmIgnore(fileName) : false;
    return isIncluded && !isExcluded;
}

/**
 * Returns a directory tree structure, all paths are relative to rootDir
 * ie:
 * rootDir
 *  ╠═fileName.txt
 *  ╠═directory1
 *  ║   ╚═fileName2.txt
 * @param rootDir
 * @returns  {'fileName.txt': 'filename.txt', 'directory1': {'fileName2.txt': 'directory1/filename2.txt'}}
 */
export function getDirectoryTree(rootDir: string, currentDir = rootDir): DirectoryTree {
    const rootTree = {};
    const filesInDirectory = fs.readdirSync(currentDir);
    filesInDirectory.forEach((file) => {
        if (file === '.' || file === '..') return;
        const fName = path.join(currentDir, file);
        const isDirectory = fs.statSync(fName).isDirectory();
        if (isDirectory) rootTree[file] = getDirectoryTree(rootDir, fName);
        else rootTree[file] = path.relative(rootDir, fName);
    });
    return rootTree;
}
