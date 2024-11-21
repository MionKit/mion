/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export const JitFnNames = {
    1: 'isType',
    2: 'typeErrors',
    3: 'jsonEncode',
    4: 'jsonDecode',
    5: 'jsonStringify',
    6: 'unknownKeyErrors',
    7: 'hasUnknownKeys',
    8: 'stripUnknownKeys',
    9: 'unknownKeysToUndefined',
} as const;

export const JitFnIDs = {
    isType: 1,
    typeErrors: 2,
    jsonEncode: 3,
    jsonDecode: 4,
    jsonStringify: 5,
    unknownKeyErrors: 6,
    hasUnknownKeys: 7,
    stripUnknownKeys: 8,
    unknownKeysToUndefined: 9,
} as const;

export const defaultJitFnHasReturn = {
    isType: false,
    typeErrors: false,
    jsonEncode: false,
    jsonDecode: false,
    jsonStringify: false,
    unknownKeyErrors: false,
    hasUnknownKeys: false,
    stripUnknownKeys: false,
    unknownKeysToUndefined: false,
} as const;

export const defaultJitFnIsExpression = {
    isType: true,
    typeErrors: false,
    jsonEncode: false,
    jsonDecode: false,
    jsonStringify: true,
    unknownKeyErrors: false,
    hasUnknownKeys: true,
    stripUnknownKeys: false,
    unknownKeysToUndefined: false,
} as const;

export const validPropertyNameRegExp = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export const jitNames = {
    utils: 'utl',
};

export const minKeysForSet = 30;
export const maxUnknownKeys = 10;
export const maxStackDepth = 50;
export const maxStackErrorMessage =
    'Max compilation nested level reached, either you have a very deeply nested type or there is an error related to circular references un the types.';

export const jitArgs = {vλl: 'v'} as const;
export const jitDefaultArgs = {vλl: null} as const;
export const jitErrorArgs = {vλl: 'v', pλth: 'pth', εrr: 'er'} as const;
export const jitDefaultErrorArgs = {vλl: null, pλth: '[]', εrr: '[]'} as const;
