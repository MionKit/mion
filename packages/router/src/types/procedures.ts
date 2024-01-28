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
    runOnError: boolean;
    canReturnData: boolean;
    useValidation: boolean;
    useSerialization: boolean;
    headerName?: string;
    description?: string;
}
export interface RouteProcedure<H extends Handler = any> extends Procedure<H> {
    type: ProcedureType.route;
    handler: H;
    reflection: FunctionReflection;
    runOnError: false;
    canReturnData: true;
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
    canReturnData: false;
    handler: H;
    reflection: null;
    useValidation: false;
    useSerialization: false;
}
export interface NotFoundProcedure extends Procedure {
    is404: true;
}

export type RouteOptions = Partial<Pick<RouteProcedure, 'description' | 'useValidation' | 'useSerialization'>>;
export type HookOptions = Partial<Pick<HookProcedure, 'description' | 'useValidation' | 'useSerialization' | 'runOnError'>>;
export type HeaderHookOptions = Partial<
    Pick<HeaderProcedure, 'description' | 'useValidation' | 'useSerialization' | 'runOnError'>
>;
export type RawHookOptions = Partial<Pick<HeaderProcedure, 'description' | 'runOnError'>>;
