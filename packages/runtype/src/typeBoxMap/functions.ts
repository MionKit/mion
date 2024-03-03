/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SchemaOptions, TFunction, Type as TypeBox} from '@sinclair/typebox';
import {TypeCallSignature, TypeFunction, TypeMethod, TypeMethodSignature} from '@deepkit/type';
import {DeepkitVisitor} from '../types';

export function resolveFunction(
    deepkitType: TypeMethod | TypeMethodSignature | TypeFunction | TypeCallSignature,
    opts: SchemaOptions,
    resolveTypeBox: DeepkitVisitor
): TFunction {
    const parameters = deepkitType.parameters.map((p) => resolveTypeBox(p, {}));
    const returnType = resolveTypeBox(deepkitType.return, {});
    const fn = TypeBox.Function(parameters, returnType, opts);
    if ((deepkitType as TypeMethod).optional) return TypeBox.Optional(fn);
    else return fn;
}

export function resolveCallSignature(
    deepkitType: TypeCallSignature,
    opts: SchemaOptions,
    resolveTypeBox: DeepkitVisitor
): TFunction {
    return resolveFunction(deepkitType, opts, resolveTypeBox);
}

export function resolveMethod(deepkitType: TypeMethod, opts: SchemaOptions, resolveTypeBox: DeepkitVisitor): TFunction {
    return resolveFunction(deepkitType, opts, resolveTypeBox);
}

export function resolveMethodSignature(
    deepkitType: TypeMethodSignature,
    opts: SchemaOptions,
    resolveTypeBox: DeepkitVisitor
): TFunction {
    return resolveFunction(deepkitType, opts, resolveTypeBox);
}
