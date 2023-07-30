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
    isRawHookDef,
    isHeaderHookDef,
    HeaderHookDef,
    AnyHandler,
    RouterEntry,
    isRouteDef,
    isAnyHookDef,
    PrivateHookDef,
} from './types';
import {ReflectionOptions, getFunctionReflectionMethods} from '@mionkit/runtype';
import {bodyParserHooks} from './jsonBodyParser';
import {RouteError, StatusCodes, setErrorOptions} from '@mionkit/core';
import {getPublicRoutes} from './publicMethods';

type RouterKeyEntryList = [string, RouterEntry][];
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
// pointer to the original route/hook, i.e. /api/v1/users/getUser => ['users', 'getUser']
const pathToSrc: Map<string, string[]> = new Map();
let complexity = 0;
let routerOptions: RouterOptions = {...DEFAULT_ROUTE_OPTIONS};
let isRouterInitialized = false;
let looselyReflectionOptions: ReflectionOptions | undefined;

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
export const getHookExecutable = (path: string) => hooksById.get(path);
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
    pathToSrc.clear();
    complexity = 0;
    routerOptions = {...DEFAULT_ROUTE_OPTIONS};
    startHooksDef = {...defaultStartHooks};
    endHooksDef = {...defaultEndHooks};
    startHooks = [];
    endHooks = [];
    isRouterInitialized = false;
    looselyReflectionOptions = undefined;
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
        return getPublicRoutes(routes);
    }
    return {} as PublicMethods<R>;
}

export function getPathFromPointer(pointer: string[]) {
    return getRoutePath(join(...pointer));
}

export function getRoutePath(path: string) {
    const routePath = join(ROUTE_PATH_ROOT, routerOptions.prefix, path);
    return routerOptions.suffix ? routePath + routerOptions.suffix : routePath;
}

export function getRouteDefaultParams(): string[] {
    return ['context'];
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
    const notFoundHandlerExecutable = getExecutableFromRawHook(notFoundHook, [hookName], 0);
    (notFoundHandlerExecutable as NotFoundExecutable).is404 = true;
    notFoundExecutionPath = [...startHooks, notFoundHandlerExecutable, ...endHooks];
    return notFoundExecutionPath;
}

export function isPrivateHookDef(entry: RouterEntry): entry is PrivateHookDef {
    if (isRoute(entry)) return false;
    if (isRawHookDef(entry)) return true;
    try {
        const handler = getHandler(entry, []);
        const hasPublicParams = handler.length > getRouteDefaultParams().length;
        return !hasPublicParams && !(entry as HookDef).canReturnData;
    } catch {
        // error thrown because entry is a Routes object and does not have any handler
        return false;
    }
}

