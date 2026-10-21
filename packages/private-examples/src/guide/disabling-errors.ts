/* @mion-downgrade-error validate-symbol-root */
import {createValidateFn} from '@mionjs/run-types';

// both raise validate-symbol-root; the file comment above makes them warnings
export const validateSymbol = createValidateFn<symbol>();
export const validateAnotherSymbol = createValidateFn<symbol>();

// the line comment hides this one completely
// @mion-expect-error validate-symbol-root
export const validateSymbolQuietly = createValidateFn<symbol>();
