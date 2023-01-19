/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {serializeType, TypeFunction} from '@deepkit/type';
import {writeFileSync} from 'fs';
import {resolve} from 'path';
import {
    getPrefillFunctionName,
    getRemoteExecutionPathSrcCode,
    getSourceCodeFromJson,
    getTsSourceCodeForExecutable,
} from './tsGenerator';
import {format} from 'prettier';
import {DEFAULT_PRETTIER_OPTIONS} from './constants';
import {parametersToSrcCode, returnToSrcCode} from './specReflection';
import {addRoutes, getRouteEntries, getRouterOptions, setRouterOptions} from '@mikrokit/router';
import type {RemoteExecutable} from '@mikrokit/client';
import type {RouterOptions, Routes, Executable} from '@mikrokit/router';
import type {ApiSpec, ClientData, GenerateClientOptions, ExecutableSourceCode, ApiSpecReferences} from './types';

const apiSpec: ApiSpec = {};
const apiSpecReferences: ApiSpecReferences = {};
const api = {};
let prefillData = {};
let hooksSpec: ApiSpecReferences = {};
const sanitizedPathNames: Map<string, string> = new Map();
const clientDataByPath: Map<string, ClientData> = new Map();
const remoteExecutablesByPath: Map<string, RemoteExecutable> = new Map();
const clientHooksByFieldName: Map<string, ClientData> = new Map();
const clientRoutesByPath: Map<string, ClientData> = new Map();
const hooksSourceCodeByFieldName: Map<string, ExecutableSourceCode> = new Map();
const routesSourceCodeByPath: Map<string, ExecutableSourceCode> = new Map();
let generateClientOptions: GenerateClientOptions;

export const getClientHookByFieldName = (fieldName: string) => clientHooksByFieldName.get(fieldName);
export const getClientRouteByPathName = (pathName: string) => clientRoutesByPath.get(pathName);
export const getGenerateClientOptions = () => generateClientOptions;
export const getApiSpec = () => apiSpec;

export const addClientRoutes = (
    routes: Routes,
    generateClientOptions_: GenerateClientOptions,
    routerOptions_: Partial<RouterOptions> = {}
) => {
    generateClientOptions = {
        prettierOptions: {
            ...DEFAULT_PRETTIER_OPTIONS,
        },
        ...generateClientOptions_,
    };
    setRouterOptions({
        ...routerOptions_,
    });
    addRoutes(routes);
    addRoutesApiSpec();
    assignHooks();
    createTsClientFile();
};

const addRoutesApiSpec = () => {
    const remoteApi = getRouteEntries();
    for (const [path, executionPath] of remoteApi) {
        const {sanitizedPathComponents, sanitizedPathName} = getSanitizedPath(path, true);
        const existingPath = sanitizedPathNames.get(sanitizedPathName);
        if (existingPath)
            throw new Error(
                `Can't generate client, there is a name collision between the paths "${existingPath}" and "${path}", both of them gets sanitized to the same client path "${sanitizedPathName}".`
            );
        sanitizedPathNames.set(sanitizedPathName, path);

        const remoteRoutes = executionPath.filter((exec) => exec.canReturnData || exec.paramValidators.length > 0);
        const remoteExecutionPath = remoteRoutes.map((exec) =>
            exec.isRoute ? getClientRoute(exec, sanitizedPathComponents) : getClientHook(exec, sanitizedPathComponents)
        );

        // generates the source code so is available later when creating apiSpecs and others
        remoteExecutionPath.forEach((exec) =>
            exec.isRoute ? getRouteSourceCode(exec, remoteExecutionPath) : getHookSourceCode(exec)
        );

        const routeExecutable = clientRoutesByPath.get(path);
        if (!routeExecutable) throw new Error(`Error generating client, can't find RemoteExecutable for path ${path}`);

        assignExecutionPath(sanitizedPathComponents, routeExecutable, remoteExecutionPath);
    }
};

const getClientHook = (exec: Executable, pathComponents: string[]): ClientData => {
    const fieldName = exec.fieldName;
    const clientHook = clientHooksByFieldName.get(fieldName);
    if (clientHook) return clientHook;
    const newClientHook = getRemoteExecutable(exec, pathComponents);
    clientHooksByFieldName.set(fieldName, newClientHook);
    return newClientHook;
};

const getHookSourceCode = (exec: ClientData): ExecutableSourceCode => {
    const fieldName = exec.fieldName;
    const hookSrcCode = hooksSourceCodeByFieldName.get(fieldName);
    if (hookSrcCode) return hookSrcCode;
    const newHookSrcCode = getTsSourceCodeForExecutable(exec);
    hooksSourceCodeByFieldName.set(fieldName, newHookSrcCode);
    return newHookSrcCode;
};

const getClientRoute = (exec: Executable, pathComponents: string[]) => {
    const path = exec.path;
    const clientRoute = clientRoutesByPath.get(path);
    if (clientRoute) return clientRoute;
    const newClientRoute = getRemoteExecutable(exec, pathComponents);
    clientRoutesByPath.set(path, newClientRoute);
    return newClientRoute;
};

