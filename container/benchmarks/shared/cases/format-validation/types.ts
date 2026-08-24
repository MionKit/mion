// Re-export the format-validation case types from the single source of truth in
// shared/cases/types.ts. The slim group files import `FormatValidationCase`
// directly from '../types.ts'; this barrel exists for parity with the old
// src/suites/format-validation/types.ts and for the suite index re-export.

export type {FormatErrorExpectation, FormatValidationCase} from '../types.ts';
