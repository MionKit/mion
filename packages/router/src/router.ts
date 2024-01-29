/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {join} from 'path';
import {DEFAULT_ROUTE_OPTIONS, MAX_ROUTE_NESTING} from './constants';
import {isRawHookDef, isHeaderHookDef, isExecutable, isHookDef, isRoute, isRoutes, isAnyHookDef} from './types/guards';
import type {Route, RouterOptions, Routes, RouterEntry} from './types/general';
import type {NotFoundProcedure} from './types/procedures';
import type {RawProcedure} from './types/procedures';
import type {HeaderProcedure} from './types/procedures';
import type {HookProcedure} from './types/procedures';
import type {RouteProcedure} from './types/procedures';
import type {Procedure} from './types/procedures';
import {ProcedureType} from './types/procedures';
import type {PublicApi, PrivateDef, HooksCollection} from './types/publicProcedures';
import type {HeaderHookDef, HookDef, RawHookDef} from './types/definitions';
import {ReflectionOptions, getFunctionReflectionMethods} from '@mionkit/reflection';
import {bodyParserHooks} from './jsonBodyParser.routes';
import {RpcError, StatusCodes, getRouterItemId, setErrorOptions, getRoutePath} from '@mionkit/core';
import {getRemoteMethodsMetadata, resetRemoteMethodsMetadata} from './remoteMethodsMetadata';
import {clientRoutes} from './client.routes';

type RouterKeyEntryList = [string, RouterEntry][];
type RoutesWithId = {
    pathPointer: string[];
    routes: Routes;
};

// ############# PRIVATE STATE #############

const flatRouter: Map<string, Procedure[]> = new Map(); // Main Router
const hooksById: Map<string, HookProcedure | HeaderProcedure | RawProcedure> = new Map();
const routesById: Map<string, RouteProcedure> = new Map();
const rawHooksById: Map<string, RawProcedure> = new Map();
const hookNames: Map<string, boolean> = new Map();
const routeNames: Map<string, boolean> = new Map();
let complexity = 0;
let routerOptions: RouterOptions = {...DEFAULT_ROUTE_OPTIONS};
let isRouterInitialized = false;
let looselyReflectionOptions: ReflectionOptions | undefined;
let allExecutablesIds: string[] | undefined;

/** Global hooks to be run before and after any other hooks or routes set using `registerRoutes` */
const defaultStartHooks = {mionParseJsonRequestBody: bodyParserHooks.mionParseJsonRequestBody};
const defaultEndHooks = {mionStringifyJsonResponseBody: bodyParserHooks.mionStringifyJsonResponseBody};
let startHooksDef: HooksCollection = {...defaultStartHooks};
let endHooksDef: HooksCollection = {...defaultEndHooks};
let startHooks: Procedure[] = [];
let endHooks: Procedure[] = [];

// ############# PUBLIC METHODS #############

export const getRouteExecutionPath = (path: string) => flatRouter.get(path);
export const getRouteEntries = () => flatRouter.entries();
export const geRoutesSize = () => flatRouter.size;
export const getRouteExecutable = (id: string) => routesById.get(id);
export const getHookExecutable = (id: string) => hooksById.get(id);
export const geHooksSize = () => hooksById.size;
export const getComplexity = () => complexity;
export const getRouterOptions = <Opts extends RouterOptions>(): Readonly<Opts> => routerOptions as Opts;
export const getAnyExecutable = (id: string) => routesById.get(id) || hooksById.get(id) || rawHooksById.get(id);

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
    looselyReflectionOptions = undefined;
    allExecutablesIds = undefined;
    resetRemoteMethodsMetadata();
};

// simpler router initialization
export function initMionRouter<R extends Routes>(routes: R, opts?: Partial<RouterOptions>): PublicApi<R> {
    initRouter(opts);
    return registerRoutes(routes);
}

/**
 * Initializes the Router.
 * @param application
 * @param sharedDataFactory a factory function that returns an object to be shared in the `callContext.shared`
 * @param routerOptions
 * @returns
 */
export function initRouter(opts?: Partial<RouterOptions>): Readonly<RouterOptions> {
    if (isRouterInitialized) throw new Error('Router has already been initialized');
    routerOptions = {...routerOptions, ...opts};
    Object.freeze(routerOptions);
    setErrorOptions(routerOptions);
    isRouterInitialized = true;
    if (!routerOptions.skipClientRoutes) registerRoutes(clientRoutes);
    return routerOptions;
}