/** Returns the pointer to the original route/hook, i.e. /api/v1/users/getUser => ['users', 'getUser'] */
export function getSrcPointer(path: string) {
    const pointer = pathToSrc.get(path);
    if (!pointer) throw new Error(`Path ${path} not found in router`);
    return pointer;
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
        if (isAnyHookDef(item)) {
            routeEntry = getExecutableFromAnyHook(item, newPointer, nestLevel);
            if (hookNames.has(routeEntry.path))
                throw new Error(`Invalid hook: ${join(...newPointer)}. Naming collision, Naming collision, duplicated hook.`);
            hookNames.set(routeEntry.path, true);
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
            if (!isAnyHookDef(entry)) return;
            const newPointer = [...currentPointer.slice(0, -1), k];
            const executable = getExecutableFromAnyHook(entry, newPointer, nestLevel);
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

function getHandler(entry: RouterEntry, pathPointer: string[]): AnyHandler {
    if (isHandler(entry)) return entry;
    if (isRouteDef(entry)) return entry.route;
    if (isHookDef(entry)) return entry.hook;
    if (isHeaderHookDef(entry)) return entry.headerHook;
    if (isRawHookDef(entry)) return entry.rawHook;

    throw new Error(`Invalid route: ${join(...pathPointer)}. Missing route handler`);
}

function getExecutableFromAnyHook(hook: HookDef | HeaderHookDef | RawHookDef, hookPointer: string[], nestLevel: number) {
    if (isRawHookDef(hook)) return getExecutableFromRawHook(hook, hookPointer, nestLevel);
    return getExecutableFromHook(hook, hookPointer, nestLevel);
}

function getExecutableFromHook(hook: HookDef | HeaderHookDef, hookPointer: string[], nestLevel: number): HookExecutable {
    const inHeader = isHeaderHookDef(hook);
    const hookName = inHeader ? hook.headerName : getPathFromPointer(hookPointer);
    const existing = hooksById.get(hookName);
    if (existing) return existing as HookExecutable;
    const handler = getHandler(hook, hookPointer);

    const executable: HookExecutable = {
        path: hookName,
        forceRunOnError: !!hook.forceRunOnError,
        canReturnData: !!hook.canReturnData,
        inHeader,
        nestLevel,
        isRoute: false,
        isRawExecutable: false,
        handler,
        reflection: getFunctionReflectionMethods(handler, getReflectionOptions(hook), getRouteDefaultParams().length),
        enableValidation: hook.enableValidation ?? routerOptions.enableValidation,
        enableSerialization: hook.enableSerialization ?? routerOptions.enableSerialization,
    };
    hooksById.set(hookName, executable);
    pathToSrc.set(hookName, hookPointer);
    return executable;
}

function getExecutableFromRawHook(hook: RawHookDef, hookPointer: string[], nestLevel: number): RawExecutable {
    const hookName = getPathFromPointer(hookPointer);
    const existing = rawHooksById.get(hookName);
    if (existing) return existing as RawExecutable;

    const executable: RawExecutable = {
        path: hookName,
        forceRunOnError: true,
        canReturnData: false,
        inHeader: false,
        nestLevel,
        isRoute: false,
        isRawExecutable: true,
        handler: hook.rawHook,
        reflection: null,
        enableValidation: false,
        enableSerialization: false,
    };
    rawHooksById.set(hookName, executable);
    pathToSrc.set(hookName, hookPointer);
    return executable;
}

function getExecutableFromRoute(route: Route, routePointer: string[], nestLevel: number): RouteExecutable {
    const routePath = getPathFromPointer(routePointer);
    const existing = routesById.get(routePath);
    if (existing) return existing as RouteExecutable;
    const handler = getHandler(route, routePointer);
    // const routeObj = isHandler(route) ? {...DEFAULT_ROUTE} : {...DEFAULT_ROUTE, ...route};
    const executable: RouteExecutable = {
        path: routePath,
        forceRunOnError: false,
        canReturnData: true,
        inHeader: false,
        isRoute: true,
        isRawExecutable: false,
        nestLevel,
        handler,
        reflection: getFunctionReflectionMethods(handler, getReflectionOptions(route), getRouteDefaultParams().length),
        enableValidation: (route as RouteDef).enableValidation ?? routerOptions.enableValidation,
        enableSerialization: (route as RouteDef).enableSerialization ?? routerOptions.enableSerialization,
    };
    delete (executable as any).route;
    routesById.set(routePath, executable);
    pathToSrc.set(routePath, routePointer);
    return executable;
}

function getEntry(index, keyEntryList: RouterKeyEntryList) {
    return keyEntryList[index]?.[1];
}

function getRouteEntryProperties(
    minus1: RouterEntry | undefined,
    zero: Executable | RoutesWithId,
    plus1: RouterEntry | undefined
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
    return Object.entries(hooksDef).map(([key, hook]) => getExecutableFromRawHook(hook, [key], 0));
}

function getReflectionOptions(entry: RouterEntry): ReflectionOptions {
    if (isHeaderHookDef(entry)) return getReflectionOptionsWithLooselySerialization();
    return routerOptions.reflectionOptions;
}

function getReflectionOptionsWithLooselySerialization(): ReflectionOptions {
    if (looselyReflectionOptions) return looselyReflectionOptions;
    const newReflectionOptions = {...routerOptions.reflectionOptions};
    newReflectionOptions.serializationOptions = {...newReflectionOptions.serializationOptions, loosely: true};
    looselyReflectionOptions = newReflectionOptions;
    return looselyReflectionOptions;
}
