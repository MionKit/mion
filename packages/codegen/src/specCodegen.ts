/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ProcedureType, PublicApi, PublicProcedure} from '@mionkit/router';
import {dirname, parse, relative} from 'path';
import {hasChildRoutes, type CodegenOptions, type ExportedRoutesMap, type PublicMethodsSpec, type RoutesSpec} from './types';
import {DEFAULT_PRETTIER_OPTIONS, PUBLIC_METHODS_SPEC_EXPORT_NAME, ROUTES_SPEC_EXPORT_NAME} from './constants';
import {format, Options as PrettierOptions} from 'prettier';
// @ypes/cross-spawn is not updated,, once it gets updated we could use normal es6 import
import * as spawn from 'cross-spawn';
import {randomUUID} from 'crypto';
import {AnyObject} from '@mionkit/core';

// TODO: we could use https://ts-morph.com/manipulation/ instead string based code generation but better done than perfect!

/** Returns the TS Spec Source Code */
export function getSpecFile(options: CodegenOptions, exportedRoutes: ExportedRoutesMap) {
    const routesList = Object.values(exportedRoutes);
    const exportNames = Object.keys(exportedRoutes);
    const {publicMethods, routes} = getPublicMethodsAndRoutes(routesList, exportNames);
    const relativeImport = getRelativeImport(options.entryFileName, options.outputFileName);
    const specFileHeader =
        `/* ######## THIS CODE IS AUTOMATICALLY GENERATED BY mion ROUTER, DO NOT MODIFY ######## */\n` +
        `/* ######## Generated at: ${new Date().toUTCString()} ######## */\n` +
        `\nimport type {${exportNames.join(', ')}} from '${relativeImport}'\n` +
        `function fakeHandler(){throw new Error('handlers can not be called directly from the spec file!')}\n`;
    const specFileContent = jsonStringsToCode(`${serializePublicMethods(publicMethods)}\n` + `${serializeRoutes(routes)}\n`);
    return specFileHeader + specFileContent;
}

export function getRelativeImport(entryFileName: string, outputFileName: string) {
    const entryTsName = parse(entryFileName).name;
    const relativePath = './' + relative(dirname(outputFileName), dirname(entryFileName));
    const relativeimport = relativePath.endsWith('/') ? `${relativePath}${entryTsName}` : `${relativePath}/${entryTsName}`;
    return relativeimport;
}

function getPublicMethodsAndRoutes(routesList: PublicApi<any>[], exportNames: string[]) {
    const publicMethods: PublicMethodsSpec = {};
    const routes: RoutesSpec = {};
    exportNames.forEach((name, i) => {
        const routeSpec = {};
        const publicMethodsSpec = recursiveSetHandlerTypeAndCreateRouteExecutables(routesList[i], name, [], routeSpec);
        publicMethods[name] = publicMethodsSpec;
        routes[name] = routeSpec;
    });
    return {publicMethods, routes};
}

function recursiveSetHandlerTypeAndCreateRouteExecutables(
    methods: PublicApi<any>,
    exportName: string,
    currentPointer: string[],
    routeExecutables: AnyObject
): PublicApi<any> {
    const newRoutes: PublicApi<any> = {};
    Object.entries(methods).forEach(([key, item]) => {
        if (!item) return;
        const newPointer = [...currentPointer, key];
        if (hasChildRoutes(item)) {
            newRoutes[key] = recursiveSetHandlerTypeAndCreateRouteExecutables(item, exportName, newPointer, routeExecutables);
        } else {
            if (item.type === ProcedureType.route) {
                setRemoteMethods(item, newPointer, exportName, routeExecutables);
            }
            newRoutes[key] = {
                ...item,
                //this is a string
                handler: setCodeAsJsonString(`fakeHandler as any as typeof ${exportName}.${item.handler}._handler`) as any,
            };
        }
    });
    return newRoutes;
}

function serializePublicMethods(publicMethods: PublicMethodsSpec) {
    return (
        `\n// public methods specification (hooks and routes)\n` +
        `export const ${PUBLIC_METHODS_SPEC_EXPORT_NAME} = ${JSON.stringify(publicMethods)};`
    );
}

function serializeRoutes(routes: RoutesSpec) {
    // indentation added so routes can be read more easily
    return (
        `\n// routes specification, each route is a list of public methods that gets executed in order\n` +
        ` export const ${ROUTES_SPEC_EXPORT_NAME} = ${JSON.stringify(routes, null, 2)};`
    );
}

function setRemoteMethods(method: PublicProcedure, currentPointer: string[], exportName: string, routeExecutables: AnyObject) {
    const MethodPointers = method.pathPointers?.map((pointer) =>
        setCodeAsJsonString(`${PUBLIC_METHODS_SPEC_EXPORT_NAME}.${exportName}.${getHandlerSrcCodePointer(pointer)}`)
    );
    assignProperty(routeExecutables, currentPointer, MethodPointers);
}

function getHandlerSrcCodePointer(pointer: string[]) {
    return pointer.join('.');
}

function assignProperty(obj: AnyObject, pointer: string[], value: any) {
    let current = obj;
    pointer.forEach((key, i) => {
        if (i === pointer.length - 1) {
            current[key] = value;
        } else if (!current[key]) {
            current[key] = {};
        }
        current = current[key] as AnyObject;
    });
}

// This does not support src code containing scaped double quotes, multiple lines etc, very simple statements only;
const codeWrapper = `#@>${randomUUID()}<@#`;
const setCodeAsJsonString = (code: string) => `${codeWrapper}${code}${codeWrapper}`;
const jsonStringsToCode = (srcFile: string) => srcFile.replaceAll(`"${codeWrapper}`, '').replaceAll(`${codeWrapper}"`, '');

/** Runs a js program in node */
export function runChildNode(jsCode: string, cwd: string) {
    spawn.sync('node', ['-e', jsCode], {cwd, stdio: 'inherit'});
}

/**
 * Formats src code using prettier
 * @param srcCode
 * @param opts
 * @returns
 */
export async function formatCode(srcCode: string, opts?: PrettierOptions) {
    const prettierOpts = {
        ...DEFAULT_PRETTIER_OPTIONS,
        ...opts,
    };
    return format(srcCode, prettierOpts);
}
