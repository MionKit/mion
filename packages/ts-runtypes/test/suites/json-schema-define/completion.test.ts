// The runTypeFromJsonSchema-column COMPLETION META-CHECK — the phase-done gate from
// docs/done/json-schema-first-class-implementation.md: every case in the four
// registered suites must carry every runTypeFromJsonSchema thunk field as either a real
// thunk or the explicit `'not-supported'` sentinel. An OMITTED field renders
// "(not implemented)" in the drivers (the pending protocol used while the
// column drained milestone-by-milestone) — after M6 the ledger is empty, and
// this test keeps it empty: a NEW case added without deciding its runTypeFromJsonSchema
// story fails here by name.
//
// Every `'not-supported'` must also carry a WHY: a validateNotes /
// serializeNotes line prefixed `JSON Schema: ` (the convention the field docs
// in ../validation/types.ts and ../serialization/types.ts pin down).
//
// The unregistered case files (Currency.ts / CircularGuard.ts siblings) are
// outside the four registries: Currency cases carry the fields anyway (their
// own drivers register the same its), and CircularGuard uses a different case
// type without the runTypeFromJsonSchema column.

import {describe, expect, it} from 'vitest';
import {VALIDATION_SUITE} from '../validation/index.ts';
import {FORMAT_VALIDATION_SUITE} from '../format-validation/index.ts';
import {SERIALIZATION_SPEC} from '../serialization/index.ts';
import {FORMAT_SERIALIZATION_SUITE} from '../format-serialization/index.ts';
import type {ValidationCase} from '../validation/types.ts';
import type {SerializationCase} from '../serialization/types.ts';

const VALIDATION_FIELDS = ['validateJsonSchema', 'getValidationErrorsJsonSchema'] as const;
const SERIALIZATION_FIELDS = [
  'jsonSchemaEncoder',
  'jsonSchemaDecoder',
  'jsonSchemaBinaryEncoder',
  'jsonSchemaBinaryDecoder',
] as const;

function notesCarryJsonSchemaLine(notes: string | string[] | undefined): boolean {
  if (notes === undefined) return false;
  const list = typeof notes === 'string' ? [notes] : notes;
  return list.some((note) => note.startsWith('JSON Schema:'));
}

function checkSuite<CaseShape extends object>(
  suiteName: string,
  suite: Record<string, Record<string, CaseShape>>,
  fields: readonly (keyof CaseShape)[],
  notesField: keyof CaseShape
): {missing: string[]; unexplained: string[]} {
  const missing: string[] = [];
  const unexplained: string[] = [];
  for (const [groupName, cases] of Object.entries(suite)) {
    for (const [caseKey, c] of Object.entries(cases)) {
      const where = `${suiteName}/${groupName}/${caseKey}`;
      let hasSentinel = false;
      for (const field of fields) {
        const value = c[field];
        if (value === undefined) missing.push(`${where}.${String(field)}`);
        if (value === 'not-supported') hasSentinel = true;
      }
      if (hasSentinel && !notesCarryJsonSchemaLine(c[notesField] as string | string[] | undefined)) {
        unexplained.push(where);
      }
    }
  }
  return {missing, unexplained};
}

describe('json-schema column completion — zero "(not implemented)" omissions', () => {
  it('every validation + format-validation case decides both runTypeFromJsonSchema fields', () => {
    const validation = checkSuite<ValidationCase>('validation', VALIDATION_SUITE, VALIDATION_FIELDS, 'validateNotes');
    const formatValidation = checkSuite<ValidationCase>(
      'format-validation',
      FORMAT_VALIDATION_SUITE,
      VALIDATION_FIELDS,
      'validateNotes'
    );
    expect([...validation.missing, ...formatValidation.missing], 'omitted (pending) runTypeFromJsonSchema fields').toEqual([]);
    expect(
      [...validation.unexplained, ...formatValidation.unexplained],
      "every 'not-supported' needs a validateNotes line prefixed 'JSON Schema:'"
    ).toEqual([]);
  });

  it('every serialization + format-serialization case decides all four runTypeFromJsonSchema thunks', () => {
    const serialization = checkSuite<SerializationCase>(
      'serialization',
      SERIALIZATION_SPEC,
      SERIALIZATION_FIELDS,
      'serializeNotes'
    );
    const formatSerialization = checkSuite<SerializationCase>(
      'format-serialization',
      FORMAT_SERIALIZATION_SUITE,
      SERIALIZATION_FIELDS,
      'serializeNotes'
    );
    expect([...serialization.missing, ...formatSerialization.missing], 'omitted (pending) runTypeFromJsonSchema thunks').toEqual(
      []
    );
    expect(
      [...serialization.unexplained, ...formatSerialization.unexplained],
      "every 'not-supported' needs a serializeNotes line prefixed 'JSON Schema:'"
    ).toEqual([]);
  });
});
