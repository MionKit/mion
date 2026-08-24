// Cross-suite createFriendlyText coverage: every validation + format-validation case
// run through the friendly renderer. For each invalid sample it takes the case's
// REAL getValidationErrors output and asserts (1) every error path segment is a
// shape createFriendlyText.descend() can route (the census — catches any future
// validator change that emits a new segment shape without teaching the renderer
// to route it, the bug class that silently broke Map/Set and tuples), and (2)
// the renderer emits one non-empty message per error without throwing. Per-
// category routing CORRECTNESS (object → field, array → rt$items, tuple → rt$slots,
// Map/Set → rt$keys/rt$values) is pinned in createFriendlyText.test.ts.
//
// The two suites are iterated in SEPARATE describes (not merged): both define
// `REALWORLD` and `DATETIME` group keys, so spreading them into one object would
// collide and silently drop cases.
import {describe, it} from 'vitest';
import '@ts-runtypes/core/formats'; // value side-effect: register the format runtime checks
import {VALIDATION_SUITE} from '../validation/index.ts';
import {FORMAT_VALIDATION_SUITE} from '../format-validation/index.ts';
import {assertFriendlyCoverage} from '../../util/validationAsserts.ts';

describe('friendly-coverage / validation', () => {
  for (const [groupName, group] of Object.entries(VALIDATION_SUITE)) {
    describe(groupName, () => {
      for (const c of Object.values(group)) {
        it(`${c.title} (friendly)`, () => assertFriendlyCoverage(c));
      }
    });
  }
});

describe('friendly-coverage / format-validation', () => {
  for (const [groupName, group] of Object.entries(FORMAT_VALIDATION_SUITE)) {
    describe(groupName, () => {
      for (const c of Object.values(group)) {
        it(`${c.title} (friendly)`, () => assertFriendlyCoverage(c));
      }
    });
  }
});
