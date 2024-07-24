/* eslint-disable no-case-declarations */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, TypeMethod} from './_deepkit/src/reflection/type';
/* IMPORTANT: import classes as type only to prevent js circular imports */
import type {RunType} from './types';
import type {StringRunType} from './singleRunType/string';
import type {DateRunType} from './singleRunType/date';
import type {NumberRunType} from './singleRunType/number';
import type {BooleanRunType} from './singleRunType/boolean';
import type {NullRunType} from './singleRunType/null';
import type {BigIntRunType} from './singleRunType/bigInt';
import type {SymbolRunType} from './singleRunType/symbol';
import type {AnyRunType} from './singleRunType/any';
import type {UndefinedRunType} from './singleRunType/undefined';
import type {UnknownRunType} from './singleRunType/unknown';
import type {VoidRunType} from './singleRunType/void';
import type {ArrayRunType} from './collectionRunType/array';
import type {LiteralRunType} from './singleRunType/literal';
import type {RegexpRunType} from './singleRunType/regexp';
import type {NeverRunType} from './singleRunType/never';
import type {EnumRunType} from './singleRunType/enum';
import type {EnumMemberRunType} from './singleRunType/enumMember';
import type {UnionRunType} from './collectionRunType/union';
import type {TupleRunType} from './collectionRunType/tuple';
import type {TupleMemberRunType} from './collectionRunType/tupleMember';
import type {InterfaceRunType, InterfaceRunTypeEntry} from './collectionRunType/interface';
import type {PropertyRunType} from './collectionRunType/property';
import type {IndexSignatureRunType} from './collectionRunType/indexProperty';
import type {MethodSignatureRunType} from './functionRunType/methodSignature';
import type {CallSignatureRunType} from './functionRunType/call';
import type {FunctionRunType} from './functionRunType/function';
import type {ParameterRunType} from './functionRunType/param';
import type {PromiseRunType} from './singleRunType/promise';
import type {ObjectRunType} from './singleRunType/object';
import type {MethodRunType} from './functionRunType/method';

export function isAnyRunType(rt: RunType): rt is AnyRunType {
    return rt.src.kind === ReflectionKind.any;
}

export function isArrayRunType(rt: RunType): rt is ArrayRunType {
    return rt.src.kind === ReflectionKind.array;
}

export function isBigIntRunType(rt: RunType): rt is BigIntRunType {
    return rt.src.kind === ReflectionKind.bigint;
}

export function isBooleanRunType(rt: RunType): rt is BooleanRunType {
    return rt.src.kind === ReflectionKind.boolean;
}

export function isCallSignatureRunType(rt: RunType): rt is CallSignatureRunType {
    return rt.src.kind === ReflectionKind.callSignature;
}

export function isDateRunType(rt: RunType): rt is DateRunType {
    return rt.src.kind === ReflectionKind.class && rt.getJitId() === 'date';
}

export function isEnumRunType(rt: RunType): rt is EnumRunType {
    return rt.src.kind === ReflectionKind.enum;
}

export function isEnumMemberRunType(rt: RunType): rt is EnumMemberRunType {
    return rt.src.kind === ReflectionKind.enumMember;
}

export function isFunctionRunType(rt: RunType): rt is FunctionRunType<any> {
    return rt.src.kind === ReflectionKind.function;
}

export function isIndexSignatureRunType(rt: RunType): rt is IndexSignatureRunType {
    return rt.src.kind === ReflectionKind.indexSignature;
}

export function isLiteralRunType(rt: RunType): rt is LiteralRunType {
    return rt.src.kind === ReflectionKind.literal;
}

export function isMethodSignatureRunType(rt: RunType): rt is MethodSignatureRunType {
    return rt.src.kind === ReflectionKind.methodSignature;
}

export function isNullRunType(rt: RunType): rt is NullRunType {
    return rt.src.kind === ReflectionKind.null;
}

export function isNumberRunType(rt: RunType): rt is NumberRunType {
    return rt.src.kind === ReflectionKind.number;
}

export function isInterfaceRunType(rt: RunType): rt is InterfaceRunType {
    return rt.src.kind === ReflectionKind.objectLiteral;
}

export function isPropertySignatureRunType(rt: RunType): rt is PropertyRunType {
    return rt.src.kind === ReflectionKind.propertySignature;
}

export function isRegexpRunType(rt: RunType): rt is RegexpRunType {
    return rt.src.kind === ReflectionKind.regexp;
}

export function isStringRunType(rt: RunType): rt is StringRunType {
    return rt.src.kind === ReflectionKind.string;
}

export function isSymbolRunType(rt: RunType): rt is SymbolRunType {
    return rt.src.kind === ReflectionKind.symbol;
}

export function isTupleRunType(rt: RunType): rt is TupleRunType {
    return rt.src.kind === ReflectionKind.tuple;
}

export function isTupleMemberRunType(rt: RunType): rt is TupleMemberRunType {
    return rt.src.kind === ReflectionKind.tupleMember;
}

export function isUndefinedRunType(rt: RunType): rt is UndefinedRunType {
    return rt.src.kind === ReflectionKind.undefined;
}

export function isUnionRunType(rt: RunType): rt is UnionRunType {
    return rt.src.kind === ReflectionKind.union;
}

export function isUnknownRunType(rt: RunType): rt is UnknownRunType {
    return rt.src.kind === ReflectionKind.unknown;
}

export function isVoidRunType(rt: RunType): rt is VoidRunType {
    return rt.src.kind === ReflectionKind.void;
}

export function isNeverRunType(rt: RunType): rt is NeverRunType {
    return rt.src.kind === ReflectionKind.never;
}

export function isObjectRunType(rt: RunType): rt is ObjectRunType {
    return rt.src.kind === ReflectionKind.object;
}

export function isParameterRunType(rt: RunType): rt is ParameterRunType {
    return rt.src.kind === ReflectionKind.parameter;
}

export function isPromiseRunType(rt: RunType): rt is PromiseRunType {
    return rt.src.kind === ReflectionKind.promise;
}

export function isConstructor(rt: InterfaceRunTypeEntry): rt is MethodSignatureRunType | MethodRunType {
    return (
        (rt.src.kind === ReflectionKind.method || rt.src.kind === ReflectionKind.methodSignature) &&
        (rt.src as TypeMethod).name === 'constructor'
    );
}
