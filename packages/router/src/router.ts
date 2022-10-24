/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {join} from 'path';
import {DEFAULT_ROUTE, DEFAULT_ROUTE_OPTIONS, IS_TEST_ENV, MAX_ROUTE_NESTING, ROUTE_PATH_ROOT} from './constants';
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
    Context,
    MapObj,
    MkRequest,
    SharedDataFactory,
    MkError,
    MkResponse,
    ServerCall,
} from './types';
import {StatusCodes} from './status-codes';
import {
    deserializeParams,
    getOutputSerializer,
    getParamsDeserializer,
    getParamValidators,
    isAsyncHandler,
    validateParams,
} from './reflection';
import {reflect, Type, typeOf} from '@deepkit/type';
type RouterKeyEntryList = [string, Routes | Hook | Route][];
type RoutesWithId = {
    path: string;
    routes: Routes;
};

// ############# PUBLIC METHODS #############

export const addRoutes = (routes: Routes) => {
    // TODO: Not sure if bellow code is required. using the wrong context type is a big fail and should be catch during dev
    // TODO: fix should be just to use correct context type
    // if (!contextType) throw 'Context needs to be defined before adding routes';
    recursiveFlatRoutes(routes);
};
export const getRouteExecutionPath = (path: string) => flatRouter.get(path);
export const getRouteEntries = () => flatRouter.entries();
export const geRoutesSize = () => flatRouter.size;
export const getRouteExecutable = (path: string) => routesByPath.get(path);
export const getHookExecutable = (fieldName: string) => hooksByFieldName.get(fieldName);
export const geHooksSize = () => hooksByFieldName.size;
export const forceConsoleLogs = () => {
    if (!IS_TEST_ENV) throw 'forceConsoleLogs can be called only from test envs';
    forceConsole = true;
};
export const getComplexity = () => complexity;
export const getRouterOptions = () => routerOptions;
export const setRouterOptions = <ServerReq extends MkRequest = MkRequest>(routerOptions_?: Partial<RouterOptions<ServerReq>>) => {
    routerOptions = {
        ...routerOptions,
        ...(routerOptions_ as Partial<RouterOptions>),
    };
};

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
    routerOptions = {
        ...DEFAULT_ROUTE_OPTIONS,
    };
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
    AnyServerCall extends ServerCall<ServerReq>,
>(
    app_: App,
    handlersDataFactory_?: SharedDataFactory<SharedData>,
    routerOptions_?: Partial<RouterOptions<ServerReq>>,
) => {
    if (app) throw 'Context has been already defined';
    app = app_;
    sharedDataFactory = handlersDataFactory_;
    setRouterOptions(routerOptions_);

    type ResolveContext = Context<App, SharedData, ServerReq, AnyServerCall>;
    contextType = typeOf<ResolveContext>();
    // type ResolvedRun = typeof run<ServerReq, ServerResp>;
    // const typedContext: ResolveContext = {} as any;
};

export const runRoute = async <
    App extends MapObj,
    SharedData,
    ServerReq extends MkRequest,
    AnyServerCall extends ServerCall<ServerReq> = ServerCall<ServerReq>,
>(
    path: string,
    req: ServerReq,
): Promise<MkResponse> => {
    return runRoute_<App, SharedData, ServerReq, AnyServerCall>(path, {req} as AnyServerCall);
};

export const runRoute_ = async <
    App extends MapObj,
    SharedData,
    ServerReq extends MkRequest,
    AnyServerCall extends ServerCall<ServerReq>,
