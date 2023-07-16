/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {join} from 'path';
import {
    DEFAULT_ROUTE,
    DEFAULT_ROUTE_OPTIONS,
    DEFAULT_SERIALIZATION_OPTIONS,
    MAX_ROUTE_NESTING,
    ROUTE_PATH_ROOT,
} from './constants';
import {
    Executable,
    isExecutable,
    isHandler,
    isHookDef,
    isRoute,
    isRoutes,
    Route,
    RouteDef,
    RouterOptions,
    Routes,
    RouteExecutable,
    HookExecutable,
    PublicMethods,
    ExecutableMicroTask,
    FullRouterOptions,
    SerializationOptions,
    InternalHookExecutable,
    isInternalHook,
} from './types';
import {FunctionReflection, getFunctionReflectionMethods} from '@mionkit/runtype';
import {
    Obj,
    RawServerCallContext,
    SharedDataFactory,
    Response,
    StatusCodes,
    RouteError,
    getPublicErrorFromRouteError,
    updateGlobalOptions,
    getGlobalOptions,
    resetGlobalOptions,
    CoreOptions,
    addDefaultGlobalOptions,
} from '@mionkit/core';
import {BodyParserOptions, Handler, HookDef, InternalHookDef, InternalHooksCollection, mionHooks} from '@mionkit/hooks';

type RouterKeyEntryList = [string, Routes | HookDef | Route][];
type RouteEntryProperties = ReturnType<typeof getRouteEntryProperties>;
type RoutesWithId = {
    pathPointer: string[];
    routes: Routes;
};

// ############# PRIVATE STATE #############

const flatRouter: Map<string, Executable[]> = new Map(); // Main Router
const hooksByFieldName: Map<string, Executable> = new Map();
const routesByPath: Map<string, Executable> = new Map();
const hookNames: Map<string, boolean> = new Map();
const routeNames: Map<string, boolean> = new Map();
let complexity = 0;
let app: Obj | undefined;
let sharedDataFactoryFunction: SharedDataFactory<any> | undefined;
/** Global hooks to be run before any other hooks or routes set using `registerRoutes` */
let startHooks: Executable[] = [];
let startHooksDef: InternalHooksCollection = {};
/** Global hooks to be run after any other hooks or routes set using `registerRoutes` */
let endHooks: Executable[] = [];
let endHooksDef: InternalHooksCollection = {};
/** functions to be run before every executable. i.e: validation, serialization. */
let preExecutableMicroTasks: ExecutableMicroTask[] = [];
let postExecutableMicroTasks: ExecutableMicroTask[] = [];

let notFoundExecutionPath: Executable[] | undefined;

addDefaultGlobalOptions<RouterOptions>(DEFAULT_ROUTE_OPTIONS);
addDefaultGlobalOptions<SerializationOptions>(DEFAULT_SERIALIZATION_OPTIONS);

// ############# PUBLIC METHODS #############

export const getRouteEntries = () => flatRouter.entries();
export const geRoutesSize = () => flatRouter.size;
export const getRouteExecutable = (path: string) => routesByPath.get(path);
export const getHookExecutable = (fieldName: string) => hooksByFieldName.get(fieldName);
export const geHooksSize = () => hooksByFieldName.size;
export const getComplexity = () => complexity;
export const getSharedDataFactory = () => sharedDataFactoryFunction;
export const getApp = (): Readonly<typeof app> => app;

/**
 * Initializes the Router.
 * @param application
 * @param sharedDataFactory a factory function that returns an object to be shared in the `callContext.shared`
 * @param routerOptions
 * @returns
 */
export async function initRouter<App extends Obj, SharedData, RawContext extends RawServerCallContext = RawServerCallContext>(
    application: App,
    sharedDataFactory?: SharedDataFactory<SharedData>,
    routerOptions?: Partial<FullRouterOptions<RawContext>>
) {
    if (app) throw new Error('Router already initialized');
    app = application;
    sharedDataFactoryFunction = sharedDataFactory;
    updateGlobalOptions<FullRouterOptions>(routerOptions);
    addStartHooks({mionParseJsonRequestBodyHook: mionHooks.mionParseJsonRequestBodyHook});
    addEndHooks({mionStringifyJsonResponseBodyHook: mionHooks.mionStringifyJsonResponseBodyHook});
}

