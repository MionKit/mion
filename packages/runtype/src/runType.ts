/* eslint-disable no-case-declarations */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, TypeObjectLiteral} from './_deepkit/src/reflection/type';
import {resolveReceiveType, ReceiveType, reflect} from './_deepkit/src/reflection/reflection';
import {RunType, RunTypeOptions, RunTypeVisitor} from './types';
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
import {InterfaceRunType} from './collectionRunType/interface';
import {PropertySignatureRunType} from './collectionRunType/property';
import {IndexSignatureRunType} from './collectionRunType';
import {MethodSignatureRunType} from './functionRunType/methodSignature';
import {CallSignatureRunType} from './functionRunType/call';
import {FnRunTypeOptions, FunctionRunType} from './functionRunType/function';
import {PromiseRunType} from './singleRunType/promise';
import {ObjectRunType} from './singleRunType/object';
import {IntersectionRunType} from './collectionRunType/intersection';
import {ParameterRunType} from './functionRunType/param';
import {MethodRunType} from './functionRunType/method';

const MaxNestLevel = 100;

export function runType<T>(opts: FnRunTypeOptions = {}, type?: ReceiveType<T>): RunType {
    type = resolveReceiveType(type);
    return visitor(type, -1, opts);
}

export function reflectFunction<Fn extends (...args: any[]) => any>(fn: Fn, opts: FnRunTypeOptions = {}): FunctionRunType {
    const type = reflect(fn);
    return visitor(type, -1, opts) as FunctionRunType;
}

function visitor(deepkitType, nestLevel: number, opts: RunTypeOptions): RunType {
    // console.log('deepkitType', deepkitType);

    nestLevel += 1;
    if (nestLevel > MaxNestLevel) throw new Error('MaxNestLevel exceeded while resolving run type');
    let rt: RunType;

    switch (deepkitType.kind) {
        case ReflectionKind.any:
            rt = new AnyRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.array:
            rt = new ArrayRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.bigint:
            rt = new BigIntRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.boolean:
            rt = new BooleanRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.callSignature:
            rt = new CallSignatureRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.class:
            if (deepkitType.classType === Date) {
                rt = new DateRunType(visitor, deepkitType, nestLevel, opts);
            } else {
                throw new Error('not implemented');
            }
            break;
        case ReflectionKind.enum:
            rt = new EnumRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.enumMember:
            // enum members are resolved by the enum type, so this is not expected to be called
            rt = new EnumMemberRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.function:
            rt = new FunctionRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.indexSignature:
            rt = new IndexSignatureRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.infer:
            throw new Error(
                'Infer type not supported, ie: type typeBoxType =Type<T> = T extends (...args: any[]) => infer R ? R : any; https://www.typescriptlang.org/docs/handbook/2/conditional-types.html'
            );
        case ReflectionKind.intersection:
            rt = new IntersectionRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.literal:
            rt = new LiteralRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.method:
            rt = new MethodRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.methodSignature:
            rt = new MethodSignatureRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.null:
            rt = new NullRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.number:
            rt = new NumberRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.object:
            rt = new ObjectRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.objectLiteral:
            const objLiteral = deepkitType as TypeObjectLiteral;
            const originTypeName = objLiteral.originTypes?.[0].typeName;
            const isNativeType = originTypeName && nativeTypeNamesFromObjectLiterals.includes(originTypeName);
            if (isNativeType) {
                rt = resolveNativeTypeFromObjectLiteral(visitor, objLiteral, nestLevel, objLiteral, originTypeName);
            } else {
                rt = new InterfaceRunType(visitor, objLiteral, nestLevel, opts);
            }
            break;
        case ReflectionKind.parameter:
            rt = new ParameterRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.promise:
            rt = new PromiseRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.property:
            // a property is a member of a class, instead a propertySignature is a member of an object/interface
            // rType = resolveProperty(deepkitType, opts, mapper);
            throw new Error('not implemented');
            break;
        case ReflectionKind.propertySignature:
            rt = new PropertySignatureRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.regexp:
            rt = new RegexpRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.rest:
            throw new Error('Typebox does not support rest parameters i.e. function foo(...args: number[]) {}');
            break;
        case ReflectionKind.string:
            rt = new StringRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.symbol:
            rt = new SymbolRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.templateLiteral:
            // deepkit automatically resolves template literals unions to literals
            // this is only called when you define the type of a template literal i.e: type T = `foo${string}`;
            // this is not expected to be validated or serialized so not supported
            throw new Error(
                'Template Literals are resolved by the compiler to Literals, template literal types are not supported. ie type TL = `${string}World`'
            );
            break;
        case ReflectionKind.tuple:
            rt = new TupleRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.tupleMember:
            rt = new TupleMemberRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.typeParameter:
            throw new Error('not implemented');
            // rType = resolveTypeParameter(deepkitType, opts, mapper);
            break;
        case ReflectionKind.undefined:
            rt = new UndefinedRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.union:
            rt = new UnionRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.unknown:
            rt = new UnknownRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.void:
            rt = new VoidRunType(visitor, deepkitType, nestLevel, opts);
            break;
        case ReflectionKind.never:
            rt = new NeverRunType(visitor, deepkitType, nestLevel, opts);
            break;
        default:
            rt = new AnyRunType(visitor, deepkitType, nestLevel, opts);
            break;
    }

    return rt;
}

const nativeTypeNamesFromObjectLiterals = ['AsyncIterator', 'Iterator'];

function resolveNativeTypeFromObjectLiteral(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    visitor: RunTypeVisitor,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    src: TypeObjectLiteral,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    nestLevel: number,
    deepkitType: TypeObjectLiteral,
    nativeName: string
): RunType {
    switch (nativeName) {
        case 'Iterator':
            throw new Error('Iterator not implemented');
        case 'AsyncIterator':
            throw new Error('AsyncIterator not implemented');
        default:
            throw new Error(`Type is not an Native Type`);
    }
}
