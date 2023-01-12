/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {join} from 'path';
import {DEFAULT_ROUTE, DEFAULT_ROUTE_OPTIONS, MAX_ROUTE_NESTING, ROUTE_PATH_ROOT} from './constants';
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
    RouteDef,
    RouterOptions,
    Routes,
    MapObj,
    Request,
    SharedDataFactory,
    Response,
    RawCallContext,
    RouteError,
    Mutable,
    PublicError,
    RawRequest,
    NotNull,
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
import {reflect} from '@deepkit/type';
type RouterKeyEntryList = [string, Routes | Hook | Route][];
type RoutesWithId = {
    path: string;
    routes: Routes;
};

// ############# PUBLIC METHODS #############

export const addRoutes = (routes: Routes) => {
    recursiveFlatRoutes(routes);
};
export const getRouteExecutionPath = (path: string) => flatRouter.get(path);
export const getRouteEntries = () => flatRouter.entries();
export const geRoutesSize = () => flatRouter.size;
export const getRouteExecutable = (path: string) => routesByPath.get(path);
export const getHookExecutable = (fieldName: string) => hooksByFieldName.get(fieldName);
export const geHooksSize = () => hooksByFieldName.size;
export const getComplexity = () => complexity;
export const getRouterOptions = () => routerOptions;
export const setRouterOptions = <ServerReq extends Request = Request>(routerOptions_?: Partial<RouterOptions<ServerReq>>) => {
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
    // contextType = undefined;
    routerOptions = {
        ...DEFAULT_ROUTE_OPTIONS,
    };
};

/**
 * Initializes the Router.
 * @param app_
 * @param shredDataFactory_
 * @param routerOptions_
 * @returns
 */
export const initRouter = <
    App extends MapObj,
    SharedData,
    ServerReq extends RawRequest,
    ServerResp,
    ServerCallContext extends RawCallContext<ServerReq, ServerResp>
>(
    app_: App,
    shredDataFactory_?: SharedDataFactory<SharedData>,
    routerOptions_?: Partial<RouterOptions<RawRequest>>
) => {
    if (app) throw new Error('Context has been already defined');
    app = app_;
    sharedDataFactory = shredDataFactory_;
    setRouterOptions(routerOptions_);

    type CallContext = Handler<App, SharedData, ServerCallContext>;
    const voidHandler: CallContext = () => () => null;
    type ResolvedRunRoute = typeof runRoute<SharedData, ServerReq, ServerResp, ServerCallContext>;
    return {voidHandler, runRoute: runRoute as ResolvedRunRoute};
};

export const runRoute = async <
    SharedData,
    ServerReq extends RawRequest,
    ServerResp,
    ServerCallContext extends RawCallContext<ServerReq, ServerResp>
>(
    path: string,
    rawCallContext: ServerCallContext
): Promise<Response> => {
    if (!app) throw new Error('App has not been initialized');

    // context data
    const transformedPath = routerOptions.pathTransform ? routerOptions.pathTransform(path, rawCallContext.req) : path;
    const request = {
        path: transformedPath,
        internalErrors: [],
        headers: rawCallContext.req.headers || {},
        body: {},
    }; // satisfies Request
    const response = {
        statusCode: StatusCodes.OK,
        errors: [],
        headers: {},
        body: {},
        json: '',
    }; // satisfies Response
    const shared: SharedData = sharedDataFactory?.() || {};

    const executionPath = getRouteExecutionPath(transformedPath) || [];

    if (!executionPath.length) {
        const notFound = new RouteError(StatusCodes.NOT_FOUND, 'Route not found');
        handleRouteErrors(request, response, notFound, 0);
    } else {
        parseRequestBody(request, response, rawCallContext);
        // ### runs execution path
        for (let index = 0; index < executionPath.length; index++) {
            const executable = executionPath[index];
            if (response.errors.length && !executable.forceRunOnError) continue;

            try {
                const handlerParams = getValidatedHandlerParams(request, executable);
                if (executable.inHeader) request.headers[executable.fieldName] = handlerParams;
                else request.body[executable.fieldName] = handlerParams;
                if (executable.isAsync) {
                    const remoteHandler = executable.handler(app, shared, request, response, rawCallContext);
                    if (remoteHandler) {
                        const result = await remoteHandler(...handlerParams);
                        serializeResponse(response, executable, result);
                    }
                } else {
                    const remoteHandler = executable.handler(app, shared, request, response, rawCallContext);
                    if (remoteHandler) {
                        const result = remoteHandler(...handlerParams);
                        serializeResponse(response, executable, result);
                    }
                }
            } catch (err: any | RouteError | Error) {
                handleRouteErrors(request, response, err, index);
            }
        }
    }

    const respBody: MapObj = response.body;
    if (response.errors.length) {
        respBody.errors = response.errors;
    }
    (response.json as Mutable<string>) = routerOptions.bodyParser.stringify(respBody);

    return response;
};