export function registerRoutes<R extends Routes>(routes: R): PublicMethods<R> {
    if (!app) throw new Error('Router has not been initialized yet');
    setStartAndEndInternalExecutables();
    recursiveFlatRoutes(routes);
    // we only want to get information about the routes when creating api spec
    const {getPublicRoutesData} = getGlobalOptions<RouterOptions>();
    if (getPublicRoutesData || process.env.GENERATE_ROUTER_SPEC === 'true') {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const {getPublicRoutes} = require('./publicMethods');
        return getPublicRoutes(routes) as PublicMethods<R>;
    }
    return {} as PublicMethods<R>;
}

/** reset utility, mainly used for testing, should not be used in prod  */
export function resetRouter() {
    flatRouter.clear();
    hooksByFieldName.clear();
    routesByPath.clear();
    hookNames.clear();
    routeNames.clear();
    complexity = 0;
    app = undefined;
    startHooks = [];
    endHooks = [];
    startHooksDef = {};
    endHooksDef = {};
    sharedDataFactoryFunction = undefined;
    resetGlobalOptions();
}

export function getRouteExecutionPath(path: string) {
    return flatRouter.get(path);
}

export function getNotFoundExecutionPath(): Executable[] {
    if (notFoundExecutionPath) return notFoundExecutionPath;
    const hookName = 'mion404NotfoundHook';
    const notFoundHandlerExecutable = getExecutableFromHook(mionHooks.mion404Hook, [hookName], 0, hookName);
    notFoundExecutionPath = [...startHooks, notFoundHandlerExecutable, ...endHooks];
    return notFoundExecutionPath;
}

export function getRoutePathFromPointer(route: Route, pointer: string[]) {
    return getRoutePath(route, join(...pointer));
}

export function getRoutePath(route: Route, path: string) {
    const routerOptions = getGlobalOptions<RouterOptions>();
    const routePath = join(ROUTE_PATH_ROOT, routerOptions.prefix, (route as RouteDef)?.path || path);
    return routerOptions.suffix ? routePath + routerOptions.suffix : routePath;
}

export function getHookFieldName(item: HookDef, key: string) {
    return item?.fieldName || key;
}

export function getRouteDefaultParams(): string[] {
    const routerOptions = getGlobalOptions<CoreOptions>();
    if (!routerOptions.useAsyncCallContext) {
        return ['app', 'context'];
    }
    return [];
}

/** Add hooks at the start af the execution path, adds them before any other existing start hooks by default */
export function addStartHooks(hooksDef: InternalHooksCollection, appendBeforeExisting = true) {
    if (flatRouter.size) throw new Error('Can not add start hooks after the router has been initialized');
    if (appendBeforeExisting) {
        startHooksDef = {...hooksDef, ...startHooksDef};
        return;
    }
    startHooksDef = {...startHooksDef, ...hooksDef};
}

/** Add hooks at the end af the execution path, adds them after any other existing end hooks by default */
export function addEndHooks(hooksDef: InternalHooksCollection, prependAfterExisting = true) {
    if (flatRouter.size) throw new Error('Can not add end hooks after the router has been initialized');
    if (prependAfterExisting) {
        endHooksDef = {...endHooksDef, ...hooksDef};
        return;
    }
    endHooksDef = {...hooksDef, ...endHooksDef};
}

export function addPreExecutableMicroTasks(microTasks: ExecutableMicroTask[], appendBeforeExisting = false) {
    if (flatRouter.size) throw new Error('Can not add pre-executable micro tasks after the router has been initialized');
    if (appendBeforeExisting) {
        preExecutableMicroTasks = [...microTasks, ...preExecutableMicroTasks];
        return;
    }
    preExecutableMicroTasks = [...preExecutableMicroTasks, ...microTasks];
}

export function addPostExecutableMicroTasks(microTasks: ExecutableMicroTask[], prependAfterExisting = false) {
    if (flatRouter.size) throw new Error('Can not add post-executable micro tasks after the router has been initialized');
    if (prependAfterExisting) {
        postExecutableMicroTasks = [...postExecutableMicroTasks, ...microTasks];
        return;
    }
    postExecutableMicroTasks = [...microTasks, ...postExecutableMicroTasks];
}

