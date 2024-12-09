/* eslint-disable no-case-declarations */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeClass, TypeMethod, TypeObjectLiteral} from './_deepkit/src/reflection/type';
import {ReflectionKind} from './_deepkit/src/reflection/type';
import {ReflectionSubKind} from '../constants.kind';
import {JitFnIDs, nonSerializableClasses, nonSerializableGlobals} from '../constants';
/* IMPORTANT: import classes as type only to prevent js circular imports */
import type {MockOperation, MockOptions, RunType, RunTypeChildAccessor} from '../types';
import type {StringRunType} from '../runtypes/atomic/string';
import type {DateRunType} from '../runtypes/atomic/date';
import type {NumberRunType} from '../runtypes/atomic/number';
import type {BooleanRunType} from '../runtypes/atomic/boolean';
import type {NullRunType} from '../runtypes/atomic/null';
import type {BigIntRunType} from '../runtypes/atomic/bigInt';
import type {AnyRunType} from '../runtypes/atomic/any';
import type {UndefinedRunType} from '../runtypes/atomic/undefined';
import type {UnknownRunType} from '../runtypes/atomic/unknown';
import type {VoidRunType} from '../runtypes/atomic/void';
import type {ArrayRunType} from '../runtypes/member/array';
import type {LiteralRunType} from '../runtypes/atomic/literal';
import type {RegexpRunType} from '../runtypes/atomic/regexp';
import type {NeverRunType} from '../runtypes/atomic/never';
import type {EnumRunType} from '../runtypes/atomic/enum';
import type {EnumMemberRunType} from '../runtypes/atomic/enumMember';
import type {UnionRunType} from '../runtypes/collection/union';
import type {TupleRunType} from '../runtypes/collection/tuple';
import type {TupleMemberRunType} from '../runtypes/member/tupleMember';
import type {InterfaceRunType, InterfaceMember} from '../runtypes/collection/interface';
import type {PropertyRunType} from '../runtypes/member/property';
import type {IndexSignatureRunType} from '../runtypes/member/indexProperty';
import type {MethodSignatureRunType} from '../runtypes/member/methodSignature';
import type {CallSignatureRunType} from '../runtypes/member/callSignature';
import type {FunctionRunType} from '../runtypes/function/function';
import type {ParameterRunType} from '../runtypes/member/param';
import type {PromiseRunType} from '../runtypes/native/promise';
import type {ObjectRunType} from '../runtypes/atomic/object';
import type {MethodRunType} from '../runtypes/member/method';
import type {AtomicRunType, CollectionRunType, MemberRunType} from './baseRunTypes';
import type {BaseCompiler, JitErrorsCompiler} from './jitCompiler';
import type {ClassRunType} from '../runtypes/collection/class';
import type {IntersectionRunType} from '../runtypes/collection/intersection';
import type {SymbolRunType} from '../runtypes/atomic/symbol';

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
    return rt.getJitId() === ReflectionSubKind.date;
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

export function isAnyFunctionRunType(rt: RunType): rt is FunctionRunType<any> {
    return (rt.src as any).return?.kind !== undefined;
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

export function isObjectLiteralRunType(rt: RunType): rt is InterfaceRunType {
    return rt.src.kind === ReflectionKind.objectLiteral;
}

export function isClassRunType(rt: RunType): rt is ClassRunType {
    return rt.src.kind === ReflectionKind.class;
}

export function isIntersectionRunType(rt: RunType): rt is IntersectionRunType {
    return rt.src.kind === ReflectionKind.intersection;
}

export function isPropertyRunType(rt: RunType): rt is PropertyRunType {
    return rt.src.kind === ReflectionKind.property;
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

export function isJitErrorsCompiler(value: BaseCompiler): value is JitErrorsCompiler {
    return value.fnId === JitFnIDs.typeErrors || value.fnId === JitFnIDs.unknownKeyErrors;
}

export function isMockContext(k: Partial<MockOptions>): k is MockOperation {
    return (k as MockOperation).stack !== undefined;
}

export function isNonSerializableClass(src: TypeClass): boolean {
    return nonSerializableClasses.includes(src.classType);
}

export function isNonSerializableObject(src: TypeObjectLiteral): boolean {
    if (!src.typeName) return false;
    return nonSerializableGlobals.includes(src.typeName);
}