const getRouteSourceCode = (exec: ClientData, remoteExecutionPath: ClientData[]): ExecutableSourceCode => {
    const path = exec.path;
    const routeSrcCode = routesSourceCodeByPath.get(path);
    if (routeSrcCode) return routeSrcCode;
    const newRouteSrcCode = getTsSourceCodeForExecutable(exec, remoteExecutionPath);
    routesSourceCodeByPath.set(path, newRouteSrcCode);
    return newRouteSrcCode;
};

const getRemoteExecutable = (exec: Executable, pathComponents: string[]): ClientData => {
    const isRoute = exec.isRoute;

    const pathKeys = isRoute ? pathComponents : getSanitizedPath(exec.fieldName, exec.isRoute).sanitizedPathComponents;
    const camelCaseName = pathKeys.map((n) => capitalize(n)).join('');
    const existingRemoteExecutable = clientDataByPath.get(camelCaseName);
    if (existingRemoteExecutable) return existingRemoteExecutable;

    const serializedHandler = serializeType(exec.handlerType);

    const newRemoteExecutable = {
        nestLevel: exec.nestLevel,
        path: exec.path,
        forceRunOnError: exec.forceRunOnError,
        canReturnData: exec.canReturnData,
        inHeader: exec.inHeader,
        fieldName: exec.fieldName,
        isRoute: exec.isRoute,
        isAsync: exec.isAsync,
        enableValidation: exec.enableValidation,
        enableSerialization: exec.enableSerialization,
        handlerPointer: exec.handlerPointer,
        serializedHandler,
        clientData: {
            camelCaseName,
            pathComponents: pathKeys,
            paramNames: exec.handlerType.parameters.map((type) => type.name).slice(1), // removes the context
            paramTypesAsSrcCode: parametersToSrcCode(exec.fieldName, exec.handler, exec.handlerType),
            returnTypeAsSrcCode: returnToSrcCode(exec.fieldName, exec.handler, exec.handlerType),
        },
    };
    clientDataByPath.set(camelCaseName, newRemoteExecutable);
    return newRemoteExecutable;
};

const getSanitizedPath = (path: string, isRoute: boolean) => {
    const noSuffix = isRoute ? removePathPrefixAndSuffix(path) : path;
    const sanitizedPathComponents = noSuffix
        .split('/')
        .map((propName) => propName.replace(/\W/g, '_'))
        .filter((propName) => !!propName); // removes empty components
    const sanitizedPathName = sanitizedPathComponents.join('/');
    return {sanitizedPathComponents, sanitizedPathName};
};

const assignExecutionPath = (sanitizedPathComponents: string[], exec: ClientData, remoteExecutionPath?: ClientData[]) => {
    const isRoute = exec.isRoute;

    let currentApiSpecObject = apiSpec;
    let currentExecutableReferencesApiSpecObject = apiSpecReferences;
    let currentApiObject = api;
    let currentPrefillRouteDef = prefillData;
    sanitizedPathComponents.forEach((pathComponent, index) => {
        if (!pathComponent) return;
        const isLast = index === sanitizedPathComponents.length - 1;
        if (isLast) {
            let routeSrcCode: ExecutableSourceCode;
            if (isRoute) {
                if (!remoteExecutionPath)
                    throw new Error('remoteExecutionPath must be defined when creating source code for a route');
                routeSrcCode = getRouteSourceCode(exec, remoteExecutionPath);
            } else {
                routeSrcCode = getHookSourceCode(exec);
            }
            if (!currentApiSpecObject[pathComponent] && remoteExecutionPath) {
                currentApiSpecObject[pathComponent] = getSerializableRemoteExecutionPath(remoteExecutionPath);
                currentExecutableReferencesApiSpecObject[pathComponent] = `ΔΔ#${getRemoteExecutionPathSrcCode(
                    remoteExecutionPath,
                    'remoteExecutables'
                )}#ΔΔ`;
            }

            /* 'ΔΔ#${xyz}#ΔΔ' string will be replaced by the reference to the remote call and prefill functions
             * after the api is converted to json, so the end result is an object with the references to the functions */
            if (!currentApiObject[pathComponent]) currentApiObject[pathComponent] = `ΔΔ#${routeSrcCode.remoteFunctionName}#ΔΔ`;
            if (!currentPrefillRouteDef[pathComponent] && exec.clientData.paramNames.length)
                currentPrefillRouteDef[pathComponent] = `ΔΔ#${routeSrcCode.prefillFunctionName}#ΔΔ`;
        } else if (!isLast && !currentApiSpecObject[pathComponent]) {
            currentApiSpecObject[pathComponent] = {};
            currentApiObject[pathComponent] = {};
            currentPrefillRouteDef[pathComponent] = {};
            currentExecutableReferencesApiSpecObject[pathComponent] = {};
        }
        currentApiSpecObject = currentApiSpecObject[pathComponent] as ApiSpec;
        currentApiObject = currentApiObject[pathComponent];
        currentPrefillRouteDef = currentPrefillRouteDef[pathComponent];
        currentExecutableReferencesApiSpecObject = currentExecutableReferencesApiSpecObject[pathComponent] as any;
    });
};

