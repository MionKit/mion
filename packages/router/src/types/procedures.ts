// ####### Executables #######

import {FunctionReflection} from '@mionkit/reflection';
import {AnyHandler, Handler, HeaderHandler, RawHookHandler} from './handlers';

export enum ProcedureType {
    route = 1,
    hook = 2,
    headerHook = 3,
    rawHook = 4,
}

/** Contains the data of each hook or route, Used to generate the execution path for each route. */
export interface Procedure<H extends AnyHandler = any> {
    type: ProcedureType;
    id: string;
    // pointer to the src Hook or Route definition within the original Routers object, ie: ['users','getUser']
    pointer: string[];
    nestLevel: number;
    handler: H;
    reflection: FunctionReflection | null;
    headerName?: string;
    options: {
        runOnError?: boolean;
        canReturnData?: boolean;
        useValidation?: boolean;
        useSerialization?: boolean;
        description?: string;
    };
}
export interface RouteProcedure<H extends Handler = any> extends Procedure<H> {
    type: ProcedureType.route;
    handler: H;
    reflection: FunctionReflection;
    options: {
        runOnError: false;
        canReturnData: true;
        useValidation?: boolean;
        useSerialization?: boolean;
        description?: string;
    };
}
export interface HookProcedure<H extends Handler = any> extends Procedure<H> {
    type: ProcedureType.hook;
    handler: H;
    reflection: FunctionReflection;
}
export interface HeaderProcedure<H extends HeaderHandler = any> extends Procedure<H> {
    type: ProcedureType.headerHook;
    handler: H;
    headerName: string;
    reflection: FunctionReflection;
}
export interface RawProcedure<H extends RawHookHandler = any> extends Procedure<H> {
    type: ProcedureType.rawHook;
    handler: H;
    reflection: null;
    options: {
        runOnError?: boolean;
        canReturnData: false;
        useValidation: false;
        useSerialization: false;
        description?: string;
    };
}
export interface NotFoundProcedure extends Procedure {
    is404: true;
}

export type RouteOptions = Partial<Pick<RouteProcedure['options'], 'description' | 'useValidation' | 'useSerialization'>>;
export type HookOptions = Partial<
    Pick<HookProcedure['options'], 'description' | 'useValidation' | 'useSerialization' | 'runOnError'>
>;
export type HeaderHookOptions = Partial<
    Pick<HeaderProcedure['options'], 'description' | 'useValidation' | 'useSerialization' | 'runOnError'>
>;
export type RawHookOptions = Partial<Pick<HeaderProcedure['options'], 'description' | 'runOnError'>>;
