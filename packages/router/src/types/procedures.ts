// ####### Executables #######

import {JITFunctions} from '@mionkit/runtype';
import {AnyHandler, Handler, HeaderHandler, RawHookHandler} from './handlers';

export enum ProcedureType {
    route = 1,
    hook = 2,
    headerHook = 3,
    rawHook = 4,
}

export interface ProcedureOptions {
    runOnError?: boolean;
    hasReturnData?: boolean;
    validateParams?: boolean;
    deserializeParams?: boolean;
    validateReturn?: boolean;
    serializeReturn?: boolean;
    description?: string;
    isAsync?: boolean;
}

/** Contains the data of each hook or route, Used to generate the execution path for each route. */
export interface Procedure<H extends AnyHandler = any> {
    type: ProcedureType;
    id: string;
    // pointer to the src Hook or Route definition within the original Routers object, ie: ['users','getUser']
    pointer: string[];
    nestLevel: number;
    handler: H;
    paramsJitFns?: JITFunctions;
    returnJitFns?: JITFunctions;
    paramNames?: string[];
    headerName?: string;
    options: ProcedureOptions;
}

export interface NonRawProcedure<H extends Handler = any> extends Procedure<H> {
    paramsJitFns: JITFunctions;
    returnJitFns: JITFunctions;
    paramNames: string[];
}
export interface RouteProcedure<H extends Handler = any> extends Procedure<H> {
    type: ProcedureType.route;
    handler: H;
    paramsJitFns: JITFunctions;
    returnJitFns: JITFunctions;
    paramNames: string[];
    options: ProcedureOptions & {runOnError: false};
}
export interface HookProcedure<H extends Handler = any> extends Procedure<H> {
    type: ProcedureType.hook;
    handler: H;
    paramsJitFns: JITFunctions;
    returnJitFns: JITFunctions;
    paramNames: string[];
}
export interface HeaderProcedure<H extends HeaderHandler = any> extends Procedure<H> {
    type: ProcedureType.headerHook;
    handler: H;
    headerName: string;
    paramsJitFns: JITFunctions;
    returnJitFns: JITFunctions;
    paramNames: string[];
}
export interface RawProcedure<H extends RawHookHandler = any> extends Procedure<H> {
    type: ProcedureType.rawHook;
    handler: H;
    paramsJitFns: undefined;
    returnJitFns: undefined;
    paramNames: undefined;
    options: ProcedureOptions & {
        hasReturnData: false;
        validateParams: false;
        deserializeParams: false;
        validateReturn?: false;
        serializeReturn?: false;
    };
}
export interface NotFoundProcedure extends Procedure {
    is404: true;
}

export type RouteOptions = Partial<
    Pick<
        RouteProcedure['options'],
        'description' | 'validateParams' | 'deserializeParams' | 'validateReturn' | 'serializeReturn' | 'isAsync'
    >
>;
export type HookOptions = Partial<
    Pick<
        HookProcedure['options'],
        'description' | 'validateParams' | 'deserializeParams' | 'validateReturn' | 'serializeReturn' | 'runOnError' | 'isAsync'
    >
>;
export type HeaderHookOptions = Partial<
    Pick<
        HeaderProcedure['options'],
        'description' | 'validateParams' | 'deserializeParams' | 'runOnError' | 'validateReturn' | 'serializeReturn' | 'isAsync'
    >
>;
export type RawHookOptions = Partial<Pick<RawProcedure['options'], 'description' | 'runOnError' | 'isAsync'>>;

export interface ProcedureExecutionPath {
    routeIndex: number;
    procedures: Procedure[];
}
