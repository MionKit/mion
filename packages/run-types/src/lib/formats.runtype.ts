/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
// ###################### Types FORMATS #####################

import {TypeAnnotation} from '@deepkit/core';
// ⚠️ CRITICAL: Do NOT use `import type` - Deepkit needs the actual import for reflection!
import {TypeFormatParams, Brand} from '@mionkit/core';

/**
 * A base type that satisfies some extra constrains. (at the moment only Branded types of strings and numbers are supported)
 * ie: an Alphanumeric type is an string that only allow letters and numbers.
 * ie: in Integer type is a number that only allow integer values.
 *
 * TypeFormat is the equivalent ot TypeAnnotation in DK but with slight modifications @deepkit/type<TypeAnnotation>
 *
 * @param BaseType - The base type (string, number, or bigint)
 * @param Name - The format name used for runtime validation
 * @param P - Format parameters for validation rules
 * @param BrandName - Optional brand name for nominal typing (defaults to never = no brand)
 *
 * When BrandName is provided, the type becomes nominally branded, preventing
 * accidental assignment of plain strings/numbers to branded types.
 * */
export type TypeFormat<
    BaseType extends string | number | bigint,
    Name extends string,
    P extends TypeFormatParams,
    BrandName extends string = never,
> = BrandName extends never
    ? BaseType & TypeAnnotation<Name, P>
    : Brand<BaseType, BrandName> & TypeAnnotation<Name, P & {brand: BrandName}>;
