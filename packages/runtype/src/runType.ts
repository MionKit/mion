/* eslint-disable no-case-declarations */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, resolveReceiveType, ReceiveType} from '@deepkit/type';
import {RunType, RunTypeAccessor} from './types';
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
// import {resolveAsyncIterator, resolveIterator} from './typeBoxMap/nativeObjectLiterals';

export function runType<T>(type?: ReceiveType<T>): RunType {
    type = resolveReceiveType(type);
    return visitor(type, '', 0);
}

// Map Deepkit Type to TypeBox Type
function visitor(deepkitType, path: RunTypeAccessor, nestLevel: number): RunType {
    let rt: RunType;

    // console.log(deepkitType);

    switch (deepkitType.kind) {
        case ReflectionKind.any:
            rt = new AnyRunType(deepkitType, visitor, path, nestLevel);
            break;
        case ReflectionKind.array:
            rt = new ArrayRunType(deepkitType, visitor, path, nestLevel);
            break;
        case ReflectionKind.bigint:
            rt = new BigIntRunType(deepkitType, visitor, path, nestLevel);
            break;
        case ReflectionKind.boolean:
            rt = new BooleanRunType(deepkitType, visitor, path, nestLevel);
            break;
        case ReflectionKind.callSignature:
            throw new Error('not implemented');
            // rType = resolveCallSignature(deepkitType, opts, mapper);
            break;
        case ReflectionKind.class:
            if (deepkitType.classType === Date) {
                rt = new DateRunType(deepkitType, visitor, path, nestLevel);
            } else {
                throw new Error('not implemented');
            }
            break;
        case ReflectionKind.enum:
            throw new Error('not implemented');
            // rType = resolveEnum(deepkitType, opts);
            break;
        case ReflectionKind.enumMember:
            throw new Error('Enum Members can not be visited individually, they are already resolved in enum.');
            break;
        case ReflectionKind.function:
            throw new Error('not implemented');
            // rType = resolveFunction(deepkitType, opts, mapper);
            break;
        case ReflectionKind.indexSignature:
            // TODO: Implement support for call and index signatures
            throw new Error(
                `Typebox does not support indexSignatures i.e. interface SomethingWithPi{ pi: 3.14159; [key: string]: string; } https://www.typescriptlang.org/glossary#index-signatures`
            );
        case ReflectionKind.infer:
            throw new Error(
                'Typebox does not support conditional types, ie: type typeBoxType =Type<T> = T extends (...args: any[]) => infer R ? R : any; https://www.typescriptlang.org/docs/handbook/2/conditional-types.html'
            );
        case ReflectionKind.intersection:
            throw new Error('not implemented');
            // rType = resolveIntersection(deepkitType, opts, mapper);
            break;
        case ReflectionKind.literal:
            rt = new LiteralRunType(deepkitType, visitor, path, nestLevel);
            break;
        case ReflectionKind.method:
            throw new Error('not implemented');
            // rType = resolveMethod(deepkitType, opts, mapper);
            break;
        case ReflectionKind.methodSignature:
            throw new Error('not implemented');
            // rType = resolveMethodSignature(deepkitType, opts, mapper);
            break;
        case ReflectionKind.null:
            rt = new NullRunType(deepkitType, visitor, path, nestLevel);
            break;
        case ReflectionKind.number:
            rt = new NumberRunType(deepkitType, visitor, path, nestLevel);
            break;
        case ReflectionKind.object:
            throw new Error('not implemented');
            break;
        case ReflectionKind.objectLiteral:
            throw new Error('not implemented');
            // const typeNative = deepkitType as TypeObjectLiteral;
            // const originTypeName = typeNative.originTypes?.[0].typeName;
            // const isNativeType = originTypeName && nativeTypeNamesFromObjectLiterals.includes(originTypeName);
            // if (isNativeType) {
            //     rType = resolveNativeTypeFromObjectLiteral(typeNative, opts, mapper, originTypeName);
            // } else {
            //     rType = resolveObjectLiteral(typeNative, opts, mapper);
            // }
            break;
        case ReflectionKind.parameter:
            throw new Error('not implemented');
            // rType = resolveParameter(deepkitType, opts, mapper);
            break;
        case ReflectionKind.promise:
            throw new Error('not implemented');
            // rType = resolvePromise(deepkitType, opts, mapper);
            break;
        case ReflectionKind.property:
            // rType = resolveProperty(deepkitType, opts, mapper);
            throw new Error('not implemented');
            break;
        case ReflectionKind.propertySignature:
            throw new Error('not implemented');
            // rType = resolvePropertySignature(deepkitType, opts, mapper);
            break;
        case ReflectionKind.regexp:
            rt = new RegexpRunType(deepkitType, visitor, path, nestLevel);
            break;
        case ReflectionKind.rest:
            throw new Error('Typebox does not support rest parameters i.e. function foo(...args: number[]) {}');
            break;
        case ReflectionKind.string:
            rt = new StringRunType(deepkitType, visitor, path, nestLevel);
            break;
        case ReflectionKind.symbol:
            rt = new SymbolRunType(deepkitType, visitor, path, nestLevel);
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
            throw new Error('not implemented');
            // rType = resolveTuple(deepkitType, opts, mapper);
            break;
        case ReflectionKind.tupleMember:
            throw new Error('not implemented');
            // rType = resolveTupleMember(deepkitType, opts, mapper);
            break;
        case ReflectionKind.typeParameter:
            throw new Error('not implemented');
            // rType = resolveTypeParameter(deepkitType, opts, mapper);
            break;
        case ReflectionKind.undefined:
            rt = new UndefinedRunType(deepkitType, visitor, path, nestLevel);
            break;
        case ReflectionKind.union:
            throw new Error('not implemented');
            break;
        case ReflectionKind.unknown:
            rt = new UnknownRunType(deepkitType, visitor, path, nestLevel);
            break;
        case ReflectionKind.void:
            rt = new VoidRunType(deepkitType, visitor, path, nestLevel);
            break;
        case ReflectionKind.never:
            throw new Error('not implemented');
            break;
        default:
            rt = new AnyRunType(deepkitType, visitor, path, nestLevel);
            break;
    }

    return rt;
}

// const nativeTypeNamesFromObjectLiterals = ['AsyncIterator', 'Iterator'];

// function resolveNativeTypeFromObjectLiteral(
//     deepkitType: TypeObjectLiteral,
//     opts: SchemaOptions,
//     resolveTypeBox: DeepkitVisitor,
//     nativeName: string
// ): TRunType {
//     switch (nativeName) {
//         case 'Iterator':
//             return resolveIterator(deepkitType, opts, resolveTypeBox);
//         case 'AsyncIterator':
//             return resolveAsyncIterator(deepkitType, opts, resolveTypeBox);
//         default:
//             throw new Error(`Type is not an Native Type`);
//     }
// }
