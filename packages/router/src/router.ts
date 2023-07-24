/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {join} from 'path';
import {DEFAULT_ROUTE_OPTIONS, MAX_ROUTE_NESTING, ROUTE_PATH_ROOT} from './constants';
import {
    Executable,
    Handler,
    HookDef,
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
    RawHookDef,
    RawExecutable,
    RawHooksCollection,
    NotFoundExecutable,
} from './types';
import {getFunctionReflectionMethods} from '@mionkit/runtype';
import {bodyParserHooks} from './jsonBodyParser';
import {RouteError, StatusCodes, setErrorOptions} from '@mionkit/core';

type RouterKeyEntryList = [string, Routes | HookDef | Route][];
type RoutesWithId = {
    pathPointer: string[];
    routes: Routes;
};

// ############# PRIVATE STATE #############

const flatRouter: Map<string, Executable[]> = new Map(); // Main Router
const hooksById: Map<string, HookExecutable> = new Map();
const routesById: Map<string, RouteExecutable> = new Map();
const rawHooksById: Map<string, RawExecutable> = new Map();
const hookNames: Map<string, boolean> = new Map();
const routeNames: Map<string, boolean> = new Map();
let complexity = 0;
let routerOptions: RouterOptions = {...DEFAULT_ROUTE_OPTIONS};
let isRouterInitialized = false;

/** Global hooks to be run before and after any other hooks or routes set using `registerRoutes` */
const defaultStartHooks = {parseJsonRequestBody: bodyParserHooks.parseJsonRequestBody};
const defaultEndHooks = {stringifyJsonResponseBody: bodyParserHooks.stringifyJsonResponseBody};
let startHooksDef: RawHooksCollection = {...defaultStartHooks};
let endHooksDef: RawHooksCollection = {...defaultEndHooks};
let startHooks: Executable[] = [];
let endHooks: Executable[] = [];

// ############# PUBLIC METHODS #############

export const getRouteExecutionPath = (path: string) => flatRouter.get(path);
export const getRouteEntries = () => flatRouter.entries();
export const geRoutesSize = () => flatRouter.size;
export const getRouteExecutable = (path: string) => routesById.get(path);
export const getHookExecutable = (fieldName: string) => hooksById.get(fieldName);
export const geHooksSize = () => hooksById.size;
export const getComplexity = () => complexity;
export const getRouterOptions = <Opts extends RouterOptions>(): Readonly<Opts> => routerOptions as Opts;

export const resetRouter = () => {
    flatRouter.clear();
    hooksById.clear();
    routesById.clear();
    rawHooksById.clear();
    hookNames.clear();
    routeNames.clear();
    complexity = 0;
    routerOptions = {...DEFAULT_ROUTE_OPTIONS};
    startHooksDef = {...defaultStartHooks};
    endHooksDef = {...defaultEndHooks};
    startHooks = [];
    endHooks = [];
    isRouterInitialized = false;
};

/**
 * Initializes the Router.
 * @param application
 * @param sharedDataFactory a factory function that returns an object to be shared in the `callContext.shared`
 * @param routerOptions
 * @returns
 */
export function initRouter<Opts extends RouterOptions>(opts?: Partial<Opts>): Readonly<Opts> {
    if (isRouterInitialized) throw new Error('Router has already been initialized');
    routerOptions = {...routerOptions, ...opts};
    Object.freeze(routerOptions);
    setErrorOptions(routerOptions);
    isRouterInitialized = true;
    return routerOptions as Opts;
}

export function registerRoutes<R extends Routes>(routes: R): PublicMethods<R> {
    if (!isRouterInitialized) throw new Error('initRouter should be called first');
    startHooks = getExecutablesFromRawHooks(startHooksDef);
    endHooks = getExecutablesFromRawHooks(endHooksDef);
    recursiveFlatRoutes(routes);
    // we only want to get information about the routes when creating api spec
    if (routerOptions.getPublicRoutesData || process.env.GENERATE_ROUTER_SPEC === 'true') {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const {getPublicRoutes} = require('./publicMethods');
        return getPublicRoutes(routes) as PublicMethods<R>;
    }

    return {} as PublicMethods<R>;
}

export function getRoutePathFromPointer(route: Route, pointer: string[]) {
    return getRoutePath(route, join(...pointer));
}