const parseRequestBody = (request: NotNull<Request>, response: NotNull<Response>, rawCallContext: RawCallContext) => {
    if (!rawCallContext.req.body || rawCallContext.req.body === '{}') return;
    try {
        if (typeof rawCallContext.req.body === 'string') {
            const parsedBody = routerOptions.bodyParser.parse(rawCallContext.req.body);
            if (typeof parsedBody !== 'object')
                throw new RouteError(
                    StatusCodes.BAD_REQUEST,
                    'Wrong parsed body type. Expecting an object containing the route name and parameters.'
                );
            (request as Mutable<MapObj>).body = parsedBody;
        } else if (typeof rawCallContext.req.body === 'object') {
            // lets assume the body has been already parsed
            (request as Mutable<MapObj>).body = rawCallContext.req.body;
        } else {
            throw new RouteError(StatusCodes.BAD_REQUEST, 'Wrong request.body, only strings allowed.');
        }
    } catch (err: any) {
        if (!(err instanceof RouteError)) {
            handleRouteErrors(
                request,
                response,
                new RouteError(StatusCodes.BAD_REQUEST, `Invalid request body: ${err?.message || 'unknown parsing error.'}`),
                0
            );
        }
        handleRouteErrors(request, response, err, 0);
    }
};

const getValidatedHandlerParams = (request: NotNull<Request>, executable: Executable): any[] => {
    const fieldName = executable.fieldName;
    let params;

    if (executable.inHeader) {
        params = request.headers[fieldName];
        if (typeof params === 'string') return [params];
        else if (Array.isArray(params)) return [params.join(',')]; // node http headers could be an array of strings
        else throw new RouteError(StatusCodes.BAD_REQUEST, `Invalid header '${fieldName}'. No header found with that name.`);
    }

    // defaults to an empty array if required field is omitted from body
    params = request.body[fieldName] ?? [];

    if (!Array.isArray(params))
        throw new RouteError(
            StatusCodes.BAD_REQUEST,
            `Invalid input '${fieldName}'. input parameters can only be sent in an array.`
        );

    // if there are no params input field can be omitted
    if (!params.length && !executable.paramsDeSerializers.length) return params;

    if (params.length !== executable.paramValidators.length)
        throw new RouteError(
            StatusCodes.BAD_REQUEST,
            `Invalid input '${fieldName}', missing or invalid number of input parameters`
        );

    if (routerOptions.enableSerialization) {
        try {
            params = deserializeParams(executable, params);
        } catch (e) {
            throw new RouteError(
                StatusCodes.BAD_REQUEST,
                `Invalid input '${fieldName}', can not deserialize. Parameters might be of the wrong type.`
            );
        }
    }

    if (routerOptions.enableValidation) {
        const validationErrorMessages = validateParams(executable, params);
        if (validationErrorMessages?.length) {
            throw new RouteError(StatusCodes.BAD_REQUEST, validationErrorMessages.join(' | '));
        }
    }

    return params;
};

