/* eslint-disable no-case-declarations */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from './_deepkit/src/reflection/type';
import {RunType} from './types';
import {StringRunType} from './singleRunType/string';
import {DateRunType} from './singleRunType/date';
import {NumberRunType} from './singleRunType/number';
import {BooleanRunType} from './singleRunType/boolean';
import {NullRunType} from './singleRunType/null';
import {BigIntRunType} from './singleRunType/bigInt';
import {SymbolRunType} from './singleRunType/symbol';
import {AnyRunType} from './singleRunType/any';
import {UndefinedRunType} from './singleRunType/undefined';
import {UnknownRunType} from './singleRunType/unknown';
import {VoidRunType} from './singleRunType/void';
import {ArrayRunType} from './collectionRunType/array';
import {LiteralRunType} from './singleRunType/literal';
import {RegexpRunType} from './singleRunType/regexp';
import {NeverRunType} from './singleRunType/never';
import {EnumRunType} from './singleRunType/enum';
import {EnumMemberRunType} from './singleRunType/enumMember';
import {UnionRunType} from './collectionRunType/union';
import {TupleRunType} from './collectionRunType/tuple';
import {TupleMemberRunType} from './singleRunType/tupleMember';
import {InterfaceRunType} from './collectionRunType/interface';
import {PropertyRunType} from './collectionRunType/property';
import {IndexSignatureRunType} from './collectionRunType/indexProperty';
import {MethodSignatureRunType} from './functionRunType/methodSignature';
import {CallSignatureRunType} from './functionRunType/call';
import {FunctionRunType} from './functionRunType/function';
import {ParameterRunType} from './functionRunType/param';
import {PromiseRunType} from './singleRunType/promise';
import {ObjectRunType} from './singleRunType/object';

export function isAnyRunType(rt: RunType): rt is AnyRunType {
    return rt.kind === ReflectionKind.any;
}

export function isArrayRunType(rt: RunType): rt is ArrayRunType {
    return rt.kind === ReflectionKind.array;
}

export function isBigIntRunType(rt: RunType): rt is BigIntRunType {
    return rt.kind === ReflectionKind.bigint;
}

export function isBooleanRunType(rt: RunType): rt is BooleanRunType {
    return rt.kind === ReflectionKind.boolean;
}

export function isCallSignatureRunType(rt: RunType): rt is CallSignatureRunType {
    return rt.kind === ReflectionKind.callSignature;
}

export function isDateRunType(rt: RunType): rt is DateRunType {
    return rt.kind === ReflectionKind.class && rt.name === 'date';
}

export function isEnumRunType(rt: RunType): rt is EnumRunType {
    return rt.kind === ReflectionKind.enum;
}

export function isEnumMemberRunType(rt: RunType): rt is EnumMemberRunType {
    return rt.kind === ReflectionKind.enumMember;
}

export function isFunctionRunType(rt: RunType): rt is FunctionRunType<any> {
    return rt.kind === ReflectionKind.function;
}

export function isIndexSignatureRunType(rt: RunType): rt is IndexSignatureRunType {
    return rt.kind === ReflectionKind.indexSignature;
}

export function isLiteralRunType(rt: RunType): rt is LiteralRunType {
    return rt.kind === ReflectionKind.literal;
}

export function isMethodSignatureRunType(rt: RunType): rt is MethodSignatureRunType {
    return rt.kind === ReflectionKind.methodSignature;
}

export function isNullRunType(rt: RunType): rt is NullRunType {
    return rt.kind === ReflectionKind.null;
}

export function isNumberRunType(rt: RunType): rt is NumberRunType {
    return rt.kind === ReflectionKind.number;
}

export function isInterfaceRunType(rt: RunType): rt is InterfaceRunType {
    return rt.kind === ReflectionKind.objectLiteral;
}

export function isPropertySignatureRunType(rt: RunType): rt is PropertyRunType {
    return rt.kind === ReflectionKind.propertySignature;
}

export function isRegexpRunType(rt: RunType): rt is RegexpRunType {
    return rt.kind === ReflectionKind.regexp;
}

export function isStringRunType(rt: RunType): rt is StringRunType {
    return rt.kind === ReflectionKind.string;
}

export function isSymbolRunType(rt: RunType): rt is SymbolRunType {
    return rt.kind === ReflectionKind.symbol;
}

export function isTupleRunType(rt: RunType): rt is TupleRunType {
    return rt.kind === ReflectionKind.tuple;
}

export function isTupleMemberRunType(rt: RunType): rt is TupleMemberRunType {
    return rt.kind === ReflectionKind.tupleMember;
}

export function isUndefinedRunType(rt: RunType): rt is UndefinedRunType {
    return rt.kind === ReflectionKind.undefined;
}

export function isUnionRunType(rt: RunType): rt is UnionRunType {
    return rt.kind === ReflectionKind.union;
}

export function isUnknownRunType(rt: RunType): rt is UnknownRunType {
    return rt.kind === ReflectionKind.unknown;
}

export function isVoidRunType(rt: RunType): rt is VoidRunType {
    return rt.kind === ReflectionKind.void;
}

export function isNeverRunType(rt: RunType): rt is NeverRunType {
    return rt.kind === ReflectionKind.never;
}

export function isObjectRunType(rt: RunType): rt is ObjectRunType {
    return rt.kind === ReflectionKind.object;
}

export function isParameterRunType(rt: RunType): rt is ParameterRunType {
    return rt.kind === ReflectionKind.parameter;
}

export function isPromiseRunType(rt: RunType): rt is PromiseRunType {
    return rt.kind === ReflectionKind.promise;
}
