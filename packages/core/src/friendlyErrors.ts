/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {
    RunTypeError,
    StrNumber,
    PathSegment,
    MapKeyPathSegment,
    MapValuePathSegment,
    SetItemPathSegment,
} from './types/general.types';
import type {FriendlyErrors, FriendlyErrorsResult, AnyFriendlyErrorParams, TypeErrorParam} from './types/friendlyErrors.types';
import {isTestEnv} from './utils';

// ============================================================================
// Map/Set Path Type Guards
// ============================================================================

/** Check if a path segment is a Map key error */
function isMapKeyPath(segment: unknown): segment is MapKeyPathSegment {
    return (
        typeof segment === 'object' &&
        segment !== null &&
        'failed' in segment &&
        (segment as MapKeyPathSegment).failed === 'mapKey'
    );
}

/** Check if a path segment is a Map value error */
function isMapValuePath(segment: unknown): segment is MapValuePathSegment {
    return (
        typeof segment === 'object' &&
        segment !== null &&
        'failed' in segment &&
        (segment as MapValuePathSegment).failed === 'mapVal'
    );
}

/** Check if a path segment is a Set item error (has key and index but no failed property) */
function isSetItemPath(segment: unknown): segment is SetItemPathSegment {
    return typeof segment === 'object' && segment !== null && 'key' in segment && 'index' in segment && !('failed' in segment);
}

// ============================================================================
// Default Error Printer
// ============================================================================

/**
 * Default error message generator used when no handler is provided.
 * Generates a human-readable message from the RunTypeError.
 * Uses only the last item in the path (the property that failed).
 */
export function defaultErrorPrinter(error: RunTypeError): string {
    const lastSegment = error.path.length > 0 ? error.path[error.path.length - 1] : 'value';

    // Handle Map/Set path segments
    let prop: StrNumber;
    if (isMapKeyPath(lastSegment)) {
        prop = `mapKey[${lastSegment.index}]`;
    } else if (isMapValuePath(lastSegment)) {
        prop = `mapValue[${lastSegment.index}]`;
    } else if (isSetItemPath(lastSegment)) {
        prop = `setItem[${lastSegment.index}]`;
    } else {
        prop = lastSegment as StrNumber;
    }

    if (error.format) {
        const param = error.format.formatPath[0];
        return `${prop}: ${param} validation failed (expected ${error.format.val})`;
    }
    return `${prop}: expected ${error.expected}`;
}

// ============================================================================
// Aggregated Error Params
// ============================================================================

/**
 * Aggregated error params for a single field.
 * Contains all format errors merged together plus the base TypeErrorParam fields.
 */
type AggregatedErrorParams = TypeErrorParam & {
    /** All RunTypeErrors for this field */
    rtErrors: RunTypeError[];
    /** For Map errors: whether this is a key or value error */
    mapErrorType?: 'key' | 'value';
};

/**
 * Merges a RunTypeError into an existing aggregated params object.
 * If error has format, adds the format param key to the object.
 */
function mergeErrorIntoParams(params: AggregatedErrorParams, error: RunTypeError): void {
    params.rtErrors.push(error);
    // Update rtError to the latest error (for backward compatibility)
    params.rtError = error;
    if (error.format) {
        const paramKey = error.format.formatPath[0];
        (params as Record<string, unknown>)[paramKey] = error.format;
    }
}

/**
 * Creates initial aggregated error params from a RunTypeError.
 */