const serializeResponse = (response: NotNull<Response>, executable: Executable, result: any) => {
    if (!executable.canReturnData || result === undefined) return;
    const deserialized = routerOptions.enableSerialization ? executable.outputSerializer(result) : result;
    if (executable.inHeader) response.headers[executable.fieldName] = deserialized;
    else (response as Mutable<MapObj>).body[executable.fieldName] = deserialized;
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
// let contextType: Type | undefined;
let routerOptions: RouterOptions = {
    ...DEFAULT_ROUTE_OPTIONS,
};

// ############# PRIVATE METHODS #############

const recursiveFlatRoutes = (
    routes: Routes,
    currentPath = '',
    preHooks: Executable[] = [],
    postHooks: Executable[] = [],
    nestLevel = 0
) => {
    if (nestLevel > MAX_ROUTE_NESTING)
        throw new Error('Too many nested routes, you can only nest routes ${MAX_ROUTE_NESTING} levels');

    const entries = Object.entries(routes);
    if (entries.length === 0) throw new Error(`Invalid route: ${currentPath || 'root Object'}. Can Not define empty routes`);

    let minus1Props: ReturnType<typeof getRouteEntryProperties> | null = null;
    entries.forEach(([key, item], index, array) => {
        // create the executable items
        const path = join(currentPath, `${key}`);
        let routeEntry: Executable | RoutesWithId;
        if (typeof key !== 'string' || !isNaN(key as any))
            throw new Error(`Invalid route: ${path}. Numeric route names are not allowed`);

        if (isHook(item)) {
            routeEntry = getExecutableFromHook(item, path, nestLevel, key);
            const fieldName = routeEntry.fieldName;
            if (hookNames.has(fieldName))
                throw new Error(
                    `Invalid hook: ${path}. Naming collision, the fieldName '${fieldName}' has been used in more than one hook/route.`
                );
            hookNames.set(fieldName, true);
        } else if (isRoute(item)) {
            routeEntry = getExecutableFromRoute(item, path, nestLevel);
            if (routeNames.has(routeEntry.path)) throw new Error(`Invalid route: ${path}. Naming collision, duplicated route`);
            routeNames.set(routeEntry.path, true);
        } else if (isRoutes(item)) {
            routeEntry = {
                path,
                routes: item,
            };
        } else {
            const itemType = typeof item;
            throw new Error(`Invalid route: ${path}. Type <${itemType}> is not a valid route.`);
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
            minus1Props
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
    minus1Props: ReturnType<typeof getRouteEntryProperties> | null
) => {
    const minus1 = getEntry(index - 1, routeKeyedEntries);
    const plus1 = getEntry(index + 1, routeKeyedEntries);
    const props = getRouteEntryProperties(minus1, routeEntry, plus1);

    if (props.isBetweenRoutes && minus1Props) {
        props.preLevelHooks = minus1Props.preLevelHooks;
        props.postLevelHooks = minus1Props.postLevelHooks;
    } else {
        routeKeyedEntries.forEach(([k, entry], i) => {
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
            nestLevel + 1
        );
    }

    return props;
};

const getHandler = (entry: Hook | Route, path): Handler => {
    const handler = isHandler(entry) ? entry : (entry as Hook).hook || (entry as RouteDef).route;
    if (!isHandler(handler)) throw new Error(`Invalid route: ${path}. Missing route handler`);
    return handler;
};

const getExecutableFromHook = (hook: Hook, path: string, nestLevel: number, key: string) => {
    const hookName = getHookFieldName(hook, key);
    const existing = hooksByFieldName.get(hookName);
    if (existing) {
        return existing;
    }
    const handler = getHandler(hook, path);

    if (!!hook.inHeader && handler.length > 2) {
        throw new Error(`Invalid Hook: ${path}. In header hooks can only have a single parameter besides the Context.`);
    }

    if (hookName === 'errors') {
        throw new Error(`Invalid Hook: ${path}. The 'errors' fieldName is reserver for the router.`);
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
        enableValidation: hook.enableValidation ?? routerOptions.enableValidation,
        enableSerialization: hook.enableSerialization ?? routerOptions.enableSerialization,
        src: hook,
    };
    delete (executable as any).hook;
    hooksByFieldName.set(hookName, executable);
    return executable;
};

const getExecutableFromRoute = (route: Route, path: string, nestLevel: number) => {
    const routePath = getRoutePath(path);
    const existing = routesByPath.get(routePath);
    if (existing) return existing;
    const handler = getHandler(route, routePath);
    // TODO: Not sure if bellow code is required. using the wrong context type is a big fail and should be catch during dev
    // TODO: fix should be just to use correct context type
    // if (!contextType) throw new Error('Context must be defined before creating routes.'); // this  should not happen
    // if (!isFirstParameterContext(contextType, handler))
    //     throw new Error(`Invalid route: ${path}. First parameter the handler must be of Type ${contextType.typeName},`);
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
        enableValidation: (route as RouteDef).enableValidation ?? routerOptions.enableValidation,
        enableSerialization: (route as RouteDef).enableSerialization ?? routerOptions.enableSerialization,
        src: routeObj,
    };
    delete (executable as any).route;
    routesByPath.set(routePath, executable);
    return executable;
};

const getRoutePath = (path: string) => {
    const routePath = join(ROUTE_PATH_ROOT, routerOptions.prefix, path);
    return routerOptions.suffix ? routePath + routerOptions.suffix : routePath;
};

const getEntry = (index, keyEntryList: RouterKeyEntryList) => {
    return keyEntryList[index]?.[1];
};

const getRouteEntryProperties = (
    minus1: Routes | Hook | Route | undefined,
    zero: Executable | RoutesWithId,
    plus1: Routes | Hook | Route | undefined
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

const handleRouteErrors = (request: Request, response: Response, err: any, step: number) => {
    if (err instanceof RouteError) {
        // creating a new err object only with only statusCode and message.
        // So can't leak any other properties accidentally
        const publicError = {statusCode: err.statusCode, message: err.message};
        (response.errors as Mutable<PublicError[]>).push(publicError);
        (request.internalErrors as Mutable<RouteError[]>).push(err);
    } else {
        const publicError = {
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            message: `Unknown error in step ${step} of execution path.`,
        };
        let srcError: Error;
        if (err instanceof Error) {
            srcError = err;
        } else if (typeof err === 'string') {
            srcError = new Error(err);
        } else {
            srcError = new Error(`Unknown error in step ${step} of execution path.`);
        }
        const privateError: RouteError = new RouteError(publicError.statusCode, publicError.message, undefined, srcError);
        (response.errors as Mutable<PublicError[]>).push(publicError);
        (request.internalErrors as Mutable<RouteError[]>).push(privateError);
    }
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