>(
    path: string,
    serverCall: AnyServerCall,
): Promise<MkResponse> => {
    if (!app) throw 'Context has not been defined';
    const transformedPath = routerOptions.pathTransform ? routerOptions.pathTransform(serverCall.req, path) : path;
    const context: Context<App, SharedData, ServerReq, AnyServerCall> = {
        app: app as Readonly<App>, // static context
        server: serverCall,
        path: transformedPath,
        request: {
            headers: {},
            body: {},
        },
        reply: {
            headers: {},
            body: {},
        },
        responseErrors: [],
        internalErrors: [],
        shared: sharedDataFactory?.() || {},
    };

    const executionPath = getRouteExecutionPath(transformedPath) || [];

    if (!executionPath.length) {
        const notFound = {statusCode: StatusCodes.NOT_FOUND, message: 'Route not found'};
        context.responseErrors.push(notFound);
        context.internalErrors.push(notFound);
    } else {
        parseRequestHeadersAndBody(context);

        // ### runs execution path
        for (let index = 0; index < executionPath.length; index++) {
            const executable = executionPath[index];
            if (context.responseErrors.length && !executable.forceRunOnError) continue;

            deserializeAndValidateParams(context, executable);
            if (context.responseErrors.length && !executable.forceRunOnError) continue;

            try {
                const params = executable.inHeader
                    ? context.request.headers[executable.fieldName]
                    : context.request.body[executable.fieldName];
                if (executable.isAsync) {
                    const result = await executable.handler(context, ...params);
                    serializeResponse(context, executable, result);
                } else {
                    const result = executable.handler(context, ...params);
                    serializeResponse(context, executable, result);
                }
            } catch (err: any | MkError | Error) {
                const executableOrUnknownError = {
                    statusCode: err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR,
                    message: err.message || `Unknown error in step ${index} of execution path.`,
                };
                context.responseErrors.push(executableOrUnknownError);
                context.internalErrors.push(err);
            }
        }
    }

    const respBody = context.responseErrors.length ? {errors: context.responseErrors} : context.reply.body;

    if (forceConsole && context.internalErrors) console.error(`route ${transformedPath}`, ...context.internalErrors);
    else if (forceConsole) console.error(`route ${transformedPath}`, context.reply.headers, context.reply.body);

    return {
        statusCode: context.responseErrors.length ? context.responseErrors[0].statusCode : StatusCodes.OK,
        headers: context.reply.headers,
        data: context.reply.body,
        errors: context.responseErrors,
        json: routerOptions.jsonParser.stringify(respBody),
    } as MkResponse;
};

const parseRequestHeadersAndBody = <
    App extends MapObj,
    SharedData,
    ServerReq extends MkRequest,
    AnyServerCall extends ServerCall<ServerReq>,
>(
    context: Context<App, SharedData, ServerReq, AnyServerCall>,
) => {
    if (context.server.req.headers) context.request.headers = context.server.req.headers;
    if (!context.server.req.body || context.server.req.body === '{}') return;
    try {
        if (typeof context.server.req.body === 'string') {
            const parsedBody = routerOptions.jsonParser.parse(context.server.req.body);
            if (typeof parsedBody !== 'object') throw 'wrong body type, only objects allowed';
            context.request.body = parsedBody;
        } else {
            context.request.body = context.server.req.body || {};
        }
    } catch (err: any) {
        context.responseErrors.push({statusCode: StatusCodes.BAD_REQUEST, message: 'Invalid request body'});
        context.internalErrors.push(err);
    }
};

const deserializeAndValidateParams = <
    App extends MapObj,
    SharedData,
    ServerReq extends MkRequest,
    AnyServerCall extends ServerCall<ServerReq>,
>(
    context: Context<App, SharedData, ServerReq, AnyServerCall>,
    executable: Executable,
) => {
    const fieldName = executable.fieldName;
    let params = executable.inHeader ? context.request.headers[fieldName] : context.request.body[fieldName];

    if (executable.inHeader) {
        if (typeof params === 'string') params = [params];
        else if (Array.isArray(params)) params = [params.join(',')]; // node http headers could be an array of strings
        else
            return context.responseErrors.push({
                statusCode: StatusCodes.BAD_REQUEST,
                message: `Invalid header '${fieldName}'. No header found with that name.`,
            });
    }

    // defaults to an empty array if required field is omitted from body
    if (!params) params = [];

    // if there are no params input field can be omitted
    if (!params.length && !executable.paramsDeSerializers.length) return (context.request.body[fieldName] = params);

    if (params.length !== executable.paramValidators.length)
        return context.responseErrors.push({
            statusCode: StatusCodes.BAD_REQUEST,
            message: `Invalid input '${fieldName}', missing or invalid number of input parameters`,
        });

    if (routerOptions.enableSerialization) {
        try {
            params = deserializeParams(executable, params);
            if (executable.inHeader) context.request.headers[fieldName] = params;
            else context.request.body[fieldName] = params;
        } catch (e) {
            return context.responseErrors.push({
                statusCode: StatusCodes.BAD_REQUEST,
                message: `Invalid input '${fieldName}', can not deserialize. Parameters might be of the wrong type.`,
            });
        }
    } else context.request.body[fieldName] = params;

    if (routerOptions.enableValidation) {
        try {
            const errors = validateParams(executable, params);
            if (errors?.length) {
                context.responseErrors.push(...errors);
                context.internalErrors.push(...errors);
            }
        } catch (e) {
            return context.responseErrors.push({
                statusCode: StatusCodes.BAD_REQUEST,
                message: `Invalid input '${fieldName}', can not validate parameters.`,
            });
        }
    }
};

const serializeResponse = <
    App extends MapObj,
    SharedData,
    ServerReq extends MkRequest,
    AnyServerCall extends ServerCall<ServerReq>,
