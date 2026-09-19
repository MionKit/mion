/* @mion-downgrade-error VL002 */
// Top of the file, so this covers the whole file: every VL002 below is a
// warning and the build still passes. Drop the code to cover every error.

import {createValidateFn} from '@mionjs/run-types';

// A symbol holds no value to check, so both of these raise VL002.
export const validateSymbol = createValidateFn<symbol>();
export const validateAnotherSymbol = createValidateFn<symbol>();

// A // comment covers only the line under it, and expect-error hides the error
// instead of turning it into a warning. This one prints nothing at all.
// @mion-expect-error VL002
export const validateSymbolQuietly = createValidateFn<symbol>();