/**
 * This is a function to be called from outside the router.
 * Whenever there is an error outside the router, this function should be called.
 * So error keep the same format as when they were generated inside the router.
 * This also stringifies public errors into response.json.
 * @param routeResponse
 * @param originalError
 */
export const generateRouteResponseFromOutsideError = (
    originalError: any,
    statusCode: StatusCodes = StatusCodes.INTERNAL_SERVER_ERROR,
    publicMessage = 'Internal Error'
): Response => {
    const routerOptions = getGlobalOptions<BodyParserOptions>();
    const error = new RouteError({
        statusCode,
        publicMessage,
        originalError,
    });
    const publicErrors = [getPublicErrorFromRouteError(error)];
    return {
        statusCode,
        publicErrors,
        headers: {},
        body: {},
        json: routerOptions.bodyParser.stringify(publicErrors),
    };
};

// ############# PRIVATE METHODS #############

/**
 * Optimized algorithm to flatten the routes object into a list of Executable objects.
 * @param routes
 * @param currentPointer current pointer in the routes object i.e. ['users', 'get']
 * @param preHooks hooks one level up preceding current pointer
 * @param postHooks hooks one level up  following the current pointer
 * @param nestLevel
 *
 * TODO: this is working and is efficient is difficult to understand, we might look into refactoring it.
 */
function recursiveFlatRoutes(
    routes: Routes,
    currentPointer: string[] = [],
    preHooks: Executable[] = [],
    postHooks: Executable[] = [],
    nestLevel = 0
) {
    if (nestLevel > MAX_ROUTE_NESTING)
        throw new Error('Too many nested routes, you can only nest routes ${MAX_ROUTE_NESTING} levels');

    const entries = Object.entries(routes);
    // by default there will be at least one entry, the 404 route
    if (entries.length === 0)
        throw new Error(`Invalid route: ${currentPointer.length ? join(...currentPointer) : '*'}. Can Notregister empty routes`);

    let previousRouteProperties: RouteEntryProperties | null = null;
    entries.forEach(([key, item], index, array) => {
        // create the executable items
        const newPointer = [...currentPointer, key];
        let routeEntry: Executable | RoutesWithId;
        if (typeof key !== 'string' || !isNaN(key as any))
            throw new Error(`Invalid route: ${join(...newPointer)}. Numeric route names are not allowed`);

        // generates a hook
        if (isHookDef(item)) {
            routeEntry = getExecutableFromHook(item, newPointer, nestLevel, key);
            const fieldName = routeEntry.fieldName;
            if (hookNames.has(fieldName))
                throw new Error(
                    `Invalid hook: ${join(
                        ...newPointer
                    )}. Naming collision, the fieldName '${fieldName}' has been used in more than one hook/route.`
                );
            hookNames.set(fieldName, true);
        }
        // generates a route
        else if (isRoute(item)) {
            routeEntry = getExecutableFromRoute(item, newPointer, nestLevel);
            if (routeNames.has(routeEntry.path))
                throw new Error(`Invalid route: ${join(...newPointer)}. Naming collision, duplicated route`);
            routeNames.set(routeEntry.path, true);
        }
        // generates structure required to go one level down
        else if (isRoutes(item)) {
            routeEntry = {
                pathPointer: newPointer,
                routes: item,
            };
        }
        // throws an error if the route is invalid
        else {
            const itemType = typeof item;
            throw new Error(`Invalid route: ${join(...newPointer)}. Type <${itemType}> is not a valid route.`);
        }

        // recurse into sublevels
        const currentRouteProperties = recursiveCreateExecutionPath(
            routeEntry,
            newPointer,
            preHooks,
            postHooks,
            nestLevel,
            index,
            array,
            previousRouteProperties
        );

        complexity++;
        previousRouteProperties = currentRouteProperties;
    });
}

