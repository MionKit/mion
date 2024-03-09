/* eslint-disable no-case-declarations */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, resolveReceiveType, ReceiveType, TypeObjectLiteral} from '@deepkit/type';
import {RunType, RunTypeVisitor} from './types';
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
import {ObjectLiteralRunType} from './collectionRunType/objectLiteral';
import {PropertySignatureRunType} from './singleRunType/property';
import {IndexSignatureRunType} from './collectionRunType';
import {MethodSignatureRunType} from './functionRunType/method';
import {CallSignatureRunType} from './functionRunType/call';
import {FunctionRunType} from './functionRunType/function';
import {PromiseRunType} from './singleRunType/promise';
// import {resolveAsyncIterator, resolveIterator} from './typeBoxMap/nativeObjectLiterals';

const MaxNestLevel = 100;

export function runType<T>(type?: ReceiveType<T>): RunType {
    type = resolveReceiveType(type);
    return visitor(type, -1);
}

// Map Deepkit Type to TypeBox Type
function visitor(deepkitType, nestLevel: number): RunType {
    // console.log(deepkitType);

    nestLevel += 1;
    if (nestLevel > MaxNestLevel) throw new Error('MaxNestLevel exceeded while resolving run type');
    let rt: RunType;

    switch (deepkitType.kind) {
        case ReflectionKind.any:
            rt = new AnyRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.array:
            rt = new ArrayRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.bigint:
            rt = new BigIntRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.boolean:
            rt = new BooleanRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.callSignature:
            rt = new CallSignatureRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.class:
            if (deepkitType.classType === Date) {
                rt = new DateRunType(deepkitType, visitor, nestLevel);
            } else {
                throw new Error('not implemented');
            }
            break;
        case ReflectionKind.enum:
            rt = new EnumRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.enumMember:
            // enum members are resolved by the enum type, so this is not expected to be called
            rt = new EnumMemberRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.function:
            rt = new FunctionRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.indexSignature:
            rt = new IndexSignatureRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.infer:
            throw new Error(
                'Infer type not supported, ie: type typeBoxType =Type<T> = T extends (...args: any[]) => infer R ? R : any; https://www.typescriptlang.org/docs/handbook/2/conditional-types.html'
            );
        case ReflectionKind.intersection:
            throw new Error('not implemented');
            // rType = resolveIntersection(deepkitType, opts, mapper);
            break;
        case ReflectionKind.literal:
            rt = new LiteralRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.method:
            throw new Error('not implemented');
            // rType = resolveMethod(deepkitType, opts, mapper);
            break;
        case ReflectionKind.methodSignature:
            rt = new MethodSignatureRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.null:
            rt = new NullRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.number:
            rt = new NumberRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.object:
            throw new Error('not implemented');
            break;
        case ReflectionKind.objectLiteral:
            const objLiteral = deepkitType as TypeObjectLiteral;
            const originTypeName = objLiteral.originTypes?.[0].typeName;
            const isNativeType = originTypeName && nativeTypeNamesFromObjectLiterals.includes(originTypeName);
            if (isNativeType) {
                rt = resolveNativeTypeFromObjectLiteral(objLiteral, originTypeName, objLiteral, visitor, nestLevel);
            } else {
                rt = new ObjectLiteralRunType(objLiteral, visitor, nestLevel);
            }
            break;
        case ReflectionKind.parameter:
            throw new Error('not implemented');
            // rType = resolveParameter(deepkitType, opts, mapper);
            break;
        case ReflectionKind.promise:
            rt = new PromiseRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.property:
            // rType = resolveProperty(deepkitType, opts, mapper);
            throw new Error('not implemented');
            break;
        case ReflectionKind.propertySignature:
            rt = new PropertySignatureRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.regexp:
            rt = new RegexpRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.rest:
            throw new Error('Typebox does not support rest parameters i.e. function foo(...args: number[]) {}');
            break;
        case ReflectionKind.string:
            rt = new StringRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.symbol:
            rt = new SymbolRunType(deepkitType, visitor, nestLevel);
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
            rt = new TupleRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.tupleMember:
            rt = new TupleMemberRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.typeParameter:
            throw new Error('not implemented');
            // rType = resolveTypeParameter(deepkitType, opts, mapper);
            break;
        case ReflectionKind.undefined:
            rt = new UndefinedRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.union:
            rt = new UnionRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.unknown:
            rt = new UnknownRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.void:
            rt = new VoidRunType(deepkitType, visitor, nestLevel);
            break;
        case ReflectionKind.never:
            rt = new NeverRunType(deepkitType, visitor, nestLevel);
            break;
        default:
            rt = new AnyRunType(deepkitType, visitor, nestLevel);
            break;
    }

    return rt;
}

const nativeTypeNamesFromObjectLiterals = ['AsyncIterator', 'Iterator'];

function resolveNativeTypeFromObjectLiteral(
    deepkitType: TypeObjectLiteral,
    nativeName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    src: TypeObjectLiteral,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    visitor: RunTypeVisitor,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    nestLevel: number
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
