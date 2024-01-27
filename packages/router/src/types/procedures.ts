// ####### Executables #######

import {FunctionReflection} from '@mionkit/reflection';
import {AnyHandler, Handler, HeaderHandler, RawHookHandler} from './handlers';

export enum ProcedureType {
    route = 1,
    hook = 2,
    headerHook = 3,
    rawHook = 4,
} /** Contains the data of each hook or route, Used to generate the execution path for each route. */

export interface UnknownProcedure {
    type: ProcedureType;
    handler: AnyHandler;
    reflection: FunctionReflection | null;
    forceRunOnError: boolean;
    canReturnData: boolean;
    enableValidation: boolean;
    enableSerialization: boolean;
    headerName?: string;
}
export interface Procedure extends UnknownProcedure {
    id: string;
    /**
     * The pointer to the src Hook or Route definition within the original Routers object
     * ie: ['users','getUser']
     */
    pointer: string[];
    nestLevel: number;
}
export interface RouteProcedure extends Procedure {
    type: ProcedureType.route;
    handler: Handler;
    reflection: FunctionReflection;
    forceRunOnError: false;
    canReturnData: true;
}
export interface HookProcedure extends Procedure {
    type: ProcedureType.hook;
    handler: Handler;
    reflection: FunctionReflection;
}
export interface HeaderProcedure extends Procedure {
    type: ProcedureType.headerHook;
    handler: HeaderHandler;
    headerName: string;
    reflection: FunctionReflection;
}
export interface RawProcedure extends Procedure {
    type: ProcedureType.rawHook;
    canReturnData: false;
    handler: RawHookHandler;
    reflection: null;
}
export interface NotFoundProcedure extends Procedure {
    is404: true;
}
