/* eslint-disable no-case-declarations */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Type, TypeClass, TypeMethod, TypeObjectLiteral, TypeParameter} from '@deepkit/type';
import type {AnyClass, FormatParamMeta, TypeFormatValue} from '@mionjs/core';
import {isType, ReflectionKind} from '@deepkit/type';
import {ReflectionSubKind} from '../constants.kind.ts';
import {nativeUtilityStringTypes, nonSerializableClasses, nonSerializableGlobals} from '../constants.ts';
import {JitFunctions} from '../constants.functions.ts';
/* IMPORTANT: import classes as type only to prevent js circular imports */
import type {RunType, RunTypeChildAccessor} from '../types.ts';
import type {StringRunType} from '../nodes/atomic/string.ts';
import type {DateRunType} from '../nodes/atomic/date.ts';
import type {NumberRunType} from '../nodes/atomic/number.ts';
import type {BooleanRunType} from '../nodes/atomic/boolean.ts';
import type {NullRunType} from '../nodes/atomic/null.ts';
import type {BigIntRunType} from '../nodes/atomic/bigInt.ts';
import type {AnyRunType} from '../nodes/atomic/any.ts';
import type {UndefinedRunType} from '../nodes/atomic/undefined.ts';
import type {UnknownRunType} from '../nodes/atomic/unknown.ts';
import type {VoidRunType} from '../nodes/atomic/void.ts';
import type {ArrayRunType} from '../nodes/member/array.ts';
import type {LiteralRunType} from '../nodes/atomic/literal.ts';
import type {RegexpRunType} from '../nodes/atomic/regexp.ts';
import type {NeverRunType} from '../nodes/atomic/never.ts';
import type {EnumRunType} from '../nodes/atomic/enum.ts';
import type {EnumMemberRunType} from '../nodes/atomic/enumMember.ts';
import type {UnionRunType} from '../nodes/collection/union.ts';
import type {TupleRunType} from '../nodes/collection/tuple.ts';
import type {TupleMemberRunType} from '../nodes/member/tupleMember.ts';
import type {InterfaceRunType, InterfaceMember} from '../nodes/collection/interface.ts';
import type {PropertyRunType} from '../nodes/member/property.ts';
import type {IndexSignatureRunType} from '../nodes/member/indexProperty.ts';
import type {MethodSignatureRunType} from '../nodes/member/methodSignature.ts';
import type {CallSignatureRunType} from '../nodes/member/callSignature.ts';
import type {FunctionRunType} from '../nodes/function/function.ts';
import type {FunctionParamsRunType} from '../nodes/collection/functionParams.ts';
import type {ParameterRunType} from '../nodes/member/param.ts';
import type {PromiseRunType} from '../nodes/native/promise.ts';
import type {ObjectRunType} from '../nodes/atomic/object.ts';
import type {MethodRunType} from '../nodes/member/method.ts';
import type {AtomicRunType, CollectionRunType, MemberRunType} from './baseRunTypes.ts';
import type {BaseFnCompiler, JitErrorsFnCompiler} from './jitFnCompiler.ts';
import type {ClassRunType} from '../nodes/collection/class.ts';
import type {IntersectionRunType} from '../nodes/collection/intersection.ts';
import type {SymbolRunType} from '../nodes/atomic/symbol.ts';

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
    return rt.getTypeID() === ReflectionSubKind.date;
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

export function isFunctionParamsRunType(rt: RunType): rt is FunctionParamsRunType {
    return rt.src.subKind === ReflectionSubKind.params;
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

export function isClassRunType(rt: RunType, cls?: string | AnyClass): rt is ClassRunType {
    const isClassRt = rt.src.kind === ReflectionKind.class && rt.src.subKind !== ReflectionSubKind.date;
    if (!cls) return isClassRt;
    return isClassRt && (rt.src.classType === cls || rt.src.classType.name === cls);
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
    return typeof value?.src?.kind === 'number' && typeof value?.getTypeID === 'function';
}

export function isJitErrorsCompiler(value: BaseFnCompiler): value is JitErrorsFnCompiler {
    return value.fnID === JitFunctions.typeErrors.id || value.fnID === JitFunctions.unknownKeyErrors.id;
}

export function isNonSerializableClass(src: TypeClass): boolean {
    return nonSerializableClasses.includes(src.classType);
}

export function isNonSerializableObject(src: TypeObjectLiteral): boolean {
    if (!src.typeName) return false;
    return nonSerializableGlobals.includes(src.typeName);
}

export function isNativeUtilityStringTypes(src: Type): boolean {
    if (!src.typeName) return false;
    return nativeUtilityStringTypes.includes(src.typeName);
}

export function hasType(src: any): src is {type: Type} {
    return isType(src?.type);
}

export function hasTypes(src: any): src is {types: Type[]} {
    return Array.isArray(src?.types) && isType(src);
}

export function hasReturn(src: any): src is {return: Type} {
    return isType(src?.return);
}

export function hasParameters(src: any): src is {parameters: Type[]} {
    return Array.isArray(src?.parameters) && isType(src);
}

export function hasIndexType(src: any): src is {indexType: Type} {
    return isType(src?.indexType);
}

export function hasArguments(src: any): src is {arguments: Type[]} {
    return Array.isArray(src?.arguments) && isType(src);
}

export function hasExtends(src: any): src is {extends: Type[]} {
    return Array.isArray(src?.extends) && isType(src);
}

export function hasExtendsArguments(src: any): src is {extendsArguments: Type[]} {
    return Array.isArray(src?.extendsArguments) && isType(src);
}

export function hasTypeArguments(src: any): src is {typeArguments: Type[]} {
    return Array.isArray(src?.typeArguments) && isType(src);
}

export function hasTypeParameters(src: any): src is {typeParameters: TypeParameter[]} {
    return Array.isArray(src?.typeParameters) && isType(src);
}

export function hasMembers(src: any): src is {members: InterfaceMember[]} {
    return Array.isArray(src?.members) && isType(src);
}

export function hasImplements(src: any): src is {implements: Type[]} {
    return Array.isArray(src?.implements) && isType(src);
}

export function isFormatParamMeta(src: TypeFormatValue): src is FormatParamMeta {
    return (src as FormatParamMeta)?.val !== undefined;
}
