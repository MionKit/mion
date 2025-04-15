/* eslint-disable no-case-declarations */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {RunType, Mutable, SrcType} from '../types';
import type {BaseRunType} from './baseRunTypes';
import type {TypeClass, Type} from '@deepkit/type';
import {ReflectionKind, resolveReceiveType, ReceiveType, reflect, typeAnnotation, stringifyType} from '@deepkit/type';
import {StringRunType} from '../runType/atomic/string';
import {DateRunType} from '../runType/atomic/date';
import {NumberRunType} from '../runType/atomic/number';
import {BooleanRunType} from '../runType/atomic/boolean';
import {NullRunType} from '../runType/atomic/null';
import {BigIntRunType} from '../runType/atomic/bigInt';
import {AnyRunType} from '../runType/atomic/any';
import {UndefinedRunType} from '../runType/atomic/undefined';
import {UnknownRunType} from '../runType/atomic/unknown';
import {VoidRunType} from '../runType/atomic/void';
import {ArrayRunType} from '../runType/member/array';
import {LiteralRunType} from '../runType/atomic/literal';
import {RegexpRunType} from '../runType/atomic/regexp';
import {NeverRunType} from '../runType/atomic/never';
import {EnumRunType} from '../runType/atomic/enum';
import {EnumMemberRunType} from '../runType/atomic/enumMember';
import {UnionRunType} from '../runType/collection/union';
import {TupleRunType} from '../runType/collection/tuple';
import {TupleMemberRunType} from '../runType/member/tupleMember';
import {InterfaceRunType} from '../runType/collection/interface';
import {PropertyRunType} from '../runType/member/property';
import {IndexSignatureRunType} from '../runType/member/indexProperty';
import {MethodSignatureRunType} from '../runType/member/methodSignature';
import {CallSignatureRunType} from '../runType/member/callSignature';
import {FunctionRunType} from '../runType/function/function';
import {PromiseRunType} from '../runType/native/promise';
import {ObjectRunType} from '../runType/atomic/object';
import {IntersectionRunType} from '../runType/collection/intersection';
import {ParameterRunType} from '../runType/member/param';
import {MethodRunType} from '../runType/member/method';
import {RestParamsRunType} from '../runType/member/restParams';
import {ClassRunType} from '../runType/collection/class';
import {MapRunType} from '../runType/native/map';
import {ReflectionSubKind} from '../constants.kind';
import {SetRunType} from '../runType/native/set';
import {JitFunctions} from '../constants';
import {SymbolRunType} from '../runType/atomic/symbol';
import {
    hasArguments,
    hasExtendsArguments,
    hasImplements,
    hasIndexType,
    hasParameters,
    hasReturn,
    hasType,
    hasTypes,
    isNativeUtilityStringTypes,
    isNonSerializableClass,
    isNonSerializableObject,
} from './guards';
import {NonSerializableRunType} from '../runType/native/nonSerializable';

export function runType<T>(type?: ReceiveType<T>): RunType {
    const start = Date.now();
    const src = resolveReceiveType(type) as SrcType;
    const took0 = Date.now() - start;
    createRunTypes(src);
    const took1 = Date.now() - start;
    const diff = took1 - took0;
    // max RunType overhead 60 ms
    if (diff > 60) console.warn(`RunType overhead is very long: ${diff}ms for ${stringifyType(src)}`);
    return src._rt;
}

export function reflectFunction<Fn extends (...args: any[]) => any>(fn: Fn): FunctionRunType {
    const src = reflect(fn) as SrcType;
    runType(src);
    return src._rt as FunctionRunType;
}

// We need to traverse all child nodes to create all the runTypes
function createRunTypes(src: SrcType): void {
    const stack: Type[] = [src];

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current || (current as SrcType)._rt) continue;

        createRunType(current as Mutable<SrcType>);

        // single child type nodes
        if (hasType(current)) stack.push(current.type);
        if (hasReturn(current)) stack.push(current.return);
        if (hasIndexType(current)) stack.push(current.indexType);
        if (current.origin) stack.push(current.origin);
        if (current.indexAccessOrigin?.index) stack.push(current.indexAccessOrigin?.index);
        if (current.indexAccessOrigin?.container) stack.push(current.indexAccessOrigin?.container);

        // multiple child type nodes
        if (hasTypes(current)) pushToStack(current.types, stack);
        if (hasParameters(current)) pushToStack(current.parameters, stack);
        if (hasArguments(current)) pushToStack(current.arguments, stack);
        if (hasExtendsArguments(current)) pushToStack(current.extendsArguments, stack);
        if (hasImplements(current)) pushToStack(current.implements, stack);
        if (current.typeArguments) pushToStack(current.typeArguments, stack);
        if (current.decorators) pushToStack(current.decorators, stack);
        if (current.scheduleDecorators) pushToStack(current.scheduleDecorators, stack);

        // annotations
        if (current.annotations) {
            const annotations = typeAnnotation.getAnnotations(current);
            for (const annotation of annotations) stack.push(annotation.options);
        }

        // originTypes
        current.originTypes?.forEach((ot) => {
            if (ot.typeArguments) pushToStack(ot.typeArguments, stack);
        });
    }
}

function pushToStack(subTypes: Type[], stack: Type[]) {
    if (Array.isArray(subTypes)) stack.push(...subTypes);
}

