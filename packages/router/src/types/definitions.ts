/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Handler, HeaderHandler, RawHookHandler} from './handlers';
import {HeaderProcedure, HookProcedure, RawProcedure, RouteProcedure} from './procedures';

// #######  Routes Definitions #######

/** Route definition */
export type RouteDef<H extends Handler = any> = Pick<RouteProcedure<H>, 'type' | 'handler' | 'canReturnData' | 'forceRunOnError'>;

/** Hook definition, a function that hooks into the execution path */
export type HookDef<H extends Handler = any> = Pick<HookProcedure<H>, 'type' | 'handler' | 'forceRunOnError'>;

/** Header Hook definition, used to handle header params */
export type HeaderHookDef<H extends HeaderHandler = any> = Pick<
    HeaderProcedure<H>,
    'type' | 'handler' | 'forceRunOnError' | 'headerName'
>;

/**
 * Raw hook, used only to access raw request/response and modify the call context.
 * Can not declare extra parameters.
 */
export type RawHookDef<H extends RawHookHandler = any> = Pick<
    RawProcedure<H>,
    'type' | 'handler' | 'forceRunOnError' | 'canReturnData' | 'enableSerialization' | 'enableValidation'
>;
