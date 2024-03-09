/* eslint-disable no-case-declarations */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, Type, TypeClass} from '@deepkit/type';
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
import {ObjectLiteralRunType} from './collectionRunType/objectLiteral';
import {PropertySignatureRunType} from './singleRunType/property';
import {IndexSignatureRunType} from './collectionRunType';
import {MethodSignatureRunType} from './functionRunType/method';
import {CallSignatureRunType} from './functionRunType/call';
import {FunctionRunType} from './functionRunType/function';

export function isAnyRunType(rt: RunType | Type): rt is AnyRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.any;
}

export function isArrayRunType(rt: RunType | Type): rt is ArrayRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.array;
}

export function isBigIntRunType(rt: RunType | Type): rt is BigIntRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.bigint;
}

export function isBooleanRunType(rt: RunType | Type): rt is BooleanRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.boolean;
}

export function isCallSignatureRunType(rt: RunType | Type): rt is CallSignatureRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.callSignature;
}

export function isDateRunType(rt: RunType | Type): rt is DateRunType {
    const src: TypeClass = typeof (rt as Type).kind === 'undefined' ? ((rt as RunType).src as TypeClass) : (rt as TypeClass);
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.class && src.classType === Date;
}

export function isEnumRunType(rt: RunType | Type): rt is EnumRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.enum;
}

export function isEnumMemberRunType(rt: RunType | Type): rt is EnumMemberRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.enumMember;
}

export function isFunctionRunType(rt: RunType | Type): rt is FunctionRunType<any> {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.function;
}

export function isIndexSignatureRunType(rt: RunType | Type): rt is IndexSignatureRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.indexSignature;
}

export function isLiteralRunType(rt: RunType | Type): rt is LiteralRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.literal;
}

export function isMethodSignatureRunType(rt: RunType | Type): rt is MethodSignatureRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.methodSignature;
}

export function isNullRunType(rt: RunType | Type): rt is NullRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.null;
}

export function isNumberRunType(rt: RunType | Type): rt is NumberRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.number;
}

export function isObjectLiteralRunType(rt: RunType | Type): rt is ObjectLiteralRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.objectLiteral;
}

export function isPropertySignatureRunType(rt: RunType | Type): rt is PropertySignatureRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.propertySignature;
}

export function isRegexpRunType(rt: RunType | Type): rt is RegexpRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.regexp;
}

export function isStringRunType(rt: RunType | Type): rt is StringRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.string;
}

export function isSymbolRunType(rt: RunType | Type): rt is SymbolRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.symbol;
}

export function isTupleRunType(rt: RunType | Type): rt is TupleRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.tuple;
}

export function isTupleMemberRunType(rt: RunType | Type): rt is TupleMemberRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.tupleMember;
}

export function isUndefinedRunType(rt: RunType | Type): rt is UndefinedRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.undefined;
}

export function isUnionRunType(rt: RunType | Type): rt is UnionRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.union;
}

export function isUnknownRunType(rt: RunType | Type): rt is UnknownRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.unknown;
}

export function isVoidRunType(rt: RunType | Type): rt is VoidRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.void;
}

export function isNeverRunType(rt: RunType | Type): rt is NeverRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.never;
}

export function isObjectRunType(rt: RunType | Type): rt is ObjectRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.object;
}

export function isParameterRunType(rt: RunType | Type): rt is ParameterRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.parameter;
}

export function isPromiseRunType(rt: RunType | Type): rt is PromiseRunType {
    const kind: ReflectionKind = (rt as Type).kind || (rt as RunType).src.kind;
    return kind === ReflectionKind.promise;
}
