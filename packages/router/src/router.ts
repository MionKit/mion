/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {join} from 'path';
import {DEFAULT_EXECUTABLE, DEFAULT_ROUTE, DEFAULT_ROUTE_OPTIONS, MAX_ROUTE_NESTING} from './constants';
import {
    Executable,
    Handler,
    Hook,
    isExecutable,
    isHandler,
    isHook,
    isRoute,
    isRoutes,
    Route,
    RouteObject,
    RouterOptions,
    Routes,
    RoutesWithId,
    Context,
    MapObj,
    MkRequest,
    MkResponse,
    JsonParser,
    MkError,
} from './types';
import {StatusCodes} from 'http-status-codes';
import {stringify} from 'querystring';
type RouterKeyEntryList = [string, Routes | Hook | Route][];

// ############# PUBLIC METHODS #############

export const addRoutes = (routes: Routes, opts?: RouterOptions) => {
    recursiveFlatRoutes(routes, getDefaultRouterOptions(opts));
};
export const getRouteExecutionPath = (path: string) => flatRouter.get(path);
export const getEntries = () => flatRouter.entries();
export const geSize = () => flatRouter.size;
export const getRouteExecutable = (path: string) => routesByPath.get(path);
export const getHookExecutable = (fieldName: string) => hooksByFieldName.get(fieldName);
export const geHooksSize = () => hooksByFieldName.size;
export const getComplexity = () => complexity;
export const setJsonParser = (parser: JsonParser) => (json = parser);
export const reset = () => {
    flatRouter.clear();
    hooksByFieldName.clear();
    routesByPath.clear();
    hookNames.clear();
    routeNames.clear();
    complexity = 0;
    appContext = null;
};

/**
 * Initializes the static app context.
 * @param app
 */
export const setContext = <AppContext extends MapObj>(app: AppContext) => {
    if (appContext) throw 'Context has been already defined';
    appContext = app;
};

export const run = async <ServerlessReq extends MkRequest, ServerlessResp extends MkResponse, ServerlessCallContext>(
    path: string,
    req: ServerlessReq,
    resp: ServerlessResp,
    callContext?: ServerlessCallContext,
): Promise<any> => {
    if (!appContext) throw 'Context has not been defined';
    const executionPath = getRouteExecutionPath(path);
    if (!executionPath) return routeError(StatusCodes.NOT_FOUND, 'Route not found');

    const requestData = req.body ? JSON.stringify(req.body) : {};
    if (typeof requestData !== 'object') return routeError(StatusCodes.BAD_REQUEST, 'Invalid request body');

    const context: Context<typeof appContext, ServerlessReq, ServerlessResp, ServerlessCallContext> = {
        app: appContext, // static context
        req,
        resp,
        callContext,
        path,
        requestData,
        responseData: {},
        errors: [],
    };

    for (let i = 0; i < executionPath.length; i++) {
        const executor = executionPath[i];
        const params: any[] = requestData[executor.inputFieldName] || [];
        const totalRequiredParams = executor.handler.length <= 1 ? 0 : executor.handler.length - 1;
        // if (params.length !== totalRequiredParams)
        //     context.errors.push({
        //         statusCode: StatusCodes.BAD_REQUEST,
        //         message: `Request field ${executor.inputFieldName} requires ${totalRequiredParams} `,
        //     });
        try {
            const result = await executor.handler(context, ...params);
        } catch (e: any) {
            context.errors.push({
                code: e?.code,
                message: e?.message,
                ...e,
            });
        }

        resp;
    }
};

// ############# PRIVATE STATE #############

const flatRouter: Map<string, Executable[]> = new Map();
const hooksByFieldName: Map<string, Executable> = new Map();
const routesByPath: Map<string, Executable> = new Map();
const hookNames: Map<string, boolean> = new Map();
const routeNames: Map<string, boolean> = new Map();
let json: JsonParser = JSON;
let complexity = 0;
let appContext: MapObj | null = null;

// ############# PRIVATE METHODS #############

const recursiveFlatRoutes = (
    routes: Routes,
    opts: RouterOptions,
    currentPath = '',
    preHooks: Executable[] = [],
    postHooks: Executable[] = [],
    nestLevel = 0,
) => {
    if (nestLevel > MAX_ROUTE_NESTING) throw 'Too many nested routes, you can only nest routes ${MAX_ROUTE_NESTING} levels';

    const entries = Object.entries(routes);
    if (entries.length === 0) throw `Invalid route: ${currentPath || 'root Object'}. Can Not define empty routes`;

    let minus1Props: ReturnType<typeof getRouteEntryProperties> | null = null;
    entries.forEach(([key, item], index, array) => {
        // create the executable items
        const path = join(currentPath, `${key}`);
        let routeEntry: Executable | RoutesWithId;
        if (typeof key !== 'string' || !isNaN(key as any)) throw `Invalid route: ${path}. Numeric route names are not allowed`;

        if (isHook(item)) {
            routeEntry = getExecutableFromHook(item, path, nestLevel, key);
            const fieldName = routeEntry.outputFieldName;
            if (hookNames.has(fieldName))
                throw `Invalid hook: ${path}. Naming collision, the fieldName ${fieldName} has been already used`;
            hookNames.set(fieldName, true);
        } else if (isRoute(item)) {
            routeEntry = getExecutableFromRoute(item, path, nestLevel, opts);
            if (routeNames.has(routeEntry.path)) throw `Invalid route: ${path}. Naming collision, duplicated route`;
            routeNames.set(routeEntry.path, true);
        } else if (isRoutes(item)) {
            routeEntry = {
                path,
                routes: item,
            };
        } else {
            const itemType = typeof item;
            throw `Invalid route: ${path}. Type <${itemType}> is not a valid route.`;
        }

        // generates the routeExecutionPaths and recurse into sublevels
        minus1Props = recursiveCreateExecutionPath(
            routeEntry,
            opts,
            currentPath,
            preHooks,
            postHooks,
            nestLevel,
            index,
            array,
            minus1Props,
        );

        complexity++;
    });
};

