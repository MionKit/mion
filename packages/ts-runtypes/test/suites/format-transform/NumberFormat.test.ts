// format-transform / NumberFormat — every NUMBER_FORMAT case run through the format transform, delegating to
// its shared helper in util/transformAsserts.ts.
import {describe, it} from 'vitest';
import {NUMBER_FORMAT} from './NumberFormat.ts';
import {assertFormatTransform} from '../../util/transformAsserts.ts';

describe('format-transform / NumberFormat', () => {
  for (const c of Object.values(NUMBER_FORMAT)) {
    it(`transform — ${c.title}`, () => assertFormatTransform(c));
  }
});
