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
    forceRunOnError: boolean;
    canReturnData: boolean;
    enableValidation: boolean;
    enableSerialization: boolean;
    headerName?: string;
    description?: string;
}
export interface RouteProcedure<H extends Handler = any> extends Procedure<H> {
    type: ProcedureType.route;
    handler: H;
    reflection: FunctionReflection;
    forceRunOnError: false;
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
    enableValidation: false;
    enableSerialization: false;
}
export interface NotFoundProcedure extends Procedure {
    is404: true;
}

export type RouteProcedureOptions = Partial<Pick<RouteProcedure, 'description' | 'enableValidation' | 'enableSerialization'>>;
export type HookProcedureOptions = Partial<
    Pick<HookProcedure, 'description' | 'enableValidation' | 'enableSerialization' | 'forceRunOnError'>
>;
export type HeaderProcedureOptions = Partial<
    Pick<HeaderProcedure, 'description' | 'enableValidation' | 'enableSerialization' | 'forceRunOnError'>
>;
export type RawProcedureOptions = Partial<Pick<HeaderProcedure, 'description' | 'forceRunOnError'>>;
