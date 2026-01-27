/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {FormatName} from '@mionkit/type-formats';

/** Custom error class for drizzle-mion integration errors */
export class DrizzleMionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DrizzleMionError';
    }
}

/** Error messages for common scenarios */
export const ErrorMessages = {
    TYPE_MISMATCH: (prop: string, expected: string, actual: string) =>
        `Type mismatch for property "${prop}": TypeScript type expects ${expected}, but drizzle column is "${actual}"`,
    EXTRA_COLUMN: (column: string, typeName: string) => `Column "${column}" exists in tableConfig but not in type "${typeName}"`,
    NULLABILITY_MISMATCH: (prop: string) => `Property "${prop}" is optional in type but column has .notNull() constraint`,
    INVALID_TYPE: (kindName: string) => `drizzle table type must be an object/interface type, got: "${kindName}"`,
    UNSUPPORTED_PRIMITIVE: (kind: string) => `Unsupported primitive type: ${kind}`,
    UNSUPPORTED_FORMAT: (formatName: FormatName) => `Unsupported format type: ${formatName}`,
};
