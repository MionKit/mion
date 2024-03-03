/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeObject} from '@deepkit/type';
import {SchemaOptions, TObject, TProperties, Type as TypeBox} from '@sinclair/typebox';

export function resolveObject(deepkitType: TypeObject, opts: SchemaOptions): TObject {
    const properties: TProperties = {};
    return TypeBox.Object(properties, opts);
}
