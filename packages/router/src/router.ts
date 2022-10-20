/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {join} from 'path';
import {DEFAULT_ROUTE, DEFAULT_ROUTE_OPTIONS, MAX_ROUTE_NESTING} from './constants';
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
    MkResponse,
    JsonParser,
    SharedDataFactory,
    MkError,
    RouteReply,
} from './types';
import {StatusCodes} from './status-codes';
import {deserializeParams, getOutputSerializer, getParamsDeserializer, getParamValidators, validateParams} from './reflection';
import {Type, typeOf} from '@deepkit/type';
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
export const initRouter = <App extends MapObj, SharedData, ServerReq extends MkRequest, ServerResp extends MkResponse>(
    app_: App,
    handlersDataFactory_?: SharedDataFactory<SharedData>,
    routerOptions_?: Partial<RouterOptions>,
) => {
    if (app) throw 'Context has been already defined';
    app = app_;
    sharedDataFactory = handlersDataFactory_;
    setRouterOptions(routerOptions_);

    type ResolveContext = Context<App, SharedData, ServerReq, ServerResp>;
    contextType = typeOf<ResolveContext>();
    // type ResolvedRun = typeof run<ServerReq, ServerResp>;
    // const typedContext: ResolveContext = {} as any;
};

export const runRoute = async <App extends MapObj, SharedData, ServerReq extends MkRequest, ServerResp extends MkResponse>(
    path: string,
    req: ServerReq,
    resp: ServerResp,
): Promise<RouteReply> => {
    if (!app) throw 'Context has not been defined';

    const context: Context<App, SharedData, ServerReq, ServerResp> = {
        app: app as Readonly<App>, // static context
        server: {
            req,
            resp,
        },
        path,
        request: {
            headers: {},
            body: {},
        },
        reply: {
            headers: {},
            body: {},
        },
        responseErrors: [],
        privateErrors: [],
        shared: sharedDataFactory?.() || {},
    };

    const executionPath = getRouteExecutionPath(path) || [];
    if (!executionPath.length) {
        const notFound = {statusCode: StatusCodes.NOT_FOUND, message: 'Route not found'};
        context.responseErrors.push(notFound);
        context.privateErrors.push(notFound);
    } else {
        parseRequestInputs(context);
        await runExecutionPath(executionPath, context);
    }

    return {
        statusCode: context.responseErrors.length ? context.responseErrors[0].statusCode : StatusCodes.OK,
        errors: context.responseErrors,
        ...context.reply,
    };
};

const parseRequestInputs = <App extends MapObj, SharedData, ServerReq extends MkRequest, ServerResp extends MkResponse>(
    context: Context<App, SharedData, ServerReq, ServerResp>,
) => {
    context.request.headers = context.server.req.headers || {};
    try {
        if (typeof context.server.req.body === 'string') {
            const parsedBody = json.parse(context.server.req.body);
            if (typeof parsedBody !== 'object') throw 'wrong body type, only objects allowed';
            context.request.body = parsedBody;
        } else {
            context.request.body = context.server.req.body || {};
        }
    } catch (e) {
        context.responseErrors.push({statusCode: StatusCodes.BAD_REQUEST, message: 'Invalid request body'});
        context.privateErrors.push(e);
    }
};

const runExecutionPath = async <App extends MapObj, SharedData, ServerReq extends MkRequest, ServerResp extends MkResponse>(
    executionPath: Executable[],
    context: Context<App, SharedData, ServerReq, ServerResp>,
) => {
    if (executionPath.length && context.request) {
        for (let index = 0; index < executionPath.length; index++) {
            const executable = executionPath[index];
            if (context.responseErrors.length && !executable.forceRunOnError) continue;

            deserializeAndValidateParams(context, executable);
            if (context.responseErrors.length && !executable.forceRunOnError) continue;

            try {
                const params = executable.inHeader
                    ? context.request.headers[executable.inputFieldName]
                    : context.request.body[executable.inputFieldName];
                const result = await executable.handler(context, ...params);
                serializeResponse(context, executable, result);
            } catch (e: any | MkError | Error) {
                const executableOrUnknownError = {
                    statusCode: e.statusCode || StatusCodes.INTERNAL_SERVER_ERROR,
                    message:
                        e.message ||
                        `Unknown error executing step ${index} of '${
                            executable.isRoute ? executable.path : executable.inputFieldName
                        }'.`,
                };
                context.responseErrors.push(executableOrUnknownError);
                context.privateErrors.push(e);
            }
        }
    }
};

const deserializeAndValidateParams = <App extends MapObj, SharedData, ServerReq extends MkRequest, ServerResp extends MkResponse>(
    context: Context<App, SharedData, ServerReq, ServerResp>,
    executable: Executable,
) => {
    const fieldName = executable.inputFieldName;
    let params = executable.inHeader ? context.request.headers[fieldName] : context.request.body[fieldName];

    if (executable.inHeader) {
        if (typeof params === 'string') params = [params];
        else
            return context.responseErrors.push({
                statusCode: StatusCodes.BAD_REQUEST,
                message: `Invalid header '${fieldName}'. No header found with that name.`,
            });
    }

    if (!Array.isArray(params))
        return context.responseErrors.push({
            statusCode: StatusCodes.BAD_REQUEST,
            message: `Invalid input '${fieldName}', must be an array of parameters`,
        });

    if (params.length !== executable.paramValidators.length)
        return context.responseErrors.push({
            statusCode: StatusCodes.BAD_REQUEST,
            message: `Invalid input '${fieldName}', missing or invalid number of input parameters`,
        });

    if (!params.length) return;

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
    }

    if (routerOptions.enableValidation) {
        try {
            const errors = validateParams(executable, params);
            context.responseErrors.push(...errors);
            context.privateErrors.push(...errors);
        } catch (e) {
            return context.responseErrors.push({
                statusCode: StatusCodes.BAD_REQUEST,
                message: `Invalid input '${fieldName}', can not validate parameters.`,
            });
        }
    }
};

const serializeResponse = <App extends MapObj, SharedData, ServerReq extends MkRequest, ServerResp extends MkResponse>(
    context: Context<App, SharedData, ServerReq, ServerResp>,
    executable: Executable,
    result: any,
) => {
    if (!executable.canReturnData || result === undefined) return;
    const deserialized = routerOptions.enableSerialization ? executable.outputSerializer(result) : result;
    if (executable.inHeader) context.reply.headers[executable.outputFieldName] = deserialized;
    else context.reply.body[executable.outputFieldName] = deserialized;
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
        paramValidators: getParamValidators(handler, routerOptions),
        paramsDeSerializers: getParamsDeserializer(handler, routerOptions),
        outputSerializer: getOutputSerializer(handler, routerOptions),
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
        paramValidators: getParamValidators(handler, routerOptions),
        paramsDeSerializers: getParamsDeserializer(handler, routerOptions),
        outputSerializer: getOutputSerializer(handler, routerOptions),
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

// const routeError = (statusCode: number, message: string): MkResponse => {
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
