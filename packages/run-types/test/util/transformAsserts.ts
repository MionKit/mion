// Shared assertion helper for the format-transform suite — extracted from the
// former per-function runner so the per-subgroup files can import it.

import {expect} from 'vitest';
import type {FormatTransformCase} from '../suites/format-transform/types.ts';

/** Drives a format-transform case: builds the transform fn and asserts each
 *  input maps to its expected output (identity for non-transforming formats). **/
export function assertFormatTransform(c: FormatTransformCase): void {
  const transform = c.formatTransform();
  c.getCases().forEach(({input, expected}, i) => {
    expect(transform(input), `${c.title}: case[${i}] transform output`).toEqual(expected);
  });
}
