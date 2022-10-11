/* ########
 * 2021 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Executable, Hook, RouteObject, RouterOptions, RoutesWithId} from './types';

export const ROUTE_INPUT_FIELD_NAME = 'input';
export const ROUTE_OUTPUT_FIELD_NAME = 'output';

export const DEFAULT_ROUTE: Readonly<Required<RouteObject>> = {
    path: '',
    inputFieldName: ROUTE_INPUT_FIELD_NAME,
    outputFieldName: ROUTE_OUTPUT_FIELD_NAME,
    route: () => null,
};
export const DEFAULT_HOOK: Readonly<Required<Hook>> = {
    stopOnError: true,
    forceRunOnError: false,
    canReturnData: false,
    returnInHeader: false,
    fieldName: '',
    hook: () => null,
};

export const DEFAULT_EXECUTABLE: Readonly<Required<Executable>> = {
    path: '',
    nestLevel: 0,
    stopOnError: true,
    forceRunOnError: false,
    canReturnData: false,
    returnInHeader: false,
    inputFieldName: '',
    outputFieldName: '',
    isRoute: false,
    handler: () => null,
};

export const DEFAULT_ROUTES_WITH_ID: Readonly<Required<RoutesWithId>> = {
    path: '',
    routes: {},
};

export const DEFAULT_ROUTE_OPTIONS: Readonly<Required<RouterOptions>> = {
    prefix: '',
    suffix: '',
};

export const ROUTE_KEYS = Object.keys(DEFAULT_ROUTE);
export const HOOK_KEYS = Object.keys(DEFAULT_HOOK);

export const MAX_ROUTE_NESTING = 10;
