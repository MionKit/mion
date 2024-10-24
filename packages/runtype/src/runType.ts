/* eslint-disable no-case-declarations */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {RunType, DKwithRT, Mutable} from './types';
import {ReflectionKind, Type, TypeObjectLiteral} from './_deepkit/src/reflection/type';
import {resolveReceiveType, ReceiveType, reflect} from './_deepkit/src/reflection/reflection';
import {StringRunType} from './atomicRunType/string';
import {DateRunType} from './atomicRunType/date';
import {NumberRunType} from './atomicRunType/number';
import {BooleanRunType} from './atomicRunType/boolean';
import {NullRunType} from './atomicRunType/null';
import {BigIntRunType} from './atomicRunType/bigInt';
import {SymbolRunType} from './atomicRunType/symbol';
import {AnyRunType} from './atomicRunType/any';
import {UndefinedRunType} from './atomicRunType/undefined';
import {UnknownRunType} from './atomicRunType/unknown';
import {VoidRunType} from './atomicRunType/void';
import {ArrayRunType} from './memberRunType/array';
import {LiteralRunType} from './atomicRunType/literal';
import {RegexpRunType} from './atomicRunType/regexp';
import {NeverRunType} from './atomicRunType/never';
import {EnumRunType} from './atomicRunType/enum';
import {EnumMemberRunType} from './atomicRunType/enumMember';
import {UnionRunType} from './collectionRunType/union';
import {TupleRunType} from './collectionRunType/tuple';
import {TupleMemberRunType} from './memberRunType/tupleMember';
import {InterfaceRunType} from './collectionRunType/interface';
import {PropertyRunType} from './memberRunType/property';
import {IndexSignatureRunType} from './memberRunType/indexProperty';
import {MethodSignatureRunType} from './memberRunType/methodSignature';
import {CallSignatureRunType} from './functionRunType/call';
import {FunctionRunType} from './functionRunType/function';
import {PromiseRunType} from './memberRunType/promise';
import {ObjectRunType} from './atomicRunType/object';
import {IntersectionRunType} from './collectionRunType/intersection';
import {ParameterRunType} from './memberRunType/param';
import {MethodRunType} from './memberRunType/method';
import {RestParamsRunType} from './memberRunType/restParams';
import {ClassRunType} from './collectionRunType/class';

export function runType<T>(type?: ReceiveType<T>): RunType {
    type = resolveReceiveType(type); // deepkit has been extended to call createRunType ./_deepkit/src/reflection/processor.ts#L1697
    return (type as DKwithRT)._rt;
}

export function reflectFunction<Fn extends (...args: any[]) => any>(fn: Fn): FunctionRunType {
    const type = reflect(fn); // deepkit has been extended to call createRunType ./_deepkit/src/reflection/processor.ts#L16
    return (type as DKwithRT)._rt as FunctionRunType;
}

export function createRunType(deepkitType: Type): RunType {
    // console.log('deepkitType', deepkitType);

    /*
     RunType reference is stored in the deepkitType._runType so we can access both the deepkitType and the mion RunType,
     basically every runType stores a reference to a deepkit type and vice versa.
     This also relies on deepkit handling circular types to prevent infinite loop when we are generating RunTypes.
    */
    const existingType: RunType | undefined = (deepkitType as DKwithRT)._rt;
    // TODO: IMPORTANT: seems like deepkit can generate multiple types objects for the same type, so we need to handle this
    // we are attaching the runType to the deepkit type (deepkitType._runType), to link the two types together
    // but as deepkit can generate multiple types that means existingType will be null and the markAsCircular function is not working as expected
    if (existingType) return existingType;

    let rt: RunType;

    switch (deepkitType.kind) {
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
            if (deepkitType.classType === Date) {
                rt = new DateRunType();
            } else if (deepkitType.classType === Map) {
                throw new Error('Map is not implemented yet');
            } else if (deepkitType.classType === Set) {
                throw new Error('Set is not implemented yet');
            } else {
                rt = new ClassRunType();
            }
            break;
        case ReflectionKind.enum:
            rt = new EnumRunType();
            break;
        case ReflectionKind.enumMember:
            // enum members are resolved by the enum type, so this is not expected to be called
            rt = new EnumMemberRunType();
            break;
        case ReflectionKind.function:
            rt = new FunctionRunType();
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
            const objLiteral = deepkitType as TypeObjectLiteral;
            const originTypeName = objLiteral.originTypes?.[0].typeName;
            const isNativeType = originTypeName && nativeTypeNamesFromObjectLiterals.includes(originTypeName);
            if (isNativeType) {
                throw new Error(`Native type "${originTypeName}" is not supported`);
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
        case ReflectionKind.never:
            rt = new NeverRunType();
            break;
        default:
            rt = new AnyRunType();
            break;
    }
    (rt as Mutable<RunType>).src = deepkitType;
    (deepkitType as DKwithRT)._rt = rt;
    // console.log('rt', rt);
    return rt;
}

const nativeTypeNamesFromObjectLiterals = ['AsyncIterator', 'Iterator'];