function createAggregatedParams(error: RunTypeError): AggregatedErrorParams {
    const lastSegment = error.path[error.path.length - 1];

    let propName: string | number;
    let index: number | undefined;
    let mapErrorType: 'key' | 'value' | undefined;

    if (isMapKeyPath(lastSegment)) {
        propName = lastSegment.index;
        index = lastSegment.index;
        mapErrorType = 'key';
    } else if (isMapValuePath(lastSegment)) {
        propName = lastSegment.index;
        index = lastSegment.index;
        mapErrorType = 'value';
    } else if (isSetItemPath(lastSegment)) {
        propName = lastSegment.index;
        index = lastSegment.index;
    } else {
        propName = lastSegment as StrNumber;
        index = typeof propName === 'number' ? propName : undefined;
    }

    const params: AggregatedErrorParams = {
        rtError: error,
        rtErrors: [error],
        propName,
        index,
        mapErrorType,
    };

    if (error.format) {
        const paramKey = error.format.formatPath[0];
        (params as Record<string, unknown>)[paramKey] = error.format;
    }

    return params;
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Converts a path array to a string key for grouping errors.
 * Handles Map/Set path segments by converting them to a string representation.
 */
function pathToKey(path: PathSegment[]): string {
    return path
        .map((segment) => {
            if (isMapKeyPath(segment)) {
                return `$mapKey[${segment.index}]`;
            } else if (isMapValuePath(segment)) {
                return `$mapVal[${segment.index}]`;
            } else if (isSetItemPath(segment)) {
                return `$setItem[${segment.index}]`;
            }
            return String(segment);
        })
        .join('.');
}

/**
 * Gets or creates a nested object at the given path.
 * Returns the target object and the final key.
 * Handles Map/Set path segments by creating appropriate result structure.
 */
function getOrCreatePath(
    obj: Record<StrNumber, unknown>,
    path: PathSegment[]
): {target: Record<StrNumber, unknown>; key: StrNumber} | null {
    if (path.length === 0) return null;

    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
        const segment = path[i];

        let key: StrNumber;
        if (isMapKeyPath(segment)) {
            // For Map key errors, create $keys container
            if (current['$keys'] === undefined) {
                current['$keys'] = {};
            }
            current = current['$keys'] as Record<StrNumber, unknown>;
            key = segment.index;
        } else if (isMapValuePath(segment)) {
            // For Map value errors, create $values container
            if (current['$values'] === undefined) {
                current['$values'] = {};
            }
            current = current['$values'] as Record<StrNumber, unknown>;
            key = segment.index;
        } else if (isSetItemPath(segment)) {
            // For Set item errors, use index directly
            key = segment.index;
        } else {
            key = segment as StrNumber;
        }

        if (current[key] === undefined) {
            current[key] = {};
        }
        current = current[key] as Record<StrNumber, unknown>;
    }

    // Handle the final segment
    const lastSegment = path[path.length - 1];
    let finalKey: StrNumber;

    if (isMapKeyPath(lastSegment)) {
        // For Map key errors at the end, create $keys container
        if (current['$keys'] === undefined) {
            current['$keys'] = {};
        }
        return {target: current['$keys'] as Record<StrNumber, unknown>, key: lastSegment.index};
    } else if (isMapValuePath(lastSegment)) {
        // For Map value errors at the end, create $values container
        if (current['$values'] === undefined) {
            current['$values'] = {};
        }
        return {target: current['$values'] as Record<StrNumber, unknown>, key: lastSegment.index};
    } else if (isSetItemPath(lastSegment)) {
        // For Set item errors, use index directly
        finalKey = lastSegment.index;
    } else {
        finalKey = lastSegment as StrNumber;
    }

    return {target: current, key: finalKey};
}

// ============================================================================
// Handler Lookup
// ============================================================================

/** Runtime type for error params - union of all possible error param types */
type RuntimeErrorParams = AnyFriendlyErrorParams | TypeErrorParam;

/**
 * Gets the handler for a given path from the errors map.
 * Returns null if no handler is found.
 * For arrays, the handler at the array property level applies to all indices.
 * For Maps, looks for $key or $value handlers.
 * For Sets, looks for $item handler.
 */