export function getRoutePath(route: Route, path: string) {
    const routePath = join(ROUTE_PATH_ROOT, routerOptions.prefix, (route as RouteDef)?.path || path);
    return routerOptions.suffix ? routePath + routerOptions.suffix : routePath;
}

export function getHookFieldName(item: HookDef | RawHookDef, key: string) {
    return (item as HookDef)?.fieldName || key;
}

export function getRouteDefaultParams(): string[] {
    if (!routerOptions.useAsyncCallContext) {
        return ['context'];
    }
    return [];
}

/** Add hooks at the start af the execution path, adds them before any other existing start hooks by default */
export function addStartHooks(hooksDef: RawHooksCollection, appendBeforeExisting = true) {
    if (isRouterInitialized) throw new Error('Can not add start hooks after the router has been initialized');
    if (appendBeforeExisting) {
        startHooksDef = {...hooksDef, ...startHooksDef};
        return;
    }
    startHooksDef = {...startHooksDef, ...hooksDef};
}

/** Add hooks at the end af the execution path, adds them after any other existing end hooks by default */
export function addEndHooks(hooksDef: RawHooksCollection, prependAfterExisting = true) {
    if (isRouterInitialized) throw new Error('Can not add end hooks after the router has been initialized');
    if (prependAfterExisting) {
        endHooksDef = {...endHooksDef, ...hooksDef};
        return;
    }
    endHooksDef = {...hooksDef, ...endHooksDef};
}

let notFoundExecutionPath: Executable[] | undefined;
export function getNotFoundExecutionPath(): Executable[] {
    if (notFoundExecutionPath) return notFoundExecutionPath;
    const hookName = '_mion404NotfoundHook_';
    const notFoundHook = {
        rawHook: () => {
            return new RouteError({statusCode: StatusCodes.NOT_FOUND, publicMessage: `Route not found`});
        },
    } satisfies RawHookDef;
    const notFoundHandlerExecutable = getExecutableFromRawHook(notFoundHook, [hookName], 0, hookName);
    (notFoundHandlerExecutable as NotFoundExecutable).is404 = true;
    notFoundExecutionPath = [...startHooks, notFoundHandlerExecutable, ...endHooks];
    return notFoundExecutionPath;
}

// ############# PRIVATE METHODS #############

/**
 * Optimized algorithm to flatten the routes object into a list of Executable objects.
 * @param routes
 * @param currentPointer current pointer in the routes object i.e. ['users', 'get']
 * @param preHooks hooks one level up preceding current pointer
 * @param postHooks hooks one level up  following the current pointer
 * @param nestLevel
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
    if (entries.length === 0)
        throw new Error(`Invalid route: ${currentPointer.length ? join(...currentPointer) : '*'}. Can Not define empty routes`);

    let minus1Props: ReturnType<typeof getRouteEntryProperties> | null = null;
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
        minus1Props = recursiveCreateExecutionPath(
            routeEntry,
            newPointer,
            preHooks,
            postHooks,
            nestLevel,
            index,
            array,
            minus1Props
        );

        complexity++;
    });
}

function recursiveCreateExecutionPath(
    routeEntry: Executable | RoutesWithId,
    currentPointer: string[],
    preHooks: Executable[],
    postHooks: Executable[],
    nestLevel: number,
    index: number,
    routeKeyedEntries: RouterKeyEntryList,
    minus1Props: ReturnType<typeof getRouteEntryProperties> | null
) {
    const minus1 = getEntry(index - 1, routeKeyedEntries);
    const plus1 = getEntry(index + 1, routeKeyedEntries);
    const props = getRouteEntryProperties(minus1, routeEntry, plus1);

    if (props.isBetweenRoutes && minus1Props) {
        props.preLevelHooks = minus1Props.preLevelHooks;
        props.postLevelHooks = minus1Props.postLevelHooks;
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
        const routeExecutionPath = [...preHooks, ...props.preLevelHooks, routeEntry, ...props.postLevelHooks, ...postHooks];
        flatRouter.set(routeEntry.path, getFullExecutionPath(routeExecutionPath));
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

/** returns an execution path with start and end hooks added to the start and end of the execution path respectively */
function getFullExecutionPath(executionPath: Executable[]): Executable[] {
    return [...startHooks, ...executionPath, ...endHooks];
}