/** Optimize the creation of execution paths, by ignoring hooks when there are adjacent routes.  */
function recursiveCreateExecutionPath(
    routeEntry: Executable | RoutesWithId,
    currentPointer: string[],
    preHooks: Executable[],
    postHooks: Executable[],
    nestLevel: number,
    index: number,
    routeKeyedEntries: RouterKeyEntryList,
    previousRouteProperties: RouteEntryProperties | null
) {
    const minus1 = getEntry(index - 1, routeKeyedEntries);
    const plus1 = getEntry(index + 1, routeKeyedEntries);
    const props = getRouteEntryProperties(minus1, routeEntry, plus1);

    if (props.isBetweenRoutes && previousRouteProperties) {
        props.preLevelHooks = previousRouteProperties.preLevelHooks;
        props.postLevelHooks = previousRouteProperties.postLevelHooks;
    } else {
        routeKeyedEntries.forEach(([k, entry], i) => {
            complexity++;
            if (!isHookDef(entry)) return;
            const newPointer = [...currentPointer.slice(0, -1), k];
            const executable = getExecutableFromHook(entry, newPointer, nestLevel, k);
            if (i < index) return props.preLevelHooks.push(executable);
            if (i > index) return props.postLevelHooks.push(executable);
        });
    }
    const isExec = isExecutable(routeEntry);

    if (isExec && props.isRoute) {
        const routeExecutionPath = [
            ...startHooks,
            ...preHooks,
            ...props.preLevelHooks,
            routeEntry,
            ...props.postLevelHooks,
            ...postHooks,
            ...endHooks,
        ];
        flatRouter.set(routeEntry.path, routeExecutionPath);
    } else if (!isExec) {
        recursiveFlatRoutes(
            routeEntry.routes,
            routeEntry.pathPointer,
            [...preHooks, ...props.preLevelHooks],
            [...props.postLevelHooks, ...postHooks],
            nestLevel + 1
        );
    }

    return props;
}

function getHandler(entry: HookDef | Route, pathPointer: string[]): Handler {
    const handler = isHandler(entry) ? entry : (entry as HookDef).hook || (entry as RouteDef).route;
    if (!isHandler(handler)) throw new Error(`Invalid route: ${join(...pathPointer)}. Missing route handler`);
    return handler;
}

function getExecutableFromHook(
    hook: HookDef | InternalHookDef,
    hookPointer: string[],
    nestLevel: number,
    key: string
): HookExecutable<Handler> | InternalHookExecutable {
    const hookName = isInternalHook(hook) ? key : getHookFieldName(hook, key);
    const existing = hooksByFieldName.get(hookName);
    if (existing) return existing as HookExecutable<Handler>;
    const executable = isInternalHook(hook)
        ? _getExecutableFromInternalHook(hook, hookPointer, nestLevel, hookName)
        : _getExecutableFromHook(hook, hookPointer, nestLevel, hookName);
    // this delete is not required at the moment but it will be if we want to add the ability to extend Routes or Hook definition objects
    delete (executable as any).hook;
    hooksByFieldName.set(hookName, executable);
    return executable;
}

function _getExecutableFromHook(
    hook: HookDef,
    hookPointer: string[],
    nestLevel: number,
    hookName: string
): HookExecutable<Handler> {
    const routerOptions = getGlobalOptions<FullRouterOptions>();
    const handler = getHandler(hook, hookPointer);
    if (!!hook.inHeader && handler.length > getRouteDefaultParams().length + 1) {
        throw new Error(
            `Invalid Hook: ${join(...hookPointer)}. In header hooks can only have a single parameter besides App and Context.`
        );
    }
    if (hookName === 'errors') {
        throw new Error(`Invalid Hook: ${join(...hookPointer)}. The 'errors' fieldName is reserver for the router.`);
    }

    const executable: HookExecutable<Handler> = {
        path: hookName,
        forceRunOnError: !!hook.forceRunOnError,
        canReturnData: !!hook.canReturnData,
        inHeader: !!hook.inHeader,
        nestLevel,
        fieldName: hookName,
        isRoute: false,
        isInternal: false,
        handler,
        reflection: getFunctionReflectionMethods(
            handler,
            routerOptions,
            getRouteDefaultParams().length,
            routerOptions.lazyLoadReflection
        ),
        enableValidation: hook.enableValidation ?? routerOptions.enableValidation,
        enableSerialization: hook.enableSerialization ?? routerOptions.enableSerialization,
        src: hook,
        selfPointer: hookPointer,
    };
    return executable;
}

