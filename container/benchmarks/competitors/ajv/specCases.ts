// ajv validators for the JSON Schema SPEC-CONFORMANCE corpus
// (../../shared/cases/json-schema-spec).
//
// ajv is the de-facto reference implementation of the dialect, so it is the
// cross-check on the corpus itself: where ajv disagrees with a label, the label
// is the first thing to suspect. Unlike the ts-runtypes side this map does NOT
// re-author the documents, it imports them, so ajv compiles the very same bytes.
//
// Ajv2020, not the default draft-07 export: the corpus is draft 2020-12, where
// `prefixItems` is the tuple form and `items` is the tail. Formats run in FULL
// mode so date/time and the IP formats enforce real values rather than a loose
// pattern.
//
// Two families where ajv is EXPECTED to diverge from the labels, both documented
// on the corpus and neither an ajv defect:
//   - `{type: 'number'}` with NaN / Infinity: ajv applies a JS typeof check and
//     accepts them, while the labels say invalid because JSON cannot carry them.
//   - `contentEncoding` / `contentMediaType`: the dialect defines these as
//     annotations a validator MAY enforce; ajv leaves them as annotations and
//     RunTypes enforces them.

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {iterateSpecCases} from '../../shared/cases/json-schema-spec/index.ts';
import type {SpecCases} from '../../shared/harness/spec.ts';

function compile(schema: unknown): (value: unknown) => boolean {
  const ajv = new Ajv2020({strict: false, allowUnionTypes: true});
  addFormats(ajv, {mode: 'full'});
  const validate = ajv.compile(schema as object);
  return (value: unknown) => validate(value) === true;
}

// Built from the corpus rather than hand-listed: a case can never be silently
// missing from ajv's side, which would otherwise read as a build error.
export const specCases: SpecCases = Object.fromEntries(
  iterateSpecCases().map((iterated) => [iterated.key, () => compile(iterated.case.schema)])
);
