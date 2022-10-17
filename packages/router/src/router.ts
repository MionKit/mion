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
    SharedDataFactory,
} from './types';
import {StatusCodes} from 'http-status-codes';
import {getParamValidators} from './reflection';
import {Type, typeOf} from '@deepkit/type';
type RouterKeyEntryList = [string, Routes | Hook | Route][];

// ############# PUBLIC METHODS #############

export const addRoutes = (routes: Routes, opts?: RouterOptions) => {
    // TODO: Not sure if bellow code is required. using the wrong context type is a big fail and should be catch during dev
    // TODO: fix should be just to use correct context type
    // if (!contextType) throw 'Context needs to be defined before adding routes';
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
    _app = undefined;
    _sharedDataFactory = undefined;
    contextType = undefined;
};

/**
 * Initializes the static Call Context for the routes.
 * Returns Typed run function and Typed null context. these can be used to set the types for all routes.
 * @param app
 * @param handlersDataFactory
 * @returns Typed run function and Typed null context
 */
export const setCallContext = <
    App extends MapObj,
    SharedData extends MapObj,
    ServerReq extends MkRequest,
    ServerResp extends MkResponse,
>(
    app: App,
    handlersDataFactory?: SharedDataFactory<SharedData>,
) => {
    if (_app) throw 'Context has been already defined';
    type ResolveContext = Context<App, SharedData, ServerReq, ServerResp>;
    // type ResolvedRun = typeof run<ServerReq, ServerResp>;
    _app = app;
    _sharedDataFactory = handlersDataFactory;
    contextType = typeOf<ResolveContext>();
    const typedContext: ResolveContext = {} as any;
    // const runRoute: ResolvedRun = run;
    return {typedContext};
};

export const run = async <ServerReq extends MkRequest, ServerResp extends MkResponse>(
    path: string,
    req: ServerReq,
    resp: ServerResp,
): Promise<any> => {
    if (!_app) throw 'Context has not been defined';
    const executionPath = getRouteExecutionPath(path);
    if (!executionPath) return routeError(StatusCodes.NOT_FOUND, 'Route not found');

    const request = req.body ? JSON.stringify(req.body) : {};
    if (typeof request !== 'object') return routeError(StatusCodes.BAD_REQUEST, 'Invalid request body');

    const context: Context<MapObj, MapObj, ServerReq, ServerResp> = {
        app: _app, // static context
        server: {
            req,
            resp,
        },
        path,
        request,
        reply: {},
        errors: [],
        shared: _sharedDataFactory?.() || {},
    };

    for (let i = 0; i < executionPath.length; i++) {
        const executor = executionPath[i];
        const params: any[] = request[executor.inputFieldName] || [];
        // TODO: VALIDATE PARAMETERS
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
let _app: MapObj | undefined;
let _sharedDataFactory: SharedDataFactory<MapObj> | undefined;
let contextType: Type | undefined;

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
    const handler = getHandler(hook, path);
    // TODO: Not sure if bellow code is required. using the wrong context type is a big fail and should be catch during dev
    // TODO: fix should be just to use correct context type
    // if (!contextType) throw 'Context must be defined before creating routes.'; // this  should not happen
    // if (!isFirstParameterContext(contextType, handler) && false)
    //     throw `Invalid hook: ${path}. First parameter the handler must be of Type ${contextType.typeName},`;
    const executable = {
        ...DEFAULT_EXECUTABLE,
        ...hook,
        path,
        nestLevel,
        inputFieldName: hookName,
        outputFieldName: hookName,
        isRoute: false,
        handler,
        paramValidators: getParamValidators(handler),
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
    // TODO: Not sure if bellow code is required. using the wrong context type is a big fail and should be catch during dev
    // TODO: fix should be just to use correct context type
    // if (!contextType) throw 'Context must be defined before creating routes.'; // this  should not happen
    // if (!isFirstParameterContext(contextType, handler))
    //     throw `Invalid route: ${path}. First parameter the handler must be of Type ${contextType.typeName},`;
    const routeObj = isHandler(route) ? {...DEFAULT_ROUTE} : {...DEFAULT_ROUTE, ...route};
    const executable = {
        ...DEFAULT_EXECUTABLE,
        ...routeObj,
        path: routePath,
        isRoute: true,
        nestLevel,
        handler,
        paramValidators: getParamValidators(handler),
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

const routeError = (statusCode: number, message: string): MkResponse => {
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
