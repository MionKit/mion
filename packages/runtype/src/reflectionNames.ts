/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from './_deepkit/src/reflection/type';
import {isDateRunType} from './guards';
import {RunType} from './types';

export const ReflectionNames: {[key: number]: keyof typeof ReflectionKind} = {
    0: 'never',
    1: 'any',
    2: 'unknown',
    3: 'void',
    4: 'object',
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
    30: 'objectLiteral',
    31: 'indexSignature',
    32: 'propertySignature',
    33: 'methodSignature',
    34: 'infer',
    35: 'callSignature',
};

// ReflectionKind from deepkit is extended with the following sub kinds
export const ReflectionSubKinds = {
    // group of sub-kinds that extends ReflectionKind.class
    date: 20_001,
    map: 20_002,
    set: 20_003,
};

export const ReflectionSubNames: {[key: number]: keyof typeof ReflectionSubKinds} = {
    20_001: 'date',
    20_002: 'map',
    20_003: 'set',
};

type AnyKind = keyof typeof ReflectionKind | keyof typeof ReflectionSubKinds;

export function getReflectionName(rt: RunType): AnyKind {
    switch (rt.src.kind) {
        case ReflectionKind.class:
            if (isDateRunType(rt)) return ReflectionSubNames[ReflectionSubKinds.date];
            // TODO: add map and set
            return ReflectionNames[rt.src.kind];
        default:
            return ReflectionNames[rt.src.kind];
    }
}
