/* eslint-disable no-case-declarations */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {RunType, Mutable, SrcType} from './types';
import type {BaseRunType} from './lib/baseRunTypes';
import type {TypeClass, Type} from '@deepkit/type';
import {ReflectionKind, resolveReceiveType, ReceiveType, reflect, typeAnnotation, stringifyType} from '@deepkit/type';
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
} from './lib/guards';
import {StringRunType} from './nodes/atomic/string';
import {DateRunType} from './nodes/atomic/date';
import {NumberRunType} from './nodes/atomic/number';
import {BooleanRunType} from './nodes/atomic/boolean';
import {NullRunType} from './nodes/atomic/null';
import {BigIntRunType} from './nodes/atomic/bigInt';
import {AnyRunType} from './nodes/atomic/any';
import {UndefinedRunType} from './nodes/atomic/undefined';
import {UnknownRunType} from './nodes/atomic/unknown';
import {VoidRunType} from './nodes/atomic/void';
import {ArrayRunType} from './nodes/member/array';
import {LiteralRunType} from './nodes/atomic/literal';
import {RegexpRunType} from './nodes/atomic/regexp';
import {NeverRunType} from './nodes/atomic/never';
import {EnumRunType} from './nodes/atomic/enum';
import {EnumMemberRunType} from './nodes/atomic/enumMember';
import {UnionRunType} from './nodes/collection/union';
import {TupleRunType} from './nodes/collection/tuple';
import {FunctionParamsRunType} from './nodes/collection/functionParams';
import {TupleMemberRunType} from './nodes/member/tupleMember';
import {InterfaceRunType} from './nodes/collection/interface';
import {PropertyRunType} from './nodes/member/property';
import {IndexSignatureRunType} from './nodes/member/indexProperty';
import {MethodSignatureRunType} from './nodes/member/methodSignature';
import {CallSignatureRunType} from './nodes/member/callSignature';
import {FunctionRunType} from './nodes/function/function';
import {PromiseRunType} from './nodes/native/promise';
import {ObjectRunType} from './nodes/atomic/object';
import {IntersectionRunType} from './nodes/collection/intersection';
import {ParameterRunType} from './nodes/member/param';
import {MethodRunType} from './nodes/member/method';
import {RestParamsRunType} from './nodes/member/restParams';
import {ClassRunType} from './nodes/collection/class';
import {MapRunType} from './nodes/native/map';
import {ReflectionSubKind} from './constants.kind';
import {SetRunType} from './nodes/native/set';
import {SymbolRunType} from './nodes/atomic/symbol';
import {NonSerializableRunType} from './nodes/native/nonSerializable';

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

// We need to traverse all possible associated nodes to create all the runTypes
function createRunTypes(src: SrcType): void {
    const stack: Type[] = [src];

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current || (current as SrcType)._rt) continue;

        try {
            createRunType(current as Mutable<SrcType>);
        } catch (error) {
            const typesStackMessage = '\nTypes Stack: ' + stack.map((t) => t.typeName || t.kind).join(', ');
            (error as Error).message += typesStackMessage;
            throw error;
        }

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

        // sometimes parent is an orphan so we need to explicitly add it to the stack
        if (current.parent && !(current.parent as SrcType)?._rt) stack.push(current.parent);
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
            // this is not supported at the moment but would be useful for type safe urls etc
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
            if (deepkitType.subKind === ReflectionSubKind.params) {
                rt = new FunctionParamsRunType();
            } else {
                const frt = new FunctionRunType();
                // TODO review an change how we compile function parameters and return type
                // those should also be jit functions, no need to check for array
                // and maybe add option to target individual parameters
                (frt.parameterRunTypes as Mutable<RunType>).src = deepkitType;
                rt = frt;
            }
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
            throw new Error(
                'TypeParameter not implemented. Type parameters are the generic placeholders in type definitions (e.g., T in Array<T>, ErrType in TypedError<ErrType>). ' +
                    'Type parameters are typically resolved during type instantiation and should not appear in runtime type checking.' +
                    'This error is typically caused by a generic type missing type arguments, e.g.: TypedError instead of TypedError<"my-error">.'
            );
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