>(
    context: Context<App, SharedData, ServerReq, AnyServerCall>,
    executable: Executable,
    result: any,
) => {
    if (!executable.canReturnData || result === undefined) return;
    const deserialized = routerOptions.enableSerialization ? executable.outputSerializer(result) : result;
    if (executable.inHeader) context.reply.headers[executable.fieldName] = deserialized;
    else context.reply.body[executable.fieldName] = deserialized;
};

// ############# PRIVATE STATE #############

const flatRouter: Map<string, Executable[]> = new Map();
const hooksByFieldName: Map<string, Executable> = new Map();
const routesByPath: Map<string, Executable> = new Map();
const hookNames: Map<string, boolean> = new Map();
const routeNames: Map<string, boolean> = new Map();
let complexity = 0;
let app: MapObj | undefined;
let sharedDataFactory: SharedDataFactory<any> | undefined;
let contextType: Type | undefined;
let forceConsole = false;
let routerOptions: RouterOptions = {
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
            const fieldName = routeEntry.fieldName;
            if (hookNames.has(fieldName))
                throw `Invalid hook: ${path}. Naming collision, the fieldName '${fieldName}' has been used in more than one hook/route.`;
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

    if (!!hook.inHeader && handler.length > 2) {
        throw `Invalid Hook: ${path}. In header hooks can only have a single parameter besides the Context.`;
    }

    if (hookName === 'errors') {
        throw `Invalid Hook: ${path}. The 'errors' fieldName is reserver for the router.`;
    }

    const handlerType = reflect(handler);
    const executable: Executable = {
        path,
        forceRunOnError: !!hook.forceRunOnError,
        canReturnData: !!hook.canReturnData,
        inHeader: !!hook.inHeader,
        nestLevel,
        fieldName: hookName,
        isRoute: false,
        handler,
        handlerType,
        paramValidators: getParamValidators(handler, routerOptions, handlerType),
        paramsDeSerializers: getParamsDeserializer(handler, routerOptions, handlerType),
        outputSerializer: getOutputSerializer(handler, routerOptions, handlerType),
        isAsync: isAsyncHandler(handler, handlerType),
        src: hook,
    };
    delete (executable as any).hook;
    hooksByFieldName.set(hookName, executable);
    return executable;
};

const getExecutableFromRoute = (route: Route, path: string, nestLevel: number) => {
    const routePath = getRoutePath(route, path);
    const existing = routesByPath.get(routePath);
    if (existing) return existing;
    const handler = getHandler(route, routePath);
    // TODO: Not sure if bellow code is required. using the wrong context type is a big fail and should be catch during dev
    // TODO: fix should be just to use correct context type
    // if (!contextType) throw 'Context must be defined before creating routes.'; // this  should not happen
    // if (!isFirstParameterContext(contextType, handler))
    //     throw `Invalid route: ${path}. First parameter the handler must be of Type ${contextType.typeName},`;
    const routeObj = isHandler(route) ? {...DEFAULT_ROUTE} : {...DEFAULT_ROUTE, ...route};
    const handlerType = reflect(handler);
    const executable: Executable = {
        path: routePath,
        forceRunOnError: false,
        canReturnData: true,
        inHeader: false,
        fieldName: routerOptions.routeFieldName ? routerOptions.routeFieldName : routePath,
        isRoute: true,
        nestLevel,
        handler,
        handlerType,
        paramValidators: getParamValidators(handler, routerOptions),
        paramsDeSerializers: getParamsDeserializer(handler, routerOptions),
        outputSerializer: getOutputSerializer(handler, routerOptions),
        isAsync: isAsyncHandler(handler, handlerType),
        src: routeObj,
    };
    delete (executable as any).route;
    routesByPath.set(routePath, executable);
    return executable;
};

const getRoutePath = (route: Route, path: string) => {
    const routePath = join(ROUTE_PATH_ROOT, routerOptions.prefix, (route as RouteObject)?.path || path);
    return routerOptions.suffix ? routePath + routerOptions.suffix : routePath;
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

// const getRouteFieldName = (fieldName: string | undefined, key: string) => {
//     return fieldName || key;
// };

// const findDuplicates = (withDuplicated: string[]): string[] => {
//     const duplicates: string[] = [];
//     const times: {[keys: string]: number} = {};
//     withDuplicated.forEach((key) => (times[key] = (times[key] ?? 0) + 1));
//     Object.entries(times)
//         .filter(([key, times]) => times > 1)
//         .map(([key]) => key);
//     return duplicates;
// };

// const routeError = (statusCode: number, message: string) => {
//     return {
//         statusCode,
//         // prevent leaking any other fields from error
//         body: json.stringify({
//             errors: [
//                 {
//                     statusCode,
//                     message,
//                 },
//             ],
//         }),
//     };
// };