function createRunType(deepkitType: Mutable<SrcType>): RunType {
    // console.log('deepkitType', deepkitType);

    /*
     RunType reference is stored in the deepkitType._runType so we can access both the deepkitType and the mion RunType,
     basically every runType stores a reference to a deepkit type and vice versa.
     This also relies on deepkit handling circular types to prevent infinite loop when we are generating RunTypes.
    */
    const existingType: RunType | undefined = deepkitType._rt;
    // TODO: IMPORTANT: seems like deepkit can generate multiple types objects for the same type, so we need to handle this
    // we are attaching the runType to the deepkit type (deepkitType._runType), to link the two types together
    // but as deepkit can generate multiple types that means existingType will be null and the markAsCircular function is not working as expected
    if (existingType) return existingType;

    let rt: BaseRunType;

    switch (deepkitType.kind) {
        // ###################### ATOMIC RUNTYPES ######################
        // Primitive types and other atomic types that don't contain other types
        case ReflectionKind.any:
            rt = new AnyRunType();
            break;
        case ReflectionKind.bigint:
            rt = new BigIntRunType();
            break;
        case ReflectionKind.boolean:
            rt = new BooleanRunType();
            break;
        case ReflectionKind.enum:
            rt = new EnumRunType();
            break;
        case ReflectionKind.enumMember:
            // enum members are resolved by the enum type, so this is not expected to be called
            rt = new EnumMemberRunType();
            break;
        case ReflectionKind.literal:
            rt = new LiteralRunType();
            break;
        case ReflectionKind.never:
            // TODO add the string format feature
            rt = isNativeUtilityStringTypes(deepkitType) ? new StringRunType() : new NeverRunType();
            break;
        case ReflectionKind.null:
            rt = new NullRunType();
            break;
        case ReflectionKind.number:
            rt = new NumberRunType();
            break;
        case ReflectionKind.object:
            rt = new ObjectRunType();
            break;
        case ReflectionKind.regexp:
            rt = new RegexpRunType();
            break;
        case ReflectionKind.string:
            rt = new StringRunType();
            break;
        case ReflectionKind.symbol:
            rt = new SymbolRunType();
            break;
        case ReflectionKind.templateLiteral:
            // deepkit automatically resolves template literals unions to literals
            // this is only called when you define the type of a template literal i.e: type T = `foo${string}`;
            // this is not expected to be validated or serialized so not supported
            throw new Error(
                'Template Literals are resolved by the compiler to Literals ie: const tl = `${string}World`. Template literal types are not supported. ie type TL = `${string}World`'
            );
        case ReflectionKind.undefined:
            rt = new UndefinedRunType();
            break;
        case ReflectionKind.unknown:
            rt = new UnknownRunType();
            break;
        case ReflectionKind.void:
            rt = new VoidRunType();
            break;

        // ###################### MEMBER RUNTYPES ######################
        // Types that represent members of collections or other structures
        case ReflectionKind.array:
            rt = new ArrayRunType();
            break;
        case ReflectionKind.callSignature:
            rt = new CallSignatureRunType();
            break;
        case ReflectionKind.function:
            const frt = new FunctionRunType();
            (frt.parameterRunTypes as Mutable<RunType>).src = deepkitType;
            rt = frt;
            break;
        case ReflectionKind.indexSignature:
            rt = new IndexSignatureRunType();
            break;
        case ReflectionKind.method:
            rt = new MethodRunType();
            break;
        case ReflectionKind.methodSignature:
            rt = new MethodSignatureRunType();
            break;
        case ReflectionKind.parameter:
            rt = new ParameterRunType();
            break;
        case ReflectionKind.property:
        case ReflectionKind.propertySignature:
            rt = new PropertyRunType();
            break;
        case ReflectionKind.rest:
            rt = new RestParamsRunType();
            break;
        case ReflectionKind.tupleMember:
            rt = new TupleMemberRunType();
            break;
        case ReflectionKind.promise:
            rt = new PromiseRunType();
            break;

        // ###################### COLLECTION RUNTYPES ######################
        case ReflectionKind.objectLiteral:
            if (isNonSerializableObject(deepkitType)) {
                rt = new NonSerializableRunType();
            } else {
                rt = new InterfaceRunType();
            }
            break;
        case ReflectionKind.class:
            rt = initClassRunType(deepkitType);
            break;
        // Types that contain other types as members
        case ReflectionKind.infer:
            throw new Error(
                'Infer type not supported, ie: type MyType =Type<T> = T extends (...args: any[]) => infer R ? R : any; https://www.typescriptlang.org/docs/handbook/2/conditional-types.html'
            );

        case ReflectionKind.intersection:
            rt = new IntersectionRunType();
            break;

        case ReflectionKind.tuple:
            rt = new TupleRunType();
            break;
        case ReflectionKind.typeParameter:
            throw new Error('not implemented');
        // rType = resolveTypeParameter(deepkitType, opts, mapper);
        case ReflectionKind.union:
            rt = new UnionRunType();
            break;
        default:
            rt = new AnyRunType();
            break;
    }
    rt.onCreated(deepkitType);
    // console.log('rt', rt);
    return rt;
}

function initClassRunType(src: TypeClass & {subKind?: number}): BaseRunType {
    switch (src.classType) {
        case Date:
            src.subKind = ReflectionSubKind.date;
            return new DateRunType();
        case Map:
            src.subKind = ReflectionSubKind.map;
            return new MapRunType();
        case Set:
            src.subKind = ReflectionSubKind.set;
            return new SetRunType();
        default:
            if (isNonSerializableClass(src)) {
                src.subKind = ReflectionSubKind.nonSerializable;
                return new NonSerializableRunType();
            }
            return new ClassRunType();
    }
}

export function createIsTypeFunction<T>(type?: ReceiveType<T>): (value: any) => boolean {
    const rt = runType(type);
    return rt.createJitFunction(JitFunctions.isType);
}