const getSerializableRemoteExecutionPath = (remoteExecutionPath: ClientData[]): RemoteExecutable[] => {
    return remoteExecutionPath.map((exec) => getSerializableRemoteExecutable(exec));
};

const getSerializableRemoteExecutable = (exec: ClientData): RemoteExecutable => {
    const SRE = remoteExecutablesByPath.get(exec.clientData.camelCaseName);
    if (SRE) return SRE;
    const NSRE = {...exec, clientData: undefined};
    remoteExecutablesByPath.set(exec.clientData.camelCaseName, NSRE);
    return NSRE;
};

const removePathPrefixAndSuffix = (path: string): string => {
    const prefix = getRouterOptions().prefix || '';
    const suffix = getRouterOptions().suffix || '';
    let finalPath = path;
    if (prefix.length) finalPath = finalPath.substring(prefix.length + 1);
    if (suffix.length) finalPath = finalPath.substring(0, finalPath.length - suffix.length);
    return finalPath;
};

const capitalize = (string) => string.charAt(0).toUpperCase() + string.slice(1);

const assignHooks = () => {
    const prefillHooks = Object.fromEntries(
        Array.from(clientHooksByFieldName)
            .filter(([key, exec]) => !!exec.clientData.paramNames.length)
            .map(([key, exec]) => [key, `ΔΔ#${getPrefillFunctionName(exec)}#ΔΔ`])
    );
    prefillData = {
        ...prefillData,
        ...prefillHooks,
    };

    const hooksExecutableReferences = Object.fromEntries(
        Array.from(clientHooksByFieldName)
            .filter(([key, exec]) => !!exec.clientData.paramNames.length || exec.canReturnData)
            .map(([key, exec]) => [key, `ΔΔ#remoteExecutables.${exec.clientData.camelCaseName}#ΔΔ`])
    );

    hooksSpec = {
        ...hooksSpec,
        ...hooksExecutableReferences,
    };
};

const createTsClientFile = () => {
    const importsTemplate = `
        /* ########
        * THIS FILE IS AUTOMATICALLY GENERATED BY THE MIKROKIT CLIENT GENERATOR
        * !!! DO NOT MODIFY !!!
        * @link https://github.com/MikroKit/MikroKit
        * ######## */
        import {MkClient, RemoteHandler, RemoteParams, RemotePrefill, RemoteReturn} from '@mikrokit/client';
        ${generateClientOptions.routesImport};

    `;

    const hooksSourceCode = Array.from(hooksSourceCodeByFieldName)
        .map(([fieldName, execSrcCode]) => execSrcCode.sourceCode)
        .join('\n');

    const routesSourceCode = Array.from(routesSourceCodeByPath)
        .map(([fieldName, execSrcCode]) => execSrcCode.sourceCode)
        .join('\n');

    const executablesCode = getSourceCodeFromJson(
        JSON.stringify(Object.fromEntries(remoteExecutablesByPath.entries())),
        'remoteExecutables',
        false
    );
    const apiSpecSrcCode = getSourceCodeFromJson(JSON.stringify(apiSpecReferences), 'apiSpec', true);
    const hooksSpecSrcCode = getSourceCodeFromJson(JSON.stringify(hooksSpec), 'hooksSpec', true);
    const apiSrcCode = getSourceCodeFromJson(JSON.stringify(api), 'api', true);
    const prefillSrcCode = getSourceCodeFromJson(JSON.stringify(prefillData), 'prefillData', true);

    const tsFile =
        importsTemplate +
        hooksSourceCode +
        routesSourceCode +
        executablesCode +
        apiSpecSrcCode +
        hooksSpecSrcCode +
        apiSrcCode +
        prefillSrcCode;

    const fileName = resolve(generateClientOptions.outputFileName);
    const prettified = format(tsFile, generateClientOptions.prettierOptions);
    writeFileSync(fileName, prettified);
};

/**
 * TODO:
 *
 * At the moment we are just using typescript to reference data returned in the api
 * This could be improved using @deepkit/types to generate types src code from the types.
 * However it is hard to resolve references is if an User type is declared but is type is not exported there
 * is no way to restore the types from @deepkit/types info.
 * We still could create a type reqistry of any type that is not a primitive an try to use the same Name when creating a reference in typescript.
 *
 * ie:
 * Some users.getUser returns Promise<User>.
 * At the moment we just generate: type TUsersGetUserRemoteReturn = RemoteReturn<MyApiRoutes['users']['getUser']>;
 * Instead we could just add User to a registry and reuse whenever the User class is referenced:  type User = RemoteReturn<MyApiRoutes['users']['getUser']>;
 * Some steps are done towards it in the specReflection.ts file but still needs work.
 *
 * The main advantage for all this work would be better autocompletion and cleaner generated code, but everything is working now as it should.
 *  */
