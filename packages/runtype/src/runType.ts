/* eslint-disable no-case-declarations */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Mutable, RunType, RunTypeOptions, RunTypeVisitor, SrcType} from './types';
import {ReflectionKind, TypeObjectLiteral} from './_deepkit/src/reflection/type';
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
import {ArrayRunType} from './collectionRunType/array';
import {LiteralRunType} from './atomicRunType/literal';
import {RegexpRunType} from './atomicRunType/regexp';
import {NeverRunType} from './atomicRunType/never';
import {EnumRunType} from './atomicRunType/enum';
import {EnumMemberRunType} from './atomicRunType/enumMember';
import {UnionRunType} from './collectionRunType/union';
import {TupleRunType} from './collectionRunType/tuple';
import {TupleMemberRunType} from './collectionRunType/tupleMember';
import {InterfaceRunType} from './collectionRunType/interface';
import {PropertyRunType} from './collectionRunType/property';
import {IndexSignatureRunType} from './collectionRunType/indexProperty';
import {MethodSignatureRunType} from './functionRunType/methodSignature';
import {CallSignatureRunType} from './functionRunType/call';
import {FunctionRunType} from './functionRunType/function';
import {PromiseRunType} from './atomicRunType/promise';
import {ObjectRunType} from './atomicRunType/object';
import {IntersectionRunType} from './collectionRunType/intersection';
import {ParameterRunType} from './functionRunType/param';
import {MethodRunType} from './functionRunType/method';
import {RestParamsRunType} from './functionRunType/restParams';
import {ClassRunType} from './collectionRunType/class';
import {hasCircularParents} from './utils';
import {CollectionRunType} from './baseRunTypes';

const MaxNestLevel = 20; // max parents levels to prevent infinite recursion or complicated types

export function runType<T>(opts: RunTypeOptions = {}, type?: ReceiveType<T>): RunType {
    type = resolveReceiveType(type);
    return visitor(type, [], opts);
}

export function reflectFunction<Fn extends (...args: any[]) => any>(fn: Fn, opts: RunTypeOptions = {}): FunctionRunType {
    const type = reflect(fn);
    return visitor(type, [], opts) as FunctionRunType;
}

function visitor(deepkitType, parents: RunType[], opts: RunTypeOptions): RunType {
    // console.log('deepkitType', deepkitType);

    /*
     RunType reference is stored in the deepkitType._runType so we can access both the deepkitType and the mion RunType
     basically every runType stores a reference to a deepkit type and vice versa.
     This also relies on deepkit handling circular types to prevent infinite loop when we are generating RunTypes  */
    const existingType: RunType | undefined = (deepkitType as SrcType)._runType;
    if (existingType) {
        if (!(existingType as CollectionRunType<any>).isCircularRef && hasCircularParents(existingType, parents)) {
            (existingType as Mutable<CollectionRunType<any>>).isCircularRef = true;
        }
        return existingType;
    }

    let rt: RunType;

    switch (deepkitType.kind) {
        case ReflectionKind.any:
            rt = new AnyRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.array:
            rt = new ArrayRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.bigint:
            rt = new BigIntRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.boolean:
            rt = new BooleanRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.callSignature:
            rt = new CallSignatureRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.class:
            if (deepkitType.classType === Date) {
                rt = new DateRunType(visitor, deepkitType, parents, opts);
            } else if (deepkitType.classType === Map) {
                throw new Error('Map is not implemented yet');
            } else if (deepkitType.classType === Set) {
                throw new Error('Set is not implemented yet');
            } else {
                rt = new ClassRunType(visitor, deepkitType, parents, opts);
            }
            break;
        case ReflectionKind.enum:
            rt = new EnumRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.enumMember:
            // enum members are resolved by the enum type, so this is not expected to be called
            rt = new EnumMemberRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.function:
            rt = new FunctionRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.indexSignature:
            rt = new IndexSignatureRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.infer:
            throw new Error(
                'Infer type not supported, ie: type MyType =Type<T> = T extends (...args: any[]) => infer R ? R : any; https://www.typescriptlang.org/docs/handbook/2/conditional-types.html'
            );
        case ReflectionKind.intersection:
            rt = new IntersectionRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.literal:
            rt = new LiteralRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.method:
            rt = new MethodRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.methodSignature:
            rt = new MethodSignatureRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.null:
            rt = new NullRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.number:
            rt = new NumberRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.object:
            rt = new ObjectRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.objectLiteral:
            const objLiteral = deepkitType as TypeObjectLiteral;
            const originTypeName = objLiteral.originTypes?.[0].typeName;
            const isNativeType = originTypeName && nativeTypeNamesFromObjectLiterals.includes(originTypeName);
            if (isNativeType) {
                rt = resolveNativeTypeFromObjectLiteral(visitor, objLiteral, parents, objLiteral, originTypeName);
            } else {
                rt = new InterfaceRunType(visitor, objLiteral, parents, opts);
            }
            break;
        case ReflectionKind.parameter:
            rt = new ParameterRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.promise:
            rt = new PromiseRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.property:
        case ReflectionKind.propertySignature:
            rt = new PropertyRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.regexp:
            rt = new RegexpRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.rest:
            rt = new RestParamsRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.string:
            rt = new StringRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.symbol:
            rt = new SymbolRunType(visitor, deepkitType, parents, opts);
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
            rt = new TupleRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.tupleMember:
            rt = new TupleMemberRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.typeParameter:
            throw new Error('not implemented');
            // rType = resolveTypeParameter(deepkitType, opts, mapper);
            break;
        case ReflectionKind.undefined:
            rt = new UndefinedRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.union:
            rt = new UnionRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.unknown:
            rt = new UnknownRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.void:
            rt = new VoidRunType(visitor, deepkitType, parents, opts);
            break;
        case ReflectionKind.never:
            rt = new NeverRunType(visitor, deepkitType, parents, opts);
            break;
        default:
            rt = new AnyRunType(visitor, deepkitType, parents, opts);
            break;
    }

    if (parents.length > MaxNestLevel) throw new Error('Max Nest Level exceeded while resolving run type');
    (deepkitType as SrcType)._runType = rt;
    return rt;
}

const nativeTypeNamesFromObjectLiterals = ['AsyncIterator', 'Iterator'];

function resolveNativeTypeFromObjectLiteral(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    visitor: RunTypeVisitor,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    src: TypeObjectLiteral,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    parents: RunType[],
    deepkitType: TypeObjectLiteral,
    nativeName: string
): RunType {
    switch (nativeName) {
        case 'Iterator':
            throw new Error('Iterator not implemented');
        case 'AsyncIterator':
            throw new Error('AsyncIterator RunTypes are not supported');
        default:
            throw new Error(`Type is not an Native Type`);
    }
}
