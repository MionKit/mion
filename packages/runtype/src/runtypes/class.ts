/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SchemaOptions, TObject, TProperties, Type as TypeBox} from '@sinclair/typebox';
import {ReflectionKind, TypeClass, TypeMethod} from '@deepkit/type';
import {DeepkitVisitor} from '../types';

// TODO: seems that constructor represents type T = new(...args: [string, number]) => boolean; rather than a class constructor
export function resolveConstructor(deepkitType: TypeMethod, opts: SchemaOptions, resolveTypeBox: DeepkitVisitor) {
    const parameters = deepkitType.parameters.map((p) => resolveTypeBox(p, {}));
    const returnType = resolveTypeBox(deepkitType.return, {});
    return TypeBox.Constructor(parameters, returnType);
}

export function resolveClassToTypeBox(deepkitType: TypeClass, opts: SchemaOptions, resolveTypeBox: DeepkitVisitor): TObject {
    const classMembers: TProperties = {};
    deepkitType.types.forEach((type) => {
        switch (type.kind) {
            case ReflectionKind.method:
            case ReflectionKind.property:
                // TODO: check if adding methods to classMembers affects performance, if so we could remove them
                if (typeof type.name === 'symbol')
                    throw new Error(`Typebox does not support symbol property names. symbol name ${type.name.toString()}`);
                return (classMembers[type.name] = resolveTypeBox(type, {}));
            case ReflectionKind.indexSignature:
                throw new Error(
                    `Typebox does not support indexSignatures i.e. class ModernConstants{ pi: 3.14159; [key: string]: string; } https://www.typescriptlang.org/glossary#index-signatures`
                );
        }
    });
    return TypeBox.Object(classMembers, opts) as any;
}
