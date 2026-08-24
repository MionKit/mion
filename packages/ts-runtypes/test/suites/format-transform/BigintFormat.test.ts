// format-transform / BigintFormat — every BIGINT_FORMAT case run through the format transform, delegating to
// its shared helper in util/transformAsserts.ts.
import {describe, it} from 'vitest';
import {BIGINT_FORMAT} from './BigintFormat.ts';
import {assertFormatTransform} from '../../util/transformAsserts.ts';

describe('format-transform / BigintFormat', () => {
  for (const c of Object.values(BIGINT_FORMAT)) {
    it(`transform — ${c.title}`, () => assertFormatTransform(c));
  }
});
