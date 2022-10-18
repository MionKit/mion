/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {join} from 'path';
import {
    DEFAULT_ROUTE,
    DEFAULT_ROUTE_OPTIONS,
    MAX_ROUTE_NESTING,
    ROUTE_INPUT_FIELD_NAME,
    ROUTE_OUTPUT_FIELD_NAME,
} from './constants';
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
    MkError,
} from './types';
import {StatusCodes} from 'http-status-codes';
import {getParamValidators, validateParams} from './reflection';
import {reflect, Type, typeOf} from '@deepkit/type';
type RouterKeyEntryList = [string, Routes | Hook | Route][];

// ############# PUBLIC METHODS #############

export const addRoutes = <RouteType extends Route = Route, HookType extends Hook = Hook>(routes: Routes) => {
    // TODO: Not sure if bellow code is required. using the wrong context type is a big fail and should be catch during dev
    // TODO: fix should be just to use correct context type
    // if (!contextType) throw 'Context needs to be defined before adding routes';
    recursiveFlatRoutes(routes);
};
export const getRouteExecutionPath = (path: string) => flatRouter.get(path);
export const getEntries = () => flatRouter.entries();
export const geSize = () => flatRouter.size;
export const getRouteExecutable = (path: string) => routesByPath.get(path);
export const getHookExecutable = (fieldName: string) => hooksByFieldName.get(fieldName);
export const geHooksSize = () => hooksByFieldName.size;
export const getComplexity = () => complexity;
export const setJsonParser = (parser: JsonParser) => (json = parser);
export const setRouterOptions = (routerOptions_?: Partial<RouterOptions>) =>
    (routerOptions = {
        ...routerOptions,
        ...routerOptions_,
    });
export const reset = () => {
    flatRouter.clear();
    hooksByFieldName.clear();
    routesByPath.clear();
    hookNames.clear();
    routeNames.clear();
    complexity = 0;
    app = undefined;
    sharedDataFactory = undefined;
    contextType = undefined;
};

/**
 * Initializes the Router.
 * @param app
 * @param handlersDataFactory
 * @param routerOptions
 */
export const initRouter = <
    App extends MapObj,
    SharedData,
    ServerReq extends MkRequest,
    ServerResp extends MkResponse,
    RouteType extends Route = Route,
    HookType extends Hook = Hook,
>(
    app_: App,
    handlersDataFactory_?: SharedDataFactory<SharedData>,
    routerOptions_?: Partial<RouterOptions>,
) => {
    if (app) throw 'Context has been already defined';
    app = app_;
    sharedDataFactory = handlersDataFactory_;
    setRouterOptions(routerOptions_);

    type ResolveContext = Context<App, SharedData, ServerReq, ServerResp, RouteType, HookType>;
    contextType = typeOf<ResolveContext>();
    // type ResolvedRun = typeof run<ServerReq, ServerResp, RouteType, HookType>;
    // const typedContext: ResolveContext = {} as any;
};

export const runRoute = async <
    ServerReq extends MkRequest,
    ServerResp extends MkResponse,
    RouteType extends Route = Route,
    HookType extends Hook = Hook,
>(
    path: string,
    req: ServerReq,
    resp: ServerResp,
): Promise<any> => {
    if (!app) throw 'Context has not been defined';

    const context: Context<MapObj, MapObj, ServerReq, ServerResp, RouteType, HookType> = {
        app: app, // static context
        server: {
            req,
            resp,
        },
        path,
        request: null as any,
        reply: {},
        errors: [],
        privateErrors: [],
        shared: sharedDataFactory?.() || {},
        src: null as any,
    };

    const executionPath = getRouteExecutionPath(path) || [];
    if (!executionPath.length) {
        const notFound = {statusCode: StatusCodes.NOT_FOUND, message: 'Route not found'};
        context.errors.push(notFound);
        context.privateErrors.push(notFound);
    } else {
        try {
            context.request = parseRequestBody(req);
        } catch (e: MkError | any) {
            context.errors.push(e);
            context.privateErrors.push(e);
        }
    }

    await runExecutionPath(executionPath, context);

    // TODO: SERIALIZE OUTPUT and add to context.reply
};

