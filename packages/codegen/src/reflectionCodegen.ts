/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {reflect, ReflectionKind, Type, TypeParameter} from '@deepkit/type';
import {isFunctionType} from '@mionkit/runtype';
// import {inspect} from 'util';

// type references, would need to imported into the generated spec (Not used as for now)
const requiredTypes: Map<string, Type> = new Map();

export const parametersToSrcCode = (path: string, handler: (...args: any[]) => any, type?: Type): {[key: string]: string} => {
    const handlerType = type || reflect(handler);
    if (!isFunctionType(handlerType)) throw new Error('Invalid handler type must be a function');
    const paramNames: {[key: string]: string} = {};
    handlerType.parameters.forEach((pt) => {
        // console.log(inspect(pt, false, 5, true));
        paramNames[pt.name] = validateAndGetType(pt.type, `${path}.${pt.name}`, false);
    });
    return paramNames;
};

export const returnToSrcCode = (path: string, handler: (...args: any[]) => any, type?: Type): string => {
    const handlerType = type || reflect(handler);
    if (!isFunctionType(handlerType)) throw new Error('Invalid handler type must be a function');
    return validateAndGetType(handlerType.return, path, true);
};

const validateAndGetType = (t: Type, path: string, isReturn: boolean): string => {
    // console.log(path+t., t.kind, getReflectionKindName(t.kind));
    // console.log(inspect(t, false, 5, true));
    const typeName = t.typeName;
    const typeArguments = resolveTypeArguments(path, isReturn, t.typeArguments);
    switch (t.kind) {
        // Promise can be used only as return type
        case ReflectionKind.promise:
            if (!isReturn) throw new Error(`Invalid Handler in ${path}, parameters can't be promises`);
            return `Promise<${validateAndGetType(t.type, path, isReturn)}>`;
        // invalid params or return handler types
        case ReflectionKind.function:
        case ReflectionKind.method:
        case ReflectionKind.methodSignature:
        case ReflectionKind.never:
        case ReflectionKind.parameter:
        case ReflectionKind.property:
        case ReflectionKind.regexp: // TODO should we allow and add automatic serialization/deserialization
        case ReflectionKind.templateLiteral:
        case ReflectionKind.typeParameter:
        case ReflectionKind.rest: // TODO, should we allow rest parameters?
        case ReflectionKind.indexSignature:
        case ReflectionKind.infer:
            throw new Error(
                `Invalid Handler in ${path}, ${isReturn ? 'Return' : 'Parameter'} can't be of type ${getReflectionKindName(
                    t.kind
                )}.`
            );
        case ReflectionKind.void:
            if (!isReturn)
                throw new Error(
                    `Invalid Handler in ${path}, Parameter ${
                        (t as unknown as TypeParameter).name
                    } can't be of type ${getReflectionKindName(t.kind)}.`
                );
            else return 'void';

        // primitives
        case ReflectionKind.undefined:
        case ReflectionKind.any:
        case ReflectionKind.null:
        case ReflectionKind.number:
        case ReflectionKind.string:
        case ReflectionKind.symbol: // TODO needs automatic serialization/deserialization
        case ReflectionKind.unknown:
        case ReflectionKind.bigint: // TODO needs automatic serialization/deserialization
        case ReflectionKind.boolean:
            return getReflectionKindName(t.kind);

        // list, objects, etc
        case ReflectionKind.array:
            return validateAndGetType(t.type, path, isReturn) + '[]';
        case ReflectionKind.union:
            return '(' + t.types.map((subT) => validateAndGetType(subT, path, isReturn)).join(' | ') + ')';
        case ReflectionKind.tuple:
            return '[' + t.types.map((subT) => validateAndGetType(subT, path, isReturn)).join(' , ') + ']';
        case ReflectionKind.tupleMember:
            return validateAndGetType(t.type, path, isReturn);
        case ReflectionKind.intersection:
            return '(' + t.types.map((subT) => validateAndGetType(subT, path, isReturn)).join(' & ') + ')';
        case ReflectionKind.objectLiteral:
            if (typeName) {
                requiredTypes.set(typeName, t);
                return typeName + typeArguments;
            }
            // better use ',' than ';' for object literals in parameters
            return '{' + t.types.map((subT) => validateAndGetType(subT, path, isReturn)).join(' , ') + '}';
        case ReflectionKind.propertySignature:
            return (
                sanitizePropertyName(t.name?.toString() || (t.name as string)) +
                ' : ' +
                validateAndGetType(t.type, path, isReturn)
            );
        case ReflectionKind.class:
            requiredTypes.set(t.classType.name, t);
            return t.classType.name + typeArguments;
        case ReflectionKind.literal:
            return JSON.stringify(t.literal);
        case ReflectionKind.enumMember:
        case ReflectionKind.object:
        case ReflectionKind.enum: // TODO needs automatic serialization/deserialization
        default:
            if (!typeName) throw new Error(`Invalid Handler in ${path}, can't infer ${isReturn ? 'return' : 'parameter'} type.`);
            requiredTypes.set(typeName, t);
            return typeName + typeArguments;
    }
};

const resolveTypeArguments = (path: string, isReturn: boolean, typeArguments?: Type[]) => {
    if (!typeArguments?.length) return '';
    return '<' + typeArguments.map((argT) => validateAndGetType(argT, path, isReturn)).join(' , ') + '>';
};

const getReflectionKindName = (enumValue: number): string => {
    const keys = Object.keys(ReflectionKind).filter((x) => ReflectionKind[x] == enumValue);
    return keys.length > 0 ? keys[0] : '';
};

const sanitizePropertyName = (propertyName: string) => {
    return propertyName.match(/[\W]+/g) ? JSON.stringify(propertyName) : propertyName;
};
