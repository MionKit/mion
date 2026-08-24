// Cross-suite createStandardSchema coverage: every validation + format-validation
// case run through the createStandardSchema factory (static form). Reuses the
// SAME case tables the validate / getValidationErrors suites use, so any
// type-specific crash or wrong issue shape in the adapter surfaces here — the
// point being to prove the adapter supports every type the library does.
//
// The two suites are iterated in SEPARATE describes (not merged): both define
// `REALWORLD` and `DATETIME` group keys, so spreading them into one object would
// collide and silently drop cases.
import {describe, it} from 'vitest';
import '@ts-runtypes/core/formats'; // value side-effect: register the format runtime checks
import {VALIDATION_SUITE} from '../suites/validation/index.ts';
import {FORMAT_VALIDATION_SUITE} from '../suites/format-validation/index.ts';
import {assertStandardSchema, titleFor} from '../util/validationAsserts.ts';

describe('standard-schema / validation', () => {
  for (const [groupName, group] of Object.entries(VALIDATION_SUITE)) {
    describe(groupName, () => {
      for (const c of Object.values(group)) {
        it(titleFor(c, 'standardSchema'), () => assertStandardSchema(c));
      }
    });
  }
});

describe('standard-schema / format-validation', () => {
  for (const [groupName, group] of Object.entries(FORMAT_VALIDATION_SUITE)) {
    describe(groupName, () => {
      for (const c of Object.values(group)) {
        it(titleFor(c, 'standardSchema'), () => assertStandardSchema(c));
      }
    });
  }
});