function getHandler<T>(
    errorsMap: FriendlyErrors<T> | undefined,
    path: PathSegment[]
): ((errors: RuntimeErrorParams) => string) | null {
    if (!errorsMap) return null;

    // Handle top-level array/Map/Set (errorsMap is a function)
    if (typeof errorsMap === 'function') {
        return errorsMap as (errors: RuntimeErrorParams) => string;
    }

    let current: unknown = errorsMap;

    for (let i = 0; i < path.length; i++) {
        const segment = path[i];
        if (current === undefined || current === null) return null;

        // Handle Map path segments
        if (isMapKeyPath(segment)) {
            // Look for $key handler
            if (typeof current === 'object' && current !== null && '$key' in current) {
                const keyHandler = (current as Record<string, unknown>)['$key'];
                if (typeof keyHandler === 'function') {
                    return keyHandler as (errors: RuntimeErrorParams) => string;
                }
            }
            // If current is a function, it's a handler for the whole Map
            if (typeof current === 'function') {
                return current as (errors: RuntimeErrorParams) => string;
            }
            return null;
        }

        if (isMapValuePath(segment)) {
            // Look for $value handler
            if (typeof current === 'object' && current !== null && '$value' in current) {
                const valueHandler = (current as Record<string, unknown>)['$value'];
                if (typeof valueHandler === 'function') {
                    return valueHandler as (errors: RuntimeErrorParams) => string;
                }
                // $value could be a nested FriendlyErrors object
                current = valueHandler;
                continue;
            }
            // If current is a function, it's a handler for the whole Map
            if (typeof current === 'function') {
                return current as (errors: RuntimeErrorParams) => string;
            }
            return null;
        }

        if (isSetItemPath(segment)) {
            // Look for $item handler
            if (typeof current === 'object' && current !== null && '$item' in current) {
                const itemHandler = (current as Record<string, unknown>)['$item'];
                if (typeof itemHandler === 'function') {
                    return itemHandler as (errors: RuntimeErrorParams) => string;
                }
                // $item could be a nested FriendlyErrors object
                current = itemHandler;
                continue;
            }
            // If current is a function, it's a handler for the whole Set
            if (typeof current === 'function') {
                return current as (errors: RuntimeErrorParams) => string;
            }
            return null;
        }

        // Skip numeric segments (array indices) - handlers apply to all indices
        // But if current is already a function, return it (handler for array elements)
        if (typeof segment === 'number') {
            if (typeof current === 'function') {
                return current as (errors: RuntimeErrorParams) => string;
            }
            continue;
        }

        // If current is a function but we have more non-numeric path segments, no handler found
        if (typeof current === 'function') return null;

        current = (current as Record<string, unknown>)[segment];
    }

    if (typeof current === 'function') {
        return current as (errors: RuntimeErrorParams) => string;
    }
    return null;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Converts RunTypeError[] to friendly error messages using the provided error map.
 * Aggregates all validation errors per field before calling the error printer function once.
 * For properties without a handler, default error messages are generated and joined.
 *
 * Supports:
 * - Objects with nested properties
 * - Arrays (top-level and nested)
 * - Maps with separate $key and $value handlers
 * - Sets with $item handler
 *
 * @param errors - Array of validation errors from createTypeErrorsFn
 * @param errorsMap - Object mapping properties to error printer functions (optional)
 * @returns Object with same shape as T containing only properties with errors (single string per field)
 */
export function getFriendlyErrors<T>(errors: RunTypeError[], errorsMap?: FriendlyErrors<T>): FriendlyErrorsResult<T> {
    const result: Record<StrNumber, unknown> = {};

    // Step 1: Group errors by path and aggregate params
    const aggregatedByPath = new Map<string, AggregatedErrorParams>();

    for (const error of errors) {
        const pathKey = pathToKey(error.path as PathSegment[]);
        const existing = aggregatedByPath.get(pathKey);

        if (existing) {
            // Merge this error into existing aggregated params
            mergeErrorIntoParams(existing, error);
        } else {
            // Create new aggregated params for this path
            aggregatedByPath.set(pathKey, createAggregatedParams(error));
        }
    }

    // Step 2: Process each aggregated field and call handlers once per field
    for (const [pathKey, aggregatedParams] of aggregatedByPath) {
        const path = aggregatedParams.rtErrors[0].path as PathSegment[];
        const handler = getHandler(errorsMap, path);
        let message: string;

        if (handler) {
            // Call handler once with all aggregated params for this field
            message = handler(aggregatedParams);
        } else {
            // No handler: use defaultErrorPrinter for each error and join messages
            if (!isTestEnv()) {
                console.warn(
                    `[mion] Using defaultErrorPrinter for "${pathKey || '$root'}". ` +
                        `Consider providing a custom error handler for better user-facing messages.`
                );
            }
            // Generate default messages for all errors at this path and join them
            const messages = aggregatedParams.rtErrors.map((err) => defaultErrorPrinter(err));
            // Remove duplicates and join into single string
            message = [...new Set(messages)].join('; ');
        }

        // Store the single message
        if (path.length === 0) {
            // Root level error
            result['$root'] = message;
        } else {
            const pathInfo = getOrCreatePath(result, path);
            if (pathInfo) {
                const {target, key} = pathInfo;
                target[key] = message;
            }
        }
    }

    return result as FriendlyErrorsResult<T>;
}
