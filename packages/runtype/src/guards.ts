/* eslint-disable no-case-declarations */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, TypeMethod} from './_deepkit/src/reflection/type';
/* IMPORTANT: import classes as type only to prevent js circular imports */
import type {RunType, RunTypeChildAccessor} from './types';
import type {StringRunType} from './atomicRunType/string';
import type {DateRunType} from './atomicRunType/date';
import type {NumberRunType} from './atomicRunType/number';
import type {BooleanRunType} from './atomicRunType/boolean';
import type {NullRunType} from './atomicRunType/null';
import type {BigIntRunType} from './atomicRunType/bigInt';
import type {SymbolRunType} from './atomicRunType/symbol';
import type {AnyRunType} from './atomicRunType/any';
import type {UndefinedRunType} from './atomicRunType/undefined';
import type {UnknownRunType} from './atomicRunType/unknown';
import type {VoidRunType} from './atomicRunType/void';
import type {ArrayRunType} from './memberRunType/array';
import type {LiteralRunType} from './atomicRunType/literal';
import type {RegexpRunType} from './atomicRunType/regexp';
import type {NeverRunType} from './atomicRunType/never';
import type {EnumRunType} from './atomicRunType/enum';
import type {EnumMemberRunType} from './atomicRunType/enumMember';
import type {UnionRunType} from './collectionRunType/union';
import type {TupleRunType} from './collectionRunType/tuple';
import type {TupleMemberRunType} from './memberRunType/tupleMember';
import type {InterfaceRunType, InterfaceMember} from './collectionRunType/interface';
import type {PropertyRunType} from './memberRunType/property';
import type {IndexSignatureRunType} from './memberRunType/indexProperty';
import type {MethodSignatureRunType} from './memberRunType/methodSignature';
import type {CallSignatureRunType} from './functionRunType/call';
import type {FunctionRunType} from './functionRunType/function';
import type {ParameterRunType} from './memberRunType/param';
import type {PromiseRunType} from './memberRunType/promise';
import type {ObjectRunType} from './atomicRunType/object';
import type {MethodRunType} from './memberRunType/method';
import type {AtomicRunType, CollectionRunType, MemberRunType} from './baseRunTypes';
import {dateJitId} from './constants';

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
    return isAtomicRunType(rt) && rt.getJitId() === dateJitId;
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

export function isConstructor(rt: InterfaceMember): rt is MethodSignatureRunType | MethodRunType {
    return (
        (rt.src.kind === ReflectionKind.method || rt.src.kind === ReflectionKind.methodSignature) &&
        (rt.src as TypeMethod).name === 'constructor'
    );
}

export function isChildAccessorType(rt: RunType): rt is RunTypeChildAccessor {
    return !!(rt as any as RunTypeChildAccessor).getChildVarName && !!(rt as any as RunTypeChildAccessor).getChildLiteral;
}

export function isAtomicRunType(rt: RunType): rt is AtomicRunType<any> {
    return rt.getFamily() === 'A';
}

export function isCollectionRunType(rt: RunType): rt is CollectionRunType<any> {
    return rt.getFamily() === 'C';
}

export function isMemberRunType(rt: RunType): rt is MemberRunType<any> {
    return rt.getFamily() === 'M';
}

export function isRunType(value: any): value is RunType {
    return typeof value?.src?.kind === 'number' && typeof value?.getJitId === 'function';
}