const parseRequestBody = (req: MkRequest) => {
    try {
        const request = req.body ? json.stringify(req.body) : {};
        if (typeof request !== 'object') throw 'invalid body type, only objects allowed';
        return request;
    } catch (e) {
        throw {statusCode: StatusCodes.BAD_REQUEST, message: 'Invalid request body'};
    }
};

const runExecutionPath = async <
    ServerReq extends MkRequest,
    ServerResp extends MkResponse,
    RouteType extends Route = Route,
    HookType extends Hook = Hook,
>(
    executionPath: Executable[],
    context: Context<MapObj, MapObj, ServerReq, ServerResp, RouteType, HookType>,
) => {
    if (executionPath.length && context.request) {
        for (let index = 0; index < executionPath.length; index++) {
            const executable = executionPath[index];
            const params: any[] = context.request[executable.inputFieldName] || [];
            if (routerOptions.enableValidation) {
                context.errors.push(...validateParams(executable, params, params));
            }
            if (context.errors.length && !executable.forceRunOnError) continue;
            try {
                const result = await executable.handler(context, ...params);
                if (executable.canReturnData) context.reply[executable.outputFieldName] = result;
            } catch (e: any | MkError | Error) {
                const executableOrUnknownError = {
                    statusCode: e.statusCode || StatusCodes.INTERNAL_SERVER_ERROR,
                    message:
                        e.message ||
                        `Unknown error in ${executable.isRoute ? executable.path : executable.inputFieldName} step ${index}`,
                };
                context.errors.push(executableOrUnknownError);
                context.privateErrors.push(e);
            }
        }
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
let app: MapObj | undefined;
let sharedDataFactory: SharedDataFactory<any> | undefined;
let contextType: Type | undefined;
let routerOptions = {
    ...DEFAULT_ROUTE_OPTIONS,
};

// ############# PRIVATE METHODS #############

const recursiveFlatRoutes = (
    routes: Routes,
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
            routeEntry = getExecutableFromRoute(item, path, nestLevel);
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
    const executable: Executable = {
        path,
        forceRunOnError: !!hook.forceRunOnError,
        canReturnData: !!hook.canReturnData,
        inHeader: !!hook.inHeader,
        nestLevel,
        inputFieldName: hookName,
        outputFieldName: hookName,
        isRoute: false,
        handler,
        paramValidators: getParamValidators(handler),
        src: hook,
    };
    delete (executable as any).hook;
    hooksByFieldName.set(hookName, executable);
    return executable;
};

const getExecutableFromRoute = (route: Route, path: string, nestLevel: number) => {
    const routePath = join(routerOptions.prefix, (route as RouteObject)?.path || path) + routerOptions.suffix;
    const existing = routesByPath.get(path);
    if (existing) return existing;
    const handler = getHandler(route, path);
    // TODO: Not sure if bellow code is required. using the wrong context type is a big fail and should be catch during dev
    // TODO: fix should be just to use correct context type
    // if (!contextType) throw 'Context must be defined before creating routes.'; // this  should not happen
    // if (!isFirstParameterContext(contextType, handler))
    //     throw `Invalid route: ${path}. First parameter the handler must be of Type ${contextType.typeName},`;
    const routeObj = isHandler(route) ? {...DEFAULT_ROUTE} : {...DEFAULT_ROUTE, ...route};
    const executable: Executable = {
        path: routePath,
        forceRunOnError: false,
        canReturnData: true,
        inHeader: false,
        inputFieldName: routeObj.inputFieldName,
        outputFieldName: routeObj.outputFieldName,
        isRoute: true,
        nestLevel,
        handler,
        paramValidators: getParamValidators(handler),
        src: routeObj,
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

const getHookFieldName = (item: Hook, key: string) => {
    return item?.fieldName || key;
};

const getRouteFieldName = (fieldName: string | undefined, key: string) => {
    return fieldName || key;
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
