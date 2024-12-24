/* eslint-disable no-case-declarations */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {RunType, Mutable, SrcType} from './types';
import type {BaseRunType} from './lib/baseRunTypes';
import {ReflectionKind, type TypeClass, type Type} from './lib/_deepkit/src/reflection/type';
import {resolveReceiveType, ReceiveType, reflect} from './lib/_deepkit/src/reflection/reflection';
import {StringRunType} from './runtypes/atomic/string';
import {DateRunType} from './runtypes/atomic/date';
import {NumberRunType} from './runtypes/atomic/number';
import {BooleanRunType} from './runtypes/atomic/boolean';
import {NullRunType} from './runtypes/atomic/null';
import {BigIntRunType} from './runtypes/atomic/bigInt';
import {AnyRunType} from './runtypes/atomic/any';
import {UndefinedRunType} from './runtypes/atomic/undefined';
import {UnknownRunType} from './runtypes/atomic/unknown';
import {VoidRunType} from './runtypes/atomic/void';
import {ArrayRunType} from './runtypes/member/array';
import {LiteralRunType} from './runtypes/atomic/literal';
import {RegexpRunType} from './runtypes/atomic/regexp';
import {NeverRunType} from './runtypes/atomic/never';
import {EnumRunType} from './runtypes/atomic/enum';
import {EnumMemberRunType} from './runtypes/atomic/enumMember';
import {UnionRunType} from './runtypes/collection/union';
import {TupleRunType} from './runtypes/collection/tuple';
import {TupleMemberRunType} from './runtypes/member/tupleMember';
import {InterfaceRunType} from './runtypes/collection/interface';
import {PropertyRunType} from './runtypes/member/property';
import {IndexSignatureRunType} from './runtypes/member/indexProperty';
import {MethodSignatureRunType} from './runtypes/member/methodSignature';
import {CallSignatureRunType} from './runtypes/member/callSignature';
import {FunctionRunType} from './runtypes/function/function';
import {PromiseRunType} from './runtypes/native/promise';
import {ObjectRunType} from './runtypes/atomic/object';
import {IntersectionRunType} from './runtypes/collection/intersection';
import {ParameterRunType} from './runtypes/member/param';
import {MethodRunType} from './runtypes/member/method';
import {RestParamsRunType} from './runtypes/member/restParams';
import {ClassRunType} from './runtypes/collection/class';
import {MapRunType} from './runtypes/native/map';
import {ReflectionSubKind} from './constants.kind';
import {SetRunType} from './runtypes/native/set';
import {JitFnIDs} from './constants';
import {SymbolRunType} from './runtypes/atomic/symbol';
import {
    hasArguments,
    hasExtendsArguments,
    hasImplements,
    hasIndexType,
    hasParameters,
    hasReturn,
    hasType,
    hasTypes,
    isNonSerializableClass,
    isNonSerializableObject,
} from './lib/guards';
import {NonSerializableRunType} from './runtypes/native/nonSerializable';

export function runType<T>(type?: ReceiveType<T>): RunType {
    const src = resolveReceiveType(type) as SrcType;
    createAllRunTypes(src);
    return src._rt;
}

export function reflectFunction<Fn extends (...args: any[]) => any>(fn: Fn): FunctionRunType {
    const src = reflect(fn) as SrcType;
    createAllRunTypes(src);
    return src._rt as any as FunctionRunType;
}

// We need to traverse all child nodes to create all the runTypes
function createAllRunTypes(src: SrcType): void {
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

        // // TODO: make sure what to do with originTypes
        // if (current.originTypes) {
        //     current.originTypes.forEach((ot) => {
        //         if (ot.typeArguments) pushToStack(ot.typeArguments, stack);
        //     });
        // }
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
        // All types with metadata are resolved as kind = 0
        case ReflectionKind.never:
            rt = new NeverRunType();
            // console.log('deepkitType', deepkitType.originTypes?.[0]?.typeArguments);
            break;
        case ReflectionKind.any:
            rt = new AnyRunType();
            break;
        case ReflectionKind.array:
            rt = new ArrayRunType();
            break;
        case ReflectionKind.bigint:
            rt = new BigIntRunType();
            break;
        case ReflectionKind.boolean:
            rt = new BooleanRunType();
            break;
        case ReflectionKind.callSignature:
            rt = new CallSignatureRunType();
            break;
        case ReflectionKind.class:
            rt = initClassRunType(deepkitType);
            break;
        case ReflectionKind.enum:
            rt = new EnumRunType();
            break;
        case ReflectionKind.enumMember:
            // enum members are resolved by the enum type, so this is not expected to be called
            rt = new EnumMemberRunType();
            break;
        case ReflectionKind.function:
            const frt = new FunctionRunType();
            (frt.parameterRunTypes as Mutable<RunType>).src = deepkitType;
            rt = frt;
            break;
        case ReflectionKind.indexSignature:
            rt = new IndexSignatureRunType();
            break;
        case ReflectionKind.infer:
            throw new Error(
                'Infer type not supported, ie: type MyType =Type<T> = T extends (...args: any[]) => infer R ? R : any; https://www.typescriptlang.org/docs/handbook/2/conditional-types.html'
            );
        case ReflectionKind.intersection:
            rt = new IntersectionRunType();
            break;
        case ReflectionKind.literal:
            rt = new LiteralRunType();
            break;
        case ReflectionKind.method:
            rt = new MethodRunType();
            break;
        case ReflectionKind.methodSignature:
            rt = new MethodSignatureRunType();
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
        case ReflectionKind.objectLiteral:
            if (isNonSerializableObject(deepkitType)) {
                rt = new NonSerializableRunType();
            } else {
                rt = new InterfaceRunType();
            }
            break;
        case ReflectionKind.parameter:
            rt = new ParameterRunType();
            break;
        case ReflectionKind.promise:
            rt = new PromiseRunType();
            break;
        case ReflectionKind.property:
        case ReflectionKind.propertySignature:
            rt = new PropertyRunType();
            break;
        case ReflectionKind.regexp:
            rt = new RegexpRunType();
            break;
        case ReflectionKind.rest:
            rt = new RestParamsRunType();
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
            break;
        case ReflectionKind.tuple:
            rt = new TupleRunType();
            break;
        case ReflectionKind.tupleMember:
            rt = new TupleMemberRunType();
            break;
        case ReflectionKind.typeParameter:
            throw new Error('not implemented');
            // rType = resolveTypeParameter(deepkitType, opts, mapper);
            break;
        case ReflectionKind.undefined:
            rt = new UndefinedRunType();
            break;
        case ReflectionKind.union:
            rt = new UnionRunType();
            break;
        case ReflectionKind.unknown:
            rt = new UnknownRunType();
            break;
        case ReflectionKind.void:
            rt = new VoidRunType();
            break;
        default:
            rt = new AnyRunType();
            break;
    }
    rt.linkSrc(deepkitType);
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
    return rt.createJitFunction(JitFnIDs.isType);
}
