/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from './lib/_deepkit/src/reflection/type';
import {RunType} from './types';

export const ReflectionKindName: {[key: number]: keyof typeof ReflectionKind} = {
    0: 'never',
    1: 'any',
    2: 'unknown',
    3: 'void',
    4: 'objectLiteral', // name was changed from 'object' to 'objectLiteral'
    5: 'string',
    6: 'number',
    7: 'boolean',
    8: 'symbol',
    9: 'bigint',
    10: 'null',
    11: 'undefined',
    12: 'regexp',
    13: 'literal',
    14: 'templateLiteral',
    15: 'property',
    16: 'method',
    17: 'function',
    18: 'parameter',
    19: 'promise',
    20: 'class',
    21: 'typeParameter',
    22: 'enum',
    23: 'union',
    24: 'intersection',
    25: 'array',
    26: 'tuple',
    27: 'tupleMember',
    28: 'enumMember',
    29: 'rest',
    30: 'object', // name was changed from 'objectLiteral' to 'object'
    31: 'indexSignature',
    32: 'propertySignature',
    33: 'methodSignature',
    34: 'infer',
    35: 'callSignature',
};

// ReflectionKind from deepkit is extended with the following sub kinds
export const ReflectionSubKind = {
    // group of sub-kinds that extends ReflectionKind.class
    date: 20_01,
    map: 20_02,
    set: 20_03,

    functionParams: 17_01,
    mapKey: 18_01,
    mapValue: 18_02,
    setItem: 18_03,
} as const;

export const ReflectionSubNames: {[key: number]: keyof typeof ReflectionSubKind} = {
    20_01: 'date',
    20_02: 'map',
    20_03: 'set',
    17_01: 'functionParams',
} as const;

type AnyKindName = keyof typeof ReflectionKind | keyof typeof ReflectionSubKind;

export function getReflectionName(rt: RunType): AnyKindName {
    if (rt.src.subKind) return ReflectionSubNames[rt.src.subKind];
    return ReflectionKindName[rt.src.kind];
}
