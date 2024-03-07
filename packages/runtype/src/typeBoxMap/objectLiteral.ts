/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SchemaOptions, TObject, TProperties, Type as TypeBox} from '@sinclair/typebox';
import {ReflectionKind, TypeObjectLiteral} from '@deepkit/type';
import {DeepkitVisitor} from '../typeBoxTypes';

export function resolveObjectLiteral(
    deepkitType: TypeObjectLiteral,
    opts: SchemaOptions,
    resolveTypeBox: DeepkitVisitor
): TObject {
    const properties: TProperties = {};

    deepkitType.types.forEach((type) => {
        switch (type.kind) {
            case ReflectionKind.callSignature:
                console.error('call signature', type);
                break;
            case ReflectionKind.propertySignature:
            case ReflectionKind.methodSignature:
                // TODO: check if adding methods to interfaces affects performance, if so we could remove them
                if (typeof type.name === 'symbol')
                    throw new Error(`Typebox does not support symbol property names. symbol name ${type.name.toString()}`);
                const property = resolveTypeBox(type, opts); // eslint-disable-line no-case-declarations
                if (type.optional && (type as any).readonly) properties[type.name] = TypeBox.ReadonlyOptional(property);
                else if (type.optional) properties[type.name] = TypeBox.Optional(property);
                else if ((type as any).readonly) properties[type.name] = TypeBox.Readonly(property);
                else properties[type.name] = property;
                break;
            case ReflectionKind.indexSignature:
                throw new Error(
                    `Typebox does not support indexSignatures i.e. interface ModernConstants{ pi: 3.14159; [key: string]: string; } https://www.typescriptlang.org/glossary#index-signatures`
                );
        }
    });
    return TypeBox.Object(properties, opts);
}