export function registerRoutes<R extends Routes>(routes: R): PublicApi<R> {
    if (!isRouterInitialized) throw new Error('initRouter should be called first');
    startHooks = getExecutablesFromHooksCollection(startHooksDef);
    endHooks = getExecutablesFromHooksCollection(endHooksDef);
    recursiveFlatRoutes(routes);
    // we only want to get information about the routes when creating api spec
    if (shouldFullGenerateSpec()) return getRemoteMethodsMetadata(routes);
    return {} as PublicApi<R>;
}

export function getRouteDefaultParams(): string[] {
    return ['context'];
}

/** Add hooks at the start af the execution path, adds them before any other existing start hooks by default */
export function addStartHooks(hooksDef: HooksCollection, appendBeforeExisting = true) {
    if (isRouterInitialized) throw new Error('Can not add start hooks after the router has been initialized');
    if (appendBeforeExisting) {
        startHooksDef = {...hooksDef, ...startHooksDef};
        return;
    }
    startHooksDef = {...startHooksDef, ...hooksDef};
}

/** Add hooks at the end af the execution path, adds them after any other existing end hooks by default */
export function addEndHooks(hooksDef: HooksCollection, prependAfterExisting = true) {
    if (isRouterInitialized) throw new Error('Can not add end hooks after the router has been initialized');
    if (prependAfterExisting) {
        endHooksDef = {...endHooksDef, ...hooksDef};
        return;
    }
    endHooksDef = {...hooksDef, ...endHooksDef};
}

let notFoundExecutionPath: Procedure[] | undefined;
const notFoundHook = {
    type: ProcedureType.rawHook,
    handler: () => new RpcError({statusCode: StatusCodes.NOT_FOUND, publicMessage: `Route not found`}),
    options: {
        canReturnData: false,
        runOnError: true,
        useValidation: false,
        useSerialization: false,
    },
} satisfies RawHookDef;
export function getNotFoundExecutionPath(): Procedure[] {
    if (notFoundExecutionPath) return notFoundExecutionPath;
    const hookName = '_mion404NotfoundHook_';
    const notFoundHandlerExecutable = getExecutableFromRawHook(notFoundHook, [hookName], 0);
    (notFoundHandlerExecutable as NotFoundProcedure).is404 = true;
    notFoundExecutionPath = [...startHooks, notFoundHandlerExecutable, ...endHooks];
    return notFoundExecutionPath;
}

export function isPrivateProcedure(entry: RouterEntry, id: string): entry is PrivateDef {
    if (isRoute(entry)) return false;
    if (isRawHookDef(entry)) return true;
    try {
        const handler = entry.handler;
        const executable = getHookExecutable(id) || getRouteExecutable(id);
        const hasPublicParams = handler.length > getRouteDefaultParams().length;
        return !hasPublicParams && !executable?.options.canReturnData;
    } catch {
        // error thrown because entry is a Routes object and does not have any handler
        return false;
    }
}

export function isPrivateExecutable(executable: Procedure): boolean {
    if (executable.type === ProcedureType.rawHook) return true;
    if (executable.type === ProcedureType.route) return false;
    const hasPublicParams = executable.handler.length > getRouteDefaultParams().length;
    return !hasPublicParams && !executable.options.canReturnData;
}

export function getTotalExecutables(): number {
    return routesById.size + hooksById.size + rawHooksById.size;
}

export function getAllExecutablesIds(): string[] {
    if (allExecutablesIds) return allExecutablesIds;
    allExecutablesIds = [...routesById.keys(), ...hooksById.keys(), ...rawHooksById.keys()];
    return allExecutablesIds;
}

