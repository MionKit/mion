/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SchemaOptions, TSchema, Type as TypeBox} from '@sinclair/typebox';
import {ReflectionKind, resolveReceiveType, ReceiveType} from '@deepkit/type';
import {DeepkitVisitor} from './types';
import {resolveObject} from './runtypes/object';
import {resolveArray} from './runtypes/array';
import {resolveObjectLiteral} from './runtypes/objectLiteral';
import {resolveLiteral} from './runtypes/literal';
import {resolvePropertySignature} from './runtypes/propertySignature';
import {resolveMethod, resolveCallSignature, resolveMethodSignature, resolveFunction} from './runtypes/functions';
import {resolveTypeParameter} from './runtypes/typeParameter';
import {resolveClassToTypeBox} from './runtypes/class';
import {resolveParameter} from './runtypes/parameter';
import {resolveProperty} from './runtypes/property';
import {resolveEnum} from './runtypes/enum';
import {resolveTuple, resolveTupleMember} from './runtypes/tuple';
import {resolveUnion} from './runtypes/union';
import {resolveIntersection} from './runtypes/intersection';

export function typeBox<T>(opts?: SchemaOptions, type?: ReceiveType<T>): TSchema {
    type = resolveReceiveType(type);
    return mapDeepkitTypeToTypeBox(type, {...opts});
}

// Map Deepkit Type to TypeBox Type
function mapDeepkitTypeToTypeBox(deepkitType, opts: SchemaOptions, mapper: DeepkitVisitor = mapDeepkitTypeToTypeBox): TSchema {
    let typeBoxType: TSchema;

    // console.log(deepkitType);

    switch (deepkitType.kind) {
        case ReflectionKind.never:
            typeBoxType = TypeBox.Never(opts);
            break;
        case ReflectionKind.any:
            typeBoxType = TypeBox.Any(opts);
            break;
        case ReflectionKind.unknown:
            typeBoxType = TypeBox.Unknown(opts);
            break;
        case ReflectionKind.void:
            typeBoxType = TypeBox.Void(opts);
            break;
        case ReflectionKind.object:
            typeBoxType = resolveObject(deepkitType, opts);
            break;
        case ReflectionKind.string:
            typeBoxType = TypeBox.String(opts);
            break;
        case ReflectionKind.number:
            typeBoxType = TypeBox.Number(opts);
            break;
        case ReflectionKind.boolean:
            typeBoxType = TypeBox.Boolean(opts);
            break;
        case ReflectionKind.symbol:
            typeBoxType = TypeBox.Symbol(opts);
            break;
        case ReflectionKind.bigint:
            typeBoxType = TypeBox.BigInt(opts);
            break;
        case ReflectionKind.null:
            typeBoxType = TypeBox.Null(opts);
            break;
        case ReflectionKind.undefined:
            typeBoxType = TypeBox.Undefined(opts);
            break;
        case ReflectionKind.regexp:
            // TODO , think we will have to Map The Deepkit Pattern Annotation to a TypeBox RegExp
            console.log('RegExp not supported yet', deepkitType);
            throw new Error('RegExp not supported yet');
        case ReflectionKind.literal:
            typeBoxType = resolveLiteral(deepkitType, opts);
            break;
        case ReflectionKind.templateLiteral:
            console.error('not implemented', deepkitType);
            throw new Error('not implemented');
            break;
        case ReflectionKind.property:
            typeBoxType = resolveProperty(deepkitType, opts, mapper);
            break;
        case ReflectionKind.method:
            typeBoxType = resolveMethod(deepkitType, opts, mapper);
            break;
        case ReflectionKind.function:
            typeBoxType = resolveFunction(deepkitType, opts, mapper);
            break;
        case ReflectionKind.parameter:
            typeBoxType = resolveParameter(deepkitType, opts, mapper);
            break;
        case ReflectionKind.promise:
            console.error('not implemented', deepkitType);
            throw new Error('not implemented');
            break;
        case ReflectionKind.class:
            typeBoxType = resolveClassToTypeBox(deepkitType, opts, mapper);
            break;
        case ReflectionKind.typeParameter:
            typeBoxType = resolveTypeParameter(deepkitType, opts, mapper);
            break;
        case ReflectionKind.enum:
            typeBoxType = resolveEnum(deepkitType, opts);
            break;
        case ReflectionKind.union:
            typeBoxType = resolveUnion(deepkitType, opts, mapper);
            break;
        case ReflectionKind.intersection:
            typeBoxType = resolveIntersection(deepkitType, opts, mapper);
            break;
        case ReflectionKind.array:
            typeBoxType = resolveArray(deepkitType, opts, mapper);
            break;
        case ReflectionKind.tuple:
            typeBoxType = resolveTuple(deepkitType, opts, mapper);
            break;
        case ReflectionKind.tupleMember:
            typeBoxType = resolveTupleMember(deepkitType, opts, mapper);
            break;
        case ReflectionKind.enumMember:
            throw new Error('Enum Members can not be resolved individually, call resolveEnum instead.');
            break;
        case ReflectionKind.rest:
            console.error('not implemented', deepkitType);
            throw new Error('not implemented');
            break;
        case ReflectionKind.objectLiteral:
            typeBoxType = resolveObjectLiteral(deepkitType, opts, mapper);
            break;
        case ReflectionKind.indexSignature:
            // TODO: Implement support for call and index signatures
            throw new Error(
                `Typebox does not support indexSignatures i.e. interface ModernConstants{ pi: 3.14159; [key: string]: string; } https://www.typescriptlang.org/glossary#index-signatures`
            );
        case ReflectionKind.propertySignature:
            typeBoxType = resolvePropertySignature(deepkitType, opts, mapper);
            break;
        case ReflectionKind.methodSignature:
            typeBoxType = resolveMethodSignature(deepkitType, opts, mapper);
            break;
        case ReflectionKind.infer:
            throw new Error(
                'Typebox does not support conditional types, ie: type typeBoxType =Type<T> = T extends (...args: any[]) => infer R ? R : any; https://www.typescriptlang.org/docs/handbook/2/conditional-types.html'
            );
        case ReflectionKind.callSignature:
            typeBoxType = resolveCallSignature(deepkitType, opts, mapper);
            break;
        default:
            typeBoxType = TypeBox.Any();
            break;
    }

    if (typeBoxType.description) typeBoxType.description = deepkitType.description;

    return typeBoxType;
}
