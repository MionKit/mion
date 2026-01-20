/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Prettify, RunTypeError, StrNumber} from './types/general.types';
import type {FriendlyErrors, FriendlyErrorsResult, AnyFriendlyErrorParams, TypeErrorParam} from './types/friendlyErrors.types';

// ============================================================================
// Default Error Printer
// ============================================================================

/**
 * Default error message generator used when no handler is provided.
 * Generates a human-readable message from the RunTypeError.
 * Uses only the last item in the path (the property that failed).
 *
 * @param error - The validation error
 * @returns A generic error message string
 */
export function defaultErrorPrinter(error: RunTypeError): string {
    const prop = error.path.length > 0 ? error.path[error.path.length - 1] : 'value';
    if (error.format) {
        const param = error.format.formatPath[0];
        return `${prop}: ${param} validation failed (expected ${error.format.val})`;
    }
    return `${prop}: expected ${error.expected}`;
}

// ============================================================================
// Error Params Builder
// ============================================================================

/**
 * Builds error params object from a RunTypeError.
 * If error has format, uses formatPath[0] as key.
 * If error has no format, sets $type to the full error.
 */
function buildErrorParams(error: RunTypeError): TypeErrorParam {
    const propName = error.path[error.path.length - 1];
    const isNumeric = typeof propName === 'number';
    const index = isNumeric ? Number(propName) : undefined;
    if (error.format) {
        const paramKey = error.format.formatPath[0];
        const err: TypeErrorParam = {rtError: error, propName, index, [paramKey]: error.format};
        return err;
    }
    const err: TypeErrorParam = {rtError: error, propName, index};
    return err;
}

// ============================================================================
// Path Navigation Helpers
// ============================================================================

/**
 * Gets or creates a nested object at the given path.
 * Returns the target object and the final key.
 */
function getOrCreatePath(
    obj: Record<StrNumber, unknown>,
    path: StrNumber[]
): {target: Record<StrNumber, unknown>; key: StrNumber} | null {
    if (path.length === 0) return null;

    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
        const segment = path[i];
        if (current[segment] === undefined) {
            current[segment] = {};
        }
        current = current[segment] as Record<StrNumber, unknown>;
    }

    return {target: current, key: path[path.length - 1]};
}

/** Runtime type for error params - union of all possible error param types */
type RuntimeErrorParams = AnyFriendlyErrorParams | TypeErrorParam;

/**
 * Gets the handler for a given path from the errors map.
 * Returns null if no handler is found.
 */
function getHandler<T>(
    errorsMap: FriendlyErrors<T> | undefined,
    path: StrNumber[]
): ((errors: RuntimeErrorParams) => string) | null {
    if (!errorsMap) return null;

    let current: unknown = errorsMap;
    for (const segment of path) {
        if (current === undefined || current === null) return null;
        if (typeof current === 'function') return null; // Found a function before reaching end of path

        // Skip numeric segments (array indices) - handlers apply to all indices
        if (typeof segment === 'number') continue;

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
 * Recursively converts all Sets to Arrays in an object.
 * Used to transform internal Set representation to array output.
 */
function convertSetsToArrays(obj: Record<StrNumber, unknown>): void {
    for (const key of Object.keys(obj)) {
        if (obj[key] instanceof Set) {
            obj[key] = [...(obj[key] as Set<string>)];
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            convertSetsToArrays(obj[key] as Record<StrNumber, unknown>);
        }
    }
}

/**
 * Converts RunTypeError[] to friendly error messages using the provided error map.
 * For properties without a handler, a default error message is generated.
 * Duplicate error messages are automatically removed.
 *
 * @param errors - Array of validation errors from createTypeErrorsFn
 * @param errorsMap - Object mapping properties to error printer functions (optional)
 * @returns Object with same shape as T containing only properties with errors (unique string arrays)
 */
export function getFriendlyErrors<T>(errors: RunTypeError[], errorsMap?: FriendlyErrors<T>): Prettify<FriendlyErrorsResult<T>> {
    const result: Record<StrNumber, unknown> = {};

    for (const error of errors) {
        const errorParams = buildErrorParams(error);
        const handler = getHandler(errorsMap, error.path);
        let message: string;

        if (handler) {
            message = handler(errorParams);
        } else {
            // Log warning when using default error printer (once per unique path)
            const pathKey = error.path.join('.');
            console.warn(
                `[mion] Using defaultErrorPrinter for "${pathKey || '$root'}". ` +
                    `Consider providing a custom error handler for better user-facing messages.`
            );
            message = defaultErrorPrinter(error);
        }

        if (error.path.length === 0) {
            // Root level error - shouldn't happen often but handle it
            if (!result['$root']) result['$root'] = new Set<string>();
            (result['$root'] as Set<string>).add(message);
            continue;
        }

        const pathInfo = getOrCreatePath(result, error.path);
        if (pathInfo) {
            const {target, key} = pathInfo;
            if (!target[key]) target[key] = new Set<string>();
            (target[key] as Set<string>).add(message);
        }
    }

    // Convert internal Sets to Arrays for FE-friendly output
    convertSetsToArrays(result);

    return result as FriendlyErrorsResult<T>;
}