function getHandler(entry: HookDef | Route, pathPointer: string[]): Handler {
    const handler = isHandler(entry) ? entry : (entry as HookDef).hook || (entry as RouteDef).route;
    if (!isHandler(handler)) throw new Error(`Invalid route: ${join(...pathPointer)}. Missing route handler`);
    return handler;
}

function getExecutableFromHook(hook: HookDef, hookPointer: string[], nestLevel: number, key: string): HookExecutable {
    const hookName = getHookFieldName(hook, key);
    const existing = hooksById.get(hookName);
    if (existing) return existing as HookExecutable;
    const handler = getHandler(hook, hookPointer);

    if (!!hook.inHeader && handler.length > getRouteDefaultParams().length + 1) {
        throw new Error(
            `Invalid Hook: ${join(...hookPointer)}. In header hooks can only have a single parameter remote parameter.`
        );
    }

    if (hookName === 'errors') {
        throw new Error(`Invalid Hook: ${join(...hookPointer)}. The 'errors' fieldName is reserver for the router.`);
    }

    const executable: HookExecutable = {
        path: hookName,
        forceRunOnError: !!hook.forceRunOnError,
        canReturnData: !!hook.canReturnData,
        inHeader: !!hook.inHeader,
        nestLevel,
        fieldName: hookName,
        isRoute: false,
        isRawExecutable: false,
        handler,
        reflection: getFunctionReflectionMethods(
            handler,
            routerOptions.reflectionOptions,
            getRouteDefaultParams().length,
            routerOptions.lazyLoadReflection
        ),
        enableValidation: hook.enableValidation ?? routerOptions.enableValidation,
        enableSerialization: hook.enableSerialization ?? routerOptions.enableSerialization,
        useAsyncCallContext: hook.useAsyncCallContext ?? routerOptions.useAsyncCallContext,
        // src: hook,
        selfPointer: hookPointer,
    };
    hooksById.set(hookName, executable);
    return executable;
}

function getExecutableFromRawHook(hook: RawHookDef, hookPointer: string[], nestLevel: number, key: string): RawExecutable {
    const hookName = key;
    const existing = rawHooksById.get(hookName);
    if (existing) return existing as RawExecutable;

    if (hookName === 'errors') {
        throw new Error(`Invalid Hook: ${join(...hookPointer)}. The 'errors' fieldName is reserver for the router.`);
    }

    const executable: RawExecutable = {
        path: hookName,
        forceRunOnError: true,
        canReturnData: false,
        inHeader: false,
        nestLevel,
        fieldName: hookName,
        isRoute: false,
        isRawExecutable: true,
        handler: hook.rawHook,
        reflection: null,
        enableValidation: false,
        enableSerialization: false,
        useAsyncCallContext: false,
        // src: hook,
        selfPointer: hookPointer,
    };
    rawHooksById.set(hookName, executable);
    return executable;
}

function getExecutableFromRoute(route: Route, routePointer: string[], nestLevel: number): RouteExecutable {
    const routePath = getRoutePathFromPointer(route, routePointer);
    const existing = routesById.get(routePath);
    if (existing) return existing as RouteExecutable;
    const handler = getHandler(route, routePointer);
    // const routeObj = isHandler(route) ? {...DEFAULT_ROUTE} : {...DEFAULT_ROUTE, ...route};
    const executable: RouteExecutable = {
        path: routePath,
        forceRunOnError: false,
        canReturnData: true,
        inHeader: false,
        fieldName: routerOptions.routeFieldName ? routerOptions.routeFieldName : routePath,
        isRoute: true,
        isRawExecutable: false,
        nestLevel,
        handler,
        reflection: getFunctionReflectionMethods(
            handler,
            routerOptions.reflectionOptions,
            getRouteDefaultParams().length,
            routerOptions.lazyLoadReflection
        ),
        enableValidation: (route as RouteDef).enableValidation ?? routerOptions.enableValidation,
        enableSerialization: (route as RouteDef).enableSerialization ?? routerOptions.enableSerialization,
        useAsyncCallContext: (route as RouteDef).useAsyncCallContext ?? routerOptions.useAsyncCallContext,
        // src: routeObj,
        selfPointer: routePointer,
    };
    delete (executable as any).route;
    routesById.set(routePath, executable);
    return executable;
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

function getExecutablesFromRawHooks(hooksDef: RawHooksCollection): RawExecutable[] {
    return Object.entries(hooksDef).map(([key, hook]) => getExecutableFromRawHook(hook, [key], 0, key));
}