export function shouldFullGenerateSpec(): boolean {
    return routerOptions.getPublicRoutesData || process.env.GENERATE_ROUTER_SPEC === 'true';
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
    preHooks: Procedure[] = [],
    postHooks: Procedure[] = [],
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
        let routeEntry: Procedure | RoutesWithId;
        if (typeof key !== 'string' || !isNaN(key as any))
            throw new Error(`Invalid route: ${join(...newPointer)}. Numeric route names are not allowed`);

        // generates a hook
        if (isAnyHookDef(item)) {
            routeEntry = getExecutableFromAnyHook(item, newPointer, nestLevel);
            if (hookNames.has(routeEntry.id))
                throw new Error(`Invalid hook: ${join(...newPointer)}. Naming collision, Naming collision, duplicated hook.`);
            hookNames.set(routeEntry.id, true);
        }

        // generates a route
        else if (isRoute(item)) {
            routeEntry = getExecutableFromRoute(item, newPointer, nestLevel);
            if (routeNames.has(routeEntry.id))
                throw new Error(`Invalid route: ${join(...newPointer)}. Naming collision, duplicated route`);
            routeNames.set(routeEntry.id, true);
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
    routeEntry: Procedure | RoutesWithId,
    currentPointer: string[],
    preHooks: Procedure[],
    postHooks: Procedure[],
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
        const path = getRoutePath(routeEntry.pointer, routerOptions);
        const execPath = getFullExecutionPath(routeExecutionPath);
        flatRouter.set(path, execPath);
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
function getFullExecutionPath(executionPath: Procedure[]): Procedure[] {
    return [...startHooks, ...executionPath, ...endHooks];
}

function getExecutableFromAnyHook(hook: HookDef | HeaderHookDef | RawHookDef, hookPointer: string[], nestLevel: number) {
    if (isRawHookDef(hook)) return getExecutableFromRawHook(hook, hookPointer, nestLevel);
    return getExecutableFromHook(hook, hookPointer, nestLevel);
}

function getExecutableFromHook(
    hook: HookDef | HeaderHookDef,
    hookPointer: string[],
    nestLevel: number
): HookProcedure | HeaderProcedure {
    const inHeader = isHeaderHookDef(hook);
    // todo fix header id should be same as any other one and then maybe map from id to header name
    const hookId = getRouterItemId(hookPointer);
    const existing = hooksById.get(hookId);
    if (existing) return existing as HookProcedure;

    type MixedExecutable = (Omit<HookProcedure, 'type'> | Omit<HeaderProcedure, 'type'>) & {
        type: ProcedureType.hook | ProcedureType.headerHook;
    };

    const executable: MixedExecutable = {
        id: hookId,
        type: inHeader ? ProcedureType.headerHook : ProcedureType.hook,
        nestLevel,
        handler: hook.handler,
        reflection: getFunctionReflectionMethods(hook.handler, getReflectionOptions(hook), getRouteDefaultParams().length),
        pointer: hookPointer,
        headerName: inHeader ? (hook as HeaderHookDef).headerName?.toLowerCase() : undefined,
        options: hook.options,
    };
    executable.options.canReturnData = executable.reflection.hasReturnData;
    hooksById.set(hookId, executable as any);
    return executable as any;
}

function getExecutableFromRawHook(hook: RawHookDef, hookPointer: string[], nestLevel: number): RawProcedure {
    const hookId = getRouterItemId(hookPointer);
    const existing = rawHooksById.get(hookId);
    if (existing) return existing as RawProcedure;

    const executable: RawProcedure = {
        type: ProcedureType.rawHook,
        id: hookId,
        nestLevel,
        handler: hook.handler,
        reflection: null,
        pointer: hookPointer,
        options: hook.options,
    };
    executable.options.canReturnData = false;
    rawHooksById.set(hookId, executable);
    return executable;
}

function getExecutableFromRoute(route: Route, routePointer: string[], nestLevel: number): RouteProcedure {
    const routeId = getRouterItemId(routePointer);
    const existing = routesById.get(routeId);
    if (existing) return existing as RouteProcedure;
    const executable: RouteProcedure = {
        type: ProcedureType.route,
        id: routeId,
        nestLevel,
        handler: route.handler,
        reflection: getFunctionReflectionMethods(route.handler, getReflectionOptions(route), getRouteDefaultParams().length),
        pointer: routePointer,
        options: route.options,
    };
    delete (executable as any).route;
    routesById.set(routeId, executable);
    return executable;
}

function getEntry(index, keyEntryList: RouterKeyEntryList) {
    return keyEntryList[index]?.[1];
}

function getRouteEntryProperties(
    minus1: RouterEntry | undefined,
    zero: Procedure | RoutesWithId,
    plus1: RouterEntry | undefined
) {
    const minus1IsRoute = minus1 && isRoute(minus1);
    const zeroIsRoute = (zero as Procedure).type === ProcedureType.route;
    const plus1IsRoute = plus1 && isRoute(plus1);

    const isExec = !!(zero as Procedure).handler;

    return {
        isBetweenRoutes: minus1IsRoute && zeroIsRoute && plus1IsRoute,
        isExecutable: isExec,
        isRoute: zeroIsRoute,
        preLevelHooks: [] as Procedure[],
        postLevelHooks: [] as Procedure[],
    };
}

function getExecutablesFromHooksCollection(hooksDef: HooksCollection): (RawProcedure | HookProcedure | HeaderProcedure)[] {
    return Object.entries(hooksDef).map(([key, hook]) => {
        if (isRawHookDef(hook)) return getExecutableFromRawHook(hook, [key], 0);
        if (isHeaderHookDef(hook) || isHookDef(hook)) return getExecutableFromHook(hook, [key], 0);
        throw new Error(`Invalid hook: ${key}. Invalid hook definition`);
    });
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
