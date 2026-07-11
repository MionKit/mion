/* ###############
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ############### */

/**
 * Recursively normalizes values for comparison, handling arrays with optional elements.
 * Returns an object with normalized actual and expected values for direct comparison.
 *
 * This is needed because Vitest's toEqual is stricter than Jest's when comparing arrays
 * with optional/undefined elements. For example:
 * - Jest: [446] equals [446, undefined, undefined, undefined] // true
 * - Vitest: [446] equals [446, undefined, undefined, undefined] // false
 *
 * This function pads shorter arrays with undefined to match the longer array's length,
 * then recursively normalizes nested values.
 */
export function normalizeForComparison(actual: any, expected: any): {actual: any; expected: any} {
    // Handle arrays - normalize length to match expected
    if (Array.isArray(actual) && Array.isArray(expected)) {
        const maxLength = Math.max(actual.length, expected.length);
        const normalizedActual = normalizeArrayForComparison(actual, maxLength);
        const normalizedExpected = normalizeArrayForComparison(expected, maxLength);
        const resultActual: any[] = [];
        const resultExpected: any[] = [];
        for (let i = 0; i < maxLength; i++) {
            const normalized = normalizeForComparison(normalizedActual[i], normalizedExpected[i]);
            resultActual.push(normalized.actual);
            resultExpected.push(normalized.expected);
        }
        return {actual: resultActual, expected: resultExpected};
    }
    // Handle nested objects
    if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
        const actualKeys = Object.keys(actual);
        const expectedKeys = Object.keys(expected);
        const allKeys = [...new Set([...actualKeys, ...expectedKeys])];
        const resultActual: any = {};
        const resultExpected: any = {};
        for (const key of allKeys) {
            const normalized = normalizeForComparison(actual[key], expected[key]);
            resultActual[key] = normalized.actual;
            resultExpected[key] = normalized.expected;
        }
        return {actual: resultActual, expected: resultExpected};
    }
    // Primitive values - return as-is
    return {actual, expected};
}

/**
 * Normalizes arrays for comparison by padding shorter arrays with undefined values.
 * This handles the difference between Jest and Vitest's toEqual behavior with optional tuple elements.
 * Jest considered [446] and [446, undefined, undefined, undefined] as equal,
 * but Vitest is stricter and requires explicit undefined values.
 */
function normalizeArrayForComparison(arr: any[], targetLength: number): any[] {
    if (arr.length >= targetLength) return arr;
    return [...arr, ...Array(targetLength - arr.length).fill(undefined)];
}
