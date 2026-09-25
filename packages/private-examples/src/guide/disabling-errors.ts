/* @mion-downgrade-error VL002 */
import {createValidateFn} from '@mionjs/run-types';

// both raise VL002; the file comment above makes them warnings
export const validateSymbol = createValidateFn<symbol>();
export const validateAnotherSymbol = createValidateFn<symbol>();

// the line comment hides this one completely
// @mion-expect-error VL002
export const validateSymbolQuietly = createValidateFn<symbol>();