const recursiveCreateExecutionPath = (
    routeEntry: Executable | RoutesWithId,
    opts: RouterOptions,
    currentPath: string,
    preHooks: Executable[],
    postHooks: Executable[],
    nestLevel: number,
    index: number,
    routeKeyedEntries: RouterKeyEntryList,
    minus1Props: ReturnType<typeof getRouteEntryProperties> | null,
) => {
    const minus1 = getEntry(index - 1, routeKeyedEntries);
    const plus1 = getEntry(index + 1, routeKeyedEntries);
    const props = getRouteEntryProperties(minus1, routeEntry, plus1);

    if (props.isBetweenRoutes && minus1Props) {
        props.preLevelHooks = minus1Props.preLevelHooks;
        props.postLevelHooks = minus1Props.postLevelHooks;
    } else {
        routeKeyedEntries.forEach(([k, entry], i, arr) => {
            complexity++;
            if (!isHook(entry)) return;
            const path = join(currentPath, `${k}`);
            const executable = getExecutableFromHook(entry, path, nestLevel, k);
            if (i < index) return props.preLevelHooks.push(executable);
            if (i > index) return props.postLevelHooks.push(executable);
        });
    }
    const isExec = isExecutable(routeEntry);

    if (isExec && props.isRoute) {
        const routeExecutionPath = [...preHooks, ...props.preLevelHooks, routeEntry, ...props.postLevelHooks, ...postHooks];
        flatRouter.set(routeEntry.path, routeExecutionPath);
    } else if (!isExec) {
        recursiveFlatRoutes(
            routeEntry.routes,
            opts,
            routeEntry.path,
            [...preHooks, ...props.preLevelHooks],
            [...props.postLevelHooks, ...postHooks],
            nestLevel + 1,
        );
    }

    return props;
};

const getHandler = (entry: Hook | Route, path): Handler => {
    const handler = isHandler(entry) ? entry : (entry as Hook).hook || (entry as RouteObject).route;
    if (!isHandler(handler)) throw `Invalid route: ${path}. Missing route handler`;
    return handler;
};

const getExecutableFromHook = (hook: Hook, path: string, nestLevel: number, key: string) => {
    const hookName = getHookFieldName(hook, key);
    const existing = hooksByFieldName.get(hookName);
    if (existing) {
        return existing;
    }
    const executable = {
        ...DEFAULT_EXECUTABLE,
        ...hook,
        path,
        nestLevel,
        inputFieldName: hookName,
        outputFieldName: hookName,
        isRoute: false,
        handler: getHandler(hook, path),
    };
    delete (executable as any).hook;
    hooksByFieldName.set(hookName, executable);
    return executable;
};

const getExecutableFromRoute = (route: Route, path: string, nestLevel: number, opts: RouterOptions) => {
    const routePath = join(opts.prefix, (route as RouteObject)?.path || path) + opts.suffix;
    const existing = routesByPath.get(path);
    if (existing) return existing;
    const handler = getHandler(route, path);
    const routeObj = isHandler(route) ? {...DEFAULT_ROUTE} : {...DEFAULT_ROUTE, ...route};
    const executable = {
        ...DEFAULT_EXECUTABLE,
        ...routeObj,
        path: routePath,
        isRoute: true,
        nestLevel,
        handler,
    };
    delete (executable as any).route;
    routesByPath.set(path, executable);
    return executable;
};

const getEntry = (index, keyEntryList: RouterKeyEntryList) => {
    return keyEntryList[index]?.[1];
};

const getRouteEntryProperties = (
    minus1: Routes | Hook | Route | undefined,
    zero: Executable | RoutesWithId,
    plus1: Routes | Hook | Route | undefined,
) => {
    const minus1IsRoute = minus1 && isRoute(minus1);
    const zeroIsRoute = !!(zero as Executable).isRoute;
    const plus1IsRoute = plus1 && isRoute(plus1);

    const isExec = isHandler((zero as Executable).handler);

    return {
        isBetweenRoutes: minus1IsRoute && zeroIsRoute && plus1IsRoute,
        isExecutable: isExec,
        isRoute: zeroIsRoute,
        preLevelHooks: [] as Executable[],
        postLevelHooks: [] as Executable[],
    };
};

const getDefaultRouterOptions = (opts?: RouterOptions) => {
    return {
        ...DEFAULT_ROUTE_OPTIONS,
        ...opts,
    };
};

const getHookFieldName = (item: Hook, key: string) => {
    return item?.fieldName || key;
};

const findDuplicates = (withDuplicated: string[]): string[] => {
    const duplicates: string[] = [];
    const times: {[keys: string]: number} = {};
    withDuplicated.forEach((key) => (times[key] = (times[key] ?? 0) + 1));
    Object.entries(times)
        .filter(([key, times]) => times > 1)
        .map(([key]) => key);
    return duplicates;
};

export const routeError = (statusCode: number, message: string): MkResponse => {
    return {
        statusCode,
        // prevent leaking any other fields from error
        body: json.stringify({
            errors: [
                {
                    statusCode,
                    message,
                },
            ],
        }),
    };
};

export const routeError2 = (err: MkError): MkResponse => {
    return {
        statusCode: err.statusCode,
        // prevent leaking any other fields from error
        body: json.stringify({
            errors: [
                {
                    statusCode: err.statusCode,
                    message: err.message,
                },
            ],
        }),
    };
};