function _getExecutableFromInternalHook(
    hook: InternalHookDef,
    hookPointer: string[],
    nestLevel: number,
    hookName: string
): InternalHookExecutable {
    const routerOptions = getGlobalOptions<FullRouterOptions>();
    const handler = hook.internalHook;

    const executable: InternalHookExecutable = {
        path: hookName,
        forceRunOnError: true,
        canReturnData: false,
        inHeader: false,
        nestLevel,
        fieldName: hookName,
        isRoute: false,
        isInternal: true,
        handler,
        reflection: getFakeInternalHookReflection(),
        enableValidation: false,
        enableSerialization: false,
        src: hook,
        selfPointer: hookPointer,
    };
    return executable;
}

function getExecutableFromRoute(route: Route, routePointer: string[], nestLevel: number): RouteExecutable<Handler> {
    const routePath = getRoutePathFromPointer(route, routePointer);
    const existing = routesByPath.get(routePath);
    if (existing) return existing as RouteExecutable<Handler>;
    const executable = _getExecutableFromRoute(route, routePointer, nestLevel, routePath);
    // this delete is not required at the moment but it will be if we want to add the ability to extend Routes or Hook definition objects
    delete (executable as any).route;
    routesByPath.set(routePath, executable);
    return executable;
}

function _getExecutableFromRoute(
    route: Route,
    routePointer: string[],
    nestLevel: number,
    routePath: string
): RouteExecutable<Handler> {
    const routerOptions = getGlobalOptions<FullRouterOptions>();
    const handler = getHandler(route, routePointer);
    const routeObj = isHandler(route) ? {...DEFAULT_ROUTE} : {...DEFAULT_ROUTE, ...route};
    const executable: RouteExecutable<Handler> = {
        path: routePath,
        forceRunOnError: false,
        canReturnData: true,
        inHeader: false,
        fieldName: routerOptions.routeFieldName ? routerOptions.routeFieldName : routePath,
        isRoute: true,
        isInternal: false,
        nestLevel,
        handler,
        reflection: getFunctionReflectionMethods(
            handler,
            routerOptions,
            getRouteDefaultParams().length,
            routerOptions.lazyLoadReflection
        ),
        enableValidation: (route as RouteDef).enableValidation ?? routerOptions.enableValidation,
        enableSerialization: (route as RouteDef).enableSerialization ?? routerOptions.enableSerialization,
        src: routeObj,
        selfPointer: routePointer,
    };
    return executable;
}

function getFakeInternalHookReflection(): FunctionReflection {
    return {
        paramsLength: 0,
        isAsync: false,
        handlerType: null as any,
        validateParams: (p: any[]) => ({hasErrors: false, totalErrors: 0, errors: []}),
        /** serializes the parameters of the reflected function */
        serializeParams: (params: any[]) => params,
        /** deserializes the parameters of the reflected function */
        deserializeParams: (serializedParams: any[]) => serializedParams,
        /** validates the return value of the reflected function */
        validateReturn: (p: any) => ({hasErrors: false, error: []}),
        /** serializes the return value of the reflected function */
        serializeReturn: (returnValue: any) => returnValue,
        /** deserializes the return value of the reflected function */
        deserializeReturn: (serializedReturnValue: any) => serializedReturnValue,
    };
}

function getEntry(index, keyEntryList: RouterKeyEntryList) {
    return keyEntryList[index]?.[1];
}

function getRouteEntryProperties(
    minus1: Routes | HookDef | Route | undefined,
    zero: Executable | RoutesWithId,
    plus1: Routes | HookDef | Route | undefined
) {
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
}

function setStartAndEndInternalExecutables() {
    startHooks = Object.entries(startHooksDef).map(([key, hook]) => getExecutableFromHook(hook, [key], 0, key));
    endHooks = Object.entries(endHooksDef).map(([key, hook]) => getExecutableFromHook(hook, [key], 0, key));
}
