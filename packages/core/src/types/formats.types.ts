/* eslint-disable @typescript-eslint/no-unused-vars */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Alias types for TypeFormat extraction.
 *
 * These types mirror the structure from @deepkit/core and @mionkit/run-types
 * but are defined locally to avoid importing those packages in core.
 *
 * The actual TypeFormat from run-types uses:
 *   TypeFormat<BaseType, Name, P> = BaseType & TypeAnnotation<Name, P>
 *
 * Where TypeAnnotation from deepkit is `unknown` at type level but has
 * runtime metadata. TypeScript's conditional types can still match the
 * structure and extract params P.
 */

import type {TypeFormatParams} from './general.types';

// ============================================================================
// Alias Types - Mirror external package types for extraction
// ============================================================================

/**
 * Alias for TypeAnnotation from @deepkit/core.
 * At type level this is `unknown`, but we need the structure for extraction.
 */
export type AliasTypeAnnotation<Name extends string, Options = never> = unknown;

/**
 * Alias for TypeFormat from @mionkit/run-types.
 * This is how format types (StrFormat, NumFormat, etc.) are defined.
 */
export type AliasTypeFormat<
    BaseType extends string | number | bigint,
    Name extends string,
    P extends TypeFormatParams,
> = BaseType & AliasTypeAnnotation<Name, P>;

// ============================================================================
// Format Params Extraction
// ============================================================================

/**
 * Extract format params P from a TypeFormat branded type.
 * Returns undefined if T is not a TypeFormat.
 *
 * Works because TypeScript conditional types can infer P from the structure
 * even though AliasTypeAnnotation resolves to `unknown`.
 */
export type ExtractFormatParams<T> = T extends AliasTypeFormat<infer Base, infer Name, infer P> ? P : undefined;
