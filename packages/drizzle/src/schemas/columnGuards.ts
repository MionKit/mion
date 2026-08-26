/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Column} from 'drizzle-orm';
import type {RTValidationError, RTValidationErrorPathSegment} from '@ts-runtypes/core';

/** One runtime guard for a column: returns an error entry or undefined. Null/undefined values
 *  are skipped by the caller (nullability belongs to the compiled validator). */
export interface ColumnGuard {
  key: string;
  check: (value: unknown) => RTValidationError | undefined;
}

/** Builds guards from table column metadata the compiled validator cannot know.
 *  Currently: max length on string columns that carry a `length` (varchar/char).
 *  Enum membership needs NO guard: enum-carrying columns type as literal unions in the
 *  inferred model, so the compiled validator already enforces them. */
export function buildColumnGuards(columns: Record<string, Column>): ColumnGuard[] {
  const guards: ColumnGuard[] = [];
  for (const [key, column] of Object.entries(columns)) {
    // `length` lives on varchar/char subclasses only, never on the base Column
    const length = 'length' in column ? (column as unknown as {length?: number}).length : undefined;
    if (typeof length === 'number' && column.dataType === 'string') {
      guards.push({
        key,
        check: (value) => {
          if (typeof value !== 'string' || value.length <= length) return undefined;
          // stringFormat-shaped entry so friendly-text tooling renders it like a maxLength violation
          return {path: [key], expected: 'stringFormat', format: {name: 'stringFormat', val: length, formatPath: ['maxLength']}};
        },
      });
    }
  }
  return guards;
}

/** Error entry for a failed refine: `val` carries the custom message when the refine returned one. */
export function refineError(key: string, message: string | undefined): RTValidationError {
  return {
    path: [key],
    expected: 'refine',
    format: {name: 'refine', val: (message ?? key) as RTValidationErrorPathSegment, formatPath: ['refine']},
  };
}
