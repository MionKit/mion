/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Executable, Hook, MkRequest, MkResponse, RouteObject, RouterOptions} from './types';

export const ROUTE_INPUT_FIELD_NAME = 'params';
export const ROUTE_OUTPUT_FIELD_NAME = 'response';

export const DEFAULT_ROUTE: Readonly<Required<RouteObject>> = {
    path: '',
    inputFieldName: ROUTE_INPUT_FIELD_NAME,
    outputFieldName: ROUTE_OUTPUT_FIELD_NAME,
    description: '',
    route: () => null,
};
export const DEFAULT_HOOK: Readonly<Required<Hook>> = {
    forceRunOnError: false,
    canReturnData: false,
    inHeader: false,
    fieldName: '',
    description: '',
    hook: () => null,
};

export const DEFAULT_EXECUTABLE: Readonly<Required<Executable>> = {
    path: '',
    nestLevel: 0,
    forceRunOnError: false,
    canReturnData: false,
    inHeader: false,
    inputFieldName: '',
    outputFieldName: '',
    isRoute: false,
    handler: () => null,
    paramValidators: [],
    paramsDeSerializers: [],
    outputSerializer: (a: any) => null as any,
    src: null as any,
};

export const DEFAULT_REQUEST: Readonly<Required<MkRequest>> = {
    headers: {},
    body: '{}',
};

export const DEFAULT_RESPONSE: Readonly<Required<MkResponse>> = {
    statusCode: 0,
    headers: {},
    body: null,
};

export const DEFAULT_ROUTE_OPTIONS: Readonly<RouterOptions> = {
    prefix: '',
    suffix: '',
    enableValidation: true,
    enableSerialization: true,
    serializationOptions: {
        loosely: false,
    },
};

export const ROUTE_KEYS = Object.keys(DEFAULT_ROUTE);
export const HOOK_KEYS = Object.keys(DEFAULT_HOOK);

export const MAX_ROUTE_NESTING = 10;
