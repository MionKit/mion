/* ########
 * 2021 ApiDS
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import * as fs from 'fs';
import * as path from 'path';
import {join} from 'path';
import {API_ROUTE_PARAMS_LENGTH} from './constants';
import {ApiRouteOptions, ApiRoutes, DirectoryTree} from './types';

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

// https://stackoverflow.com/questions/41462606/get-all-files-recursively-in-directories-nodejs
export function getAllFillesFromDirectory(Directory) {
    let files: string[] = [];
    fs.readdirSync(Directory).forEach((file) => {
        const Absolute = join(Directory, file);
        if (fs.statSync(Absolute).isDirectory()) return getAllFillesFromDirectory(Absolute);
        else return files.push(Absolute);
    });
    return files;
}
