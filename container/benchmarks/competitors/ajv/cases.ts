import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {NOT_SUPPORTED, type CompetitorCases} from '../../shared/harness/types.ts';
// The JSON_SCHEMA lane compiles the case's OWN document, imported rather than
// re-authored, so "same schema, two libraries" is true by construction.
import {JSON_SCHEMA} from '../../shared/cases/json-schema/index.ts';

// The 2020-12 dialect twin. The default `Ajv` export is draft-07 and would
// silently ignore `prefixItems` (and read `items: false` with draft-07
// semantics), so this lane must not use it.
type JsonSchemaKey = keyof typeof JSON_SCHEMA;
const doc = (key: JsonSchemaKey): object => JSON_SCHEMA[key].schema as object;

function compile2020(key: JsonSchemaKey, allErrors: boolean): (value: unknown) => boolean {
  const ajv = new Ajv2020({strict: false, allowUnionTypes: true, allErrors});
  addFormats(ajv, {mode: 'full'});
  const validate = ajv.compile(doc(key));
  return (value: unknown) => validate(value) === true;
}

// Each supported case compiles its JSON Schema inside its own builder thunk —
// self-contained and copy-paste runnable, with any shared sub-schema inlined. The
// `validate` metric uses a default Ajv; `validationErrors` uses an allErrors:true
// Ajv (the realistic "collect every error" path). ajv-formats runs in FULL mode so
// date/time/date-time enforce real calendar validity (leap years, month-day bounds)
// a bare pattern can't. The Ajv instance + compile run inside the builder (one-time
// setup, not timed), so only the returned check function is measured.

// TOTAL map over all 263 shared case keys (order matches the suite). Supported
// cases compile a JSON Schema; everything JSON Schema cannot express (bigint,
// Date/RegExp/symbol/undefined, Map/Set/Promise, Temporal, case-insensitive
// patterns, unbounded `number` which ajv lets NaN/Infinity through, circular
// refs, advanced TS utility/mapped/template-literal types, …) is NOT_SUPPORTED.
export const cases: CompetitorCases = {
  // ── ATOMIC ──
  'ATOMIC.any': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.bigint': NOT_SUPPORTED, // no bigint type in JSON Schema
  'ATOMIC.boolean': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'boolean'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'boolean'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.date': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'ATOMIC.enum_mixed': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({enum: [0, 'green', 2]});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({enum: [0, 'green', 2]});
      return (value: unknown) => validate(value) === true;
    },
  }, // Color.Red=0, Color.Green='green', Color.Blue=2
  'ATOMIC.literal_2': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({const: 2});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({const: 2});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.literal_a': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({const: 'a'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({const: 'a'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.literal_true': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({const: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({const: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.literal_1n': NOT_SUPPORTED, // no bigint in JSON Schema
  'ATOMIC.literal_symbol': NOT_SUPPORTED, // no symbol type in JSON Schema
  'ATOMIC.never': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({not: {}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({not: {}});
      return (value: unknown) => validate(value) === true;
    },
  }, // JSON Schema {not:{}} rejects every value — exact analogue of TS `never`
  'ATOMIC.null': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'null'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'null'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.number': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'number'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'number'});
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: ['hello', null, undefined]},
  }, // override: ajv {type:number} accepts NaN/Infinity; drop them from invalid
  'ATOMIC.object': NOT_SUPPORTED, // TS object type includes arrays/Date/RegExp; ajv {type:'object'} rejects arrays
  'ATOMIC.regexp': NOT_SUPPORTED, // no RegExp instance type in JSON Schema
  'ATOMIC.string': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.symbol': NOT_SUPPORTED, // no symbol type in JSON Schema; factoryThrows
  'ATOMIC.undefined': NOT_SUPPORTED, // no undefined type in JSON Schema
  'ATOMIC.void': NOT_SUPPORTED, // no undefined/void type in JSON Schema
  'ATOMIC.literal_2_noLiterals': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'number'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'number'});
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: ['4', null]},
  }, // override: degrades to number; ajv accepts NaN/Infinity — drop them from invalid
  'ATOMIC.literal_a_noLiterals': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.literal_regexp_noLiterals': NOT_SUPPORTED, // degrades to RegExp; no RegExp instance type in JSON Schema
  'ATOMIC.literal_true_noLiterals': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'boolean'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'boolean'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.literal_1n_noLiterals': NOT_SUPPORTED, // degrades to bigint; no bigint type in JSON Schema
  'ATOMIC.literal_symbol_noLiterals': NOT_SUPPORTED, // degrades to symbol; no symbol type in JSON Schema; factoryThrows
  'ATOMIC.unknown': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({});
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── ARRAY ──
  'ARRAY.string_array': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: {type: 'string'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: {type: 'string'}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.number_array': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: {type: 'number'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: {type: 'number'}});
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [[1, '2'], 'not-array', null, undefined, [null]]},
  }, // override: ajv {type:number} accepts NaN/Infinity per element; drop [Infinity]/[-Infinity]/[NaN] from invalid
  'ARRAY.boolean_array': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: {type: 'boolean'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: {type: 'boolean'}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.bigint_array': NOT_SUPPORTED, // no bigint type in JSON Schema
  'ARRAY.date_array': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'ARRAY.regexp_array': NOT_SUPPORTED, // no RegExp instance type in JSON Schema
  'ARRAY.undefined_array': NOT_SUPPORTED, // no undefined type in JSON Schema
  'ARRAY.null_array': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: {type: 'null'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: {type: 'null'}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.array_generic': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: {type: 'string'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: {type: 'string'}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.string_array_2d': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: {type: 'array', items: {type: 'string'}}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: {type: 'array', items: {type: 'string'}}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.string_array_3d': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'array',
        items: {type: 'array', items: {type: 'array', items: {type: 'string'}}},
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'array',
        items: {type: 'array', items: {type: 'array', items: {type: 'string'}}},
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.string_array_noIsArrayCheck': NOT_SUPPORTED, // RunTypes-specific noIsArrayCheck option; no JSON Schema equivalent
  'ARRAY.object_array': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: {type: 'object', properties: {a: {type: 'string'}}, required: ['a']}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: {type: 'object', properties: {a: {type: 'string'}}, required: ['a']}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.union_array': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: {anyOf: [{type: 'string'}, {type: 'number'}]}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: {anyOf: [{type: 'string'}, {type: 'number'}]}});
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [[true], 'a', [null], ['a', true], null, undefined, [BigInt(1)]]},
  }, // override: ajv {type:'number'} accepts Infinity; drop [Infinity] from invalid (bigint not a JSON number so [BigInt(1)] still fails ajv)
  'ARRAY.tuple_array': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'array',
        items: {type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2},
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'array',
        items: {type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2},
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.circular_array': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        $id: 'circular_array',
        type: 'array',
        items: {$ref: 'circular_array'},
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        $id: 'circular_array',
        type: 'array',
        items: {$ref: 'circular_array'},
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.circular_object_with_array': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        $id: 'circular_object_with_array',
        type: 'object',
        properties: {
          a: {type: 'string'},
          deep: {
            type: 'object',
            properties: {b: {type: 'string'}, c: {type: 'number'}},
            required: ['b', 'c'],
          },
          d: {type: 'array', items: {$ref: 'circular_object_with_array'}},
        },
        required: ['a'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        $id: 'circular_object_with_array',
        type: 'object',
        properties: {
          a: {type: 'string'},
          deep: {
            type: 'object',
            properties: {b: {type: 'string'}, c: {type: 'number'}},
            required: ['b', 'c'],
          },
          d: {type: 'array', items: {$ref: 'circular_object_with_array'}},
        },
        required: ['a'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.symbol_array': NOT_SUPPORTED, // no symbol type in JSON Schema; factoryThrows
  'ARRAY.readonly_string_array': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: {type: 'string'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: {type: 'string'}});
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── OBJECT ──
  'OBJECT.simple_interface': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {a: {type: 'string'}, b: {type: 'number'}},
        required: ['a', 'b'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {a: {type: 'string'}, b: {type: 'number'}},
        required: ['a', 'b'],
      });
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: ['hello', null, undefined, {a: 'x'}, {a: 1, b: 1}, {a: 'x', b: 'not number'}, {b: 1}, true]},
  }, // override: ajv {type:number} accepts NaN/Infinity; drop b:NaN and b:Infinity from invalid
  'OBJECT.object_as_const_literals': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {name: {const: 'john'}, age: {const: 30}},
        required: ['name', 'age'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {name: {const: 'john'}, age: {const: 30}},
        required: ['name', 'age'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.object_via_return_type_utility': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {id: {type: 'number'}, name: {type: 'string'}},
        required: ['id', 'name'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {id: {type: 'number'}, name: {type: 'string'}},
        required: ['id', 'name'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.object_via_property_access': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {id: {type: 'number'}, name: {type: 'string'}},
        required: ['id', 'name'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {id: {type: 'number'}, name: {type: 'string'}},
        required: ['id', 'name'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.object_via_array_access': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {id: {type: 'number'}, name: {type: 'string'}},
        required: ['id', 'name'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {id: {type: 'number'}, name: {type: 'string'}},
        required: ['id', 'name'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.interface_with_optional': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'object', properties: {a: {type: 'string'}, b: {type: 'number'}}, required: ['a']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'object', properties: {a: {type: 'string'}, b: {type: 'number'}}, required: ['a']});
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [{a: 'x', b: 'not number'}, {a: 1}, null, undefined, {}, {b: 1}]},
  }, // override: ajv {type:number} accepts NaN; drop b:NaN from invalid
  'OBJECT.interface_with_date': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'OBJECT.interface_with_method': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'object', properties: {name: {type: 'string'}}, required: ['name']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'object', properties: {name: {type: 'string'}}, required: ['name']});
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.nested_object': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          a: {type: 'string'},
          deep: {type: 'object', properties: {b: {type: 'string'}, c: {type: 'number'}}, required: ['b', 'c']},
        },
        required: ['a', 'deep'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          a: {type: 'string'},
          deep: {type: 'object', properties: {b: {type: 'string'}, c: {type: 'number'}}, required: ['b', 'c']},
        },
        required: ['a', 'deep'],
      });
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [{a: 'x'}, {a: 'x', deep: {b: 1, c: 1}}, {a: 'x', deep: null}, null, undefined, {a: 'x', deep: {b: 'y'}}]},
  }, // override: ajv {type:number} accepts NaN; drop deep.c:NaN from invalid
  'OBJECT.interface_string_array_prop': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {tags: {type: 'array', items: {type: 'string'}}},
        required: ['tags'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {tags: {type: 'array', items: {type: 'string'}}},
        required: ['tags'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.circular_interface': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        $id: 'circular_interface',
        type: 'object',
        properties: {
          name: {type: 'string'},
          child: {$ref: 'circular_interface'},
        },
        required: ['name'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        $id: 'circular_interface',
        type: 'object',
        properties: {
          name: {type: 'string'},
          child: {$ref: 'circular_interface'},
        },
        required: ['name'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.circular_interface_on_array': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        $id: 'circular_interface_on_array',
        type: 'object',
        properties: {
          name: {type: 'string'},
          children: {type: 'array', items: {$ref: 'circular_interface_on_array'}},
        },
        required: ['name'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        $id: 'circular_interface_on_array',
        type: 'object',
        properties: {
          name: {type: 'string'},
          children: {type: 'array', items: {$ref: 'circular_interface_on_array'}},
        },
        required: ['name'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.circular_interface_on_nested_object': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        $id: 'circular_interface_on_nested_object',
        type: 'object',
        properties: {
          name: {type: 'string'},
          embedded: {
            type: 'object',
            properties: {
              hello: {type: 'string'},
              child: {$ref: 'circular_interface_on_nested_object'},
            },
            required: ['hello'],
          },
        },
        required: ['name', 'embedded'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        $id: 'circular_interface_on_nested_object',
        type: 'object',
        properties: {
          name: {type: 'string'},
          embedded: {
            type: 'object',
            properties: {
              hello: {type: 'string'},
              child: {$ref: 'circular_interface_on_nested_object'},
            },
            required: ['hello'],
          },
        },
        required: ['name', 'embedded'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.index_signature_string': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'object', additionalProperties: {type: 'string'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'object', additionalProperties: {type: 'string'}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.index_signature_named_props': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          a: {type: 'string'},
          b: {type: 'number'},
        },
        required: ['a', 'b'],
        additionalProperties: {type: ['string', 'number']},
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          a: {type: 'string'},
          b: {type: 'number'},
        },
        required: ['a', 'b'],
        additionalProperties: {type: ['string', 'number']},
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.index_signature_nested': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        additionalProperties: {type: 'object', additionalProperties: {type: 'number'}},
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        additionalProperties: {type: 'object', additionalProperties: {type: 'number'}},
      });
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [{a: 1}, {a: {x: 'not number'}}, null, undefined, {a: {x: null}}]},
  }, // override: ajv {type:number} accepts NaN; drop a.x:NaN from invalid
  'OBJECT.index_signature_date_value': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'OBJECT.index_signature_non_root': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          b: {type: 'string'},
          c: {
            type: 'object',
            additionalProperties: {type: 'string'},
          },
        },
        required: ['b', 'c'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          b: {type: 'string'},
          c: {
            type: 'object',
            additionalProperties: {type: 'string'},
          },
        },
        required: ['b', 'c'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.function_top_level': NOT_SUPPORTED, // no function type in JSON Schema
  'OBJECT.interface_callable': NOT_SUPPORTED, // callable interface (function with props); no function type in JSON Schema
  'OBJECT.interface_all_optional': NOT_SUPPORTED, // allOptionalCode guard rejects Date/Map/Set/RegExp; no JSON Schema equivalent for plain-object-only constraint
  'OBJECT.class_simple': NOT_SUPPORTED, // class has Date prop; no Date instance type in JSON Schema
  'OBJECT.rpc_error_class': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          'mion@isΣrrθr': {const: true},
          type: {const: 'test-error'},
          publicMessage: {type: 'string'},
          id: {type: 'string'},
        },
        required: ['mion@isΣrrθr', 'type', 'publicMessage'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          'mion@isΣrrθr': {const: true},
          type: {const: 'test-error'},
          publicMessage: {type: 'string'},
          id: {type: 'string'},
        },
        required: ['mion@isΣrrθr', 'type', 'publicMessage'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.call_signature_params': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: [{type: 'number'}, {type: 'boolean'}], minItems: 2, maxItems: 2});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: [{type: 'number'}, {type: 'boolean'}], minItems: 2, maxItems: 2});
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [[1, 'not boolean'], [1], [1, true, 'extra'], ['not number', true], 'not array', null, undefined, []]},
  }, // override: ajv {type:number} accepts NaN; drop [NaN,true] from invalid
  'OBJECT.call_signature_params_with_optional': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'array',
        items: [{type: 'number'}, {type: 'boolean'}, {type: 'string'}],
        minItems: 2,
        maxItems: 3,
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'array',
        items: [{type: 'number'}, {type: 'boolean'}, {type: 'string'}],
        minItems: 2,
        maxItems: 3,
      });
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [[3, 3, 3], [3, true, 'hello', 7], [3], 'not array', null, undefined]},
  }, // override: ajv {type:number} accepts NaN; drop [NaN,true] from invalid
  'OBJECT.call_signature_params_with_rest': NOT_SUPPORTED, // rest contains Date instances; no Date type in JSON Schema
  'OBJECT.record_union_keys': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {a: {type: 'number'}, b: {type: 'number'}},
        required: ['a', 'b'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {a: {type: 'number'}, b: {type: 'number'}},
        required: ['a', 'b'],
      });
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [{a: 1}, {b: 1}, {}, {a: 'x', b: 1}, null, 'not object', undefined]},
  }, // override: ajv {type:number} accepts NaN/Infinity; drop b:NaN and a:Infinity from invalid
  'OBJECT.union_value_index': NOT_SUPPORTED, // union includes bigint; no bigint type in JSON Schema
  'OBJECT.object_with_union_prop': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {kind: {enum: ['a', 'b']}, n: {type: 'number'}},
        required: ['kind', 'n'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {kind: {enum: ['a', 'b']}, n: {type: 'number'}},
        required: ['kind', 'n'],
      });
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [{kind: 'c', n: 1}, {n: 1}, {kind: 'a', n: 'not number'}, null, undefined, {kind: 'a'}]},
  }, // override: ajv {type:number} accepts NaN; drop kind:'a',n:NaN from invalid
  'OBJECT.interface_inheritance': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {a: {type: 'string'}, b: {type: 'number'}},
        required: ['a', 'b'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {a: {type: 'string'}, b: {type: 'number'}},
        required: ['a', 'b'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.class_inheritance': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {a: {type: 'string'}, b: {type: 'number'}},
        required: ['a', 'b'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {a: {type: 'string'}, b: {type: 'number'}},
        required: ['a', 'b'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.index_signature_number_key': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        additionalProperties: {type: 'string'},
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        additionalProperties: {type: 'string'},
      });
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── TUPLE ──
  'TUPLE.string_number_pair': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2});
      return (value: unknown) => validate(value) === true;
    },
    samples: {
      invalid: [[], ['hello'], ['hello', 1, 'extra'], [1, 'hello'], 'not array', null, undefined, [null, 1], ['hello', null]],
    },
  }, // override: ajv {type:number} accepts NaN; drop ['hello',NaN] from invalid
  'TUPLE.full_mion_tuple': NOT_SUPPORTED, // contains Date, bigint; no Date/bigint type in JSON Schema
  'TUPLE.tuple_with_optional': NOT_SUPPORTED, // optional bigint slot; no bigint type in JSON Schema
  'TUPLE.nested_tuple_in_array': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'array',
        items: {type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2},
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'array',
        items: {type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2},
      });
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [[['a', 'b']], [['a']], ['not tuple'], null, undefined, [[null, 1]]]},
  }, // override: ajv {type:number} accepts NaN; drop [['a',NaN]] from invalid
  'TUPLE.tuple_rest': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: [{type: 'number'}], additionalItems: {type: 'string'}, minItems: 1});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: [{type: 'number'}], additionalItems: {type: 'string'}, minItems: 1});
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [[3, 'a', 4], ['not number'], [], 'not array', [3, 1], null, undefined, [3, null]]},
  }, // override: ajv {type:number} accepts NaN; drop [NaN,'a'] from invalid; use draft-7 items+additionalItems (not prefixItems)
  'TUPLE.tuple_circular': NOT_SUPPORTED, // contains Date, bigint; no Date/bigint type in JSON Schema
  'TUPLE.tuple_multiple_trailing_optionals': NOT_SUPPORTED, // number and bigint slots; no bigint type in JSON Schema
  'TUPLE.tuple_named_labels': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2});
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [[], ['Alice'], ['Alice', '30'], [30, 'Alice'], null, 'not array', undefined, [null, 30]]},
  }, // override: ajv {type:number} accepts NaN; drop ['Alice',NaN] from invalid
  'TUPLE.tuple_with_non_serializable': NOT_SUPPORTED, // function slot must be === undefined; no undefined type in JSON Schema
  'TUPLE.empty_tuple': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', maxItems: 0});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', maxItems: 0});
      return (value: unknown) => validate(value) === true;
    },
  },
  'TUPLE.single_element_tuple': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: [{type: 'string'}], minItems: 1, maxItems: 1});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'array', items: [{type: 'string'}], minItems: 1, maxItems: 1});
      return (value: unknown) => validate(value) === true;
    },
  },
  'TUPLE.readonly_tuple': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'array',
        items: [{type: 'string'}, {type: 'number'}],
        minItems: 2,
        maxItems: 2,
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'array',
        items: [{type: 'string'}, {type: 'number'}],
        minItems: 2,
        maxItems: 2,
      });
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── UNION ──
  'UNION.atomic_union': NOT_SUPPORTED, // union includes Date, bigint; no Date/bigint type in JSON Schema
  'UNION.string_literal_union': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({enum: ['UNO', 'DOS', 'TRES']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({enum: ['UNO', 'DOS', 'TRES']});
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.large_union_eight_arms': NOT_SUPPORTED, // arm contains bigint; no bigint type in JSON Schema
  'UNION.string_or_number': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({anyOf: [{type: 'string'}, {type: 'number'}]});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({anyOf: [{type: 'string'}, {type: 'number'}]});
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [null, undefined, true, [], {}, BigInt(1)]},
  }, // override: ajv {type:'number'} accepts NaN/Infinity; drop NaN/Infinity from invalid
  'UNION.union_of_array_types': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        anyOf: [
          {type: 'array', items: {type: 'string'}},
          {type: 'array', items: {type: 'number'}},
          {type: 'array', items: {type: 'boolean'}},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        anyOf: [
          {type: 'array', items: {type: 'string'}},
          {type: 'array', items: {type: 'number'}},
          {type: 'array', items: {type: 'boolean'}},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [['a', 1], [1, 'a'], 'not array', null, undefined, [null], [BigInt(1)]]},
  }, // override: ajv {type:'number'} accepts Infinity; drop [Infinity] from invalid (bigint is not a JSON number so [BigInt(1)] still fails)
  'UNION.array_of_union': NOT_SUPPORTED, // union includes bigint, Date; no bigint/Date type in JSON Schema
  'UNION.union_of_object_shapes': NOT_SUPPORTED, // arm c has bigint value; no bigint type in JSON Schema
  'UNION.discriminated_union': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {kind: {const: 'a'}, n: {type: 'number'}}, required: ['kind', 'n']},
          {type: 'object', properties: {kind: {const: 'b'}, s: {type: 'string'}}, required: ['kind', 's']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {kind: {const: 'a'}, n: {type: 'number'}}, required: ['kind', 'n']},
          {type: 'object', properties: {kind: {const: 'b'}, s: {type: 'string'}}, required: ['kind', 's']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    samples: {
      invalid: [{kind: 'c', n: 1}, {kind: 'a', n: 'not number'}, {n: 1}, null, 'not object', undefined, {kind: 'a'}, {kind: 'b'}],
    },
  }, // override: ajv {type:'number'} accepts NaN; drop {kind:'a',n:NaN} from invalid
  'UNION.circular_union': NOT_SUPPORTED, // union includes Date; no Date instance type in JSON Schema
  'UNION.union_with_methods': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {name: {type: 'string'}}, required: ['name']},
          {type: 'object', properties: {age: {type: 'number'}}, required: ['age']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {name: {type: 'string'}}, required: ['name']},
          {type: 'object', properties: {age: {type: 'number'}}, required: ['age']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.intersection_to_object': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {a: {type: 'string'}, b: {type: 'number'}},
        required: ['a', 'b'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {a: {type: 'string'}, b: {type: 'number'}},
        required: ['a', 'b'],
      });
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [{a: 'x'}, {b: 1}, null, {a: 1, b: 1}, {a: 'x', b: 'not number'}, undefined, {}]},
  }, // override: ajv {type:'number'} accepts NaN/Infinity; drop {a:'x',b:NaN} from invalid
  'UNION.union_with_index_arm': NOT_SUPPORTED, // arm c has bigint values; no bigint type in JSON Schema
  'UNION.union_same_prop_different_types': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {type: {const: 'a'}, prop: {type: 'boolean'}}, required: ['type', 'prop']},
          {type: 'object', properties: {type: {const: 'b'}, prop: {type: 'number'}}, required: ['type', 'prop']},
          {type: 'object', properties: {type: {const: 'c'}, prop: {type: 'string'}}, required: ['type', 'prop']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {type: {const: 'a'}, prop: {type: 'boolean'}}, required: ['type', 'prop']},
          {type: 'object', properties: {type: {const: 'b'}, prop: {type: 'number'}}, required: ['type', 'prop']},
          {type: 'object', properties: {type: {const: 'c'}, prop: {type: 'string'}}, required: ['type', 'prop']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.union_mixed_arrays_and_objects': NOT_SUPPORTED, // arm {b: number} — ajv accepts NaN; samples allow b:123n (bigint)
  'UNION.union_merged_property': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {a: {type: 'boolean'}}, required: ['a']},
          {type: 'object', properties: {a: {type: 'number'}}, required: ['a']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {a: {type: 'boolean'}}, required: ['a']},
          {type: 'object', properties: {a: {type: 'number'}}, required: ['a']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [{a: 'hello'}, {}, null, undefined, {a: 'string not boolean or number'}, {a: null}]},
  }, // override: ajv {type:'number'} accepts NaN; drop {a:NaN} from invalid
  'UNION.union_mixed_with_index': NOT_SUPPORTED, // arm has bigint values; no bigint type in JSON Schema
  'UNION.union_with_any_fallback': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({});
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.union_with_unknown_fallback': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({});
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.union_subset_small_first': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {a: {type: 'string'}}, required: ['a']},
          {type: 'object', properties: {a: {type: 'string'}, b: {type: 'number'}}, required: ['a', 'b']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {a: {type: 'string'}}, required: ['a']},
          {type: 'object', properties: {a: {type: 'string'}, b: {type: 'number'}}, required: ['a', 'b']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.union_subset_nested_levels': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {x: {type: 'string'}}, required: ['x']},
          {type: 'object', properties: {x: {type: 'string'}, y: {type: 'number'}}, required: ['x', 'y']},
          {
            type: 'object',
            properties: {x: {type: 'string'}, y: {type: 'number'}, z: {type: 'boolean'}},
            required: ['x', 'y', 'z'],
          },
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {x: {type: 'string'}}, required: ['x']},
          {type: 'object', properties: {x: {type: 'string'}, y: {type: 'number'}}, required: ['x', 'y']},
          {
            type: 'object',
            properties: {x: {type: 'string'}, y: {type: 'number'}, z: {type: 'boolean'}},
            required: ['x', 'y', 'z'],
          },
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.union_subset_mixed_related_unrelated': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {id: {type: 'string'}}, required: ['id']},
          {type: 'object', properties: {id: {type: 'string'}, name: {type: 'string'}}, required: ['id', 'name']},
          {type: 'object', properties: {value: {type: 'number'}}, required: ['value']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {id: {type: 'string'}}, required: ['id']},
          {type: 'object', properties: {id: {type: 'string'}, name: {type: 'string'}}, required: ['id', 'name']},
          {type: 'object', properties: {value: {type: 'number'}}, required: ['value']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [{}, {name: 'test'}, {id: 123}, {value: 'not number'}, null, undefined]},
  }, // override: ajv {type:'number'} accepts NaN; drop {value:NaN} from invalid

  // ── TEMPLATE_LITERAL ──
  'TEMPLATE_LITERAL.url_with_number_id': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^api\\/user\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^api\\/user\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'TEMPLATE_LITERAL.multi_segment_url': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^\\/api\\/v\\d+\\/user\\/[\\s\\S]+\\/posts\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^\\/api\\/v\\d+\\/user\\/[\\s\\S]+\\/posts\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'TEMPLATE_LITERAL.leading_string_placeholder': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^[\\s\\S]*\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^[\\s\\S]*\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'TEMPLATE_LITERAL.regex_special_chars': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^\\(-?(?:\\d+\\.?\\d*|\\.\\d+)\\)$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^\\(-?(?:\\d+\\.?\\d*|\\.\\d+)\\)$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'TEMPLATE_LITERAL.template_literal_nested_in_object': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          url: {type: 'string', pattern: '^api\\/user\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$'},
          method: {type: 'string'},
        },
        required: ['url', 'method'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          url: {type: 'string', pattern: '^api\\/user\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$'},
          method: {type: 'string'},
        },
        required: ['url', 'method'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'TEMPLATE_LITERAL.template_literal_index_key': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        patternProperties: {'^api\\/[\\s\\S]*$': {type: 'number'}},
        additionalProperties: false,
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        patternProperties: {'^api\\/[\\s\\S]*$': {type: 'number'}},
        additionalProperties: false,
      });
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [{foo: 1}, {'api/users': 'not number'}, {'api/users': 1, foo: 2}, null, undefined]},
  }, // key type `api/${string}` → patternProperties regex `^api\/[\s\S]*$` ({string}→[\s\S]*); additionalProperties:false rejects non-matching keys. override: ajv {type:number} accepts NaN; drop {'api/users':NaN} from invalid
  'TEMPLATE_LITERAL.template_literal_union_placeholder': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^(?:a|b)--?(?:\\d+\\.?\\d*|\\.\\d+)$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^(?:a|b)--?(?:\\d+\\.?\\d*|\\.\\d+)$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── NATIVE ──
  'NATIVE.map_string_number': NOT_SUPPORTED, // no Map instance type in JSON Schema
  'NATIVE.set_string': NOT_SUPPORTED, // no Set instance type in JSON Schema
  'NATIVE.promise_string': NOT_SUPPORTED, // no thenable/Promise instance type in JSON Schema
  'NATIVE.awaited_promise': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string'});
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── CIRCULAR ──
  'CIRCULAR.object_full_mion_shape': NOT_SUPPORTED, // number prop — ajv accepts NaN; samples reject NaN; also optional Date prop
  'CIRCULAR.array_of_union_with_self_ref': NOT_SUPPORTED, // union includes Date; no Date instance type in JSON Schema
  'CIRCULAR.object_with_tuple_prop': NOT_SUPPORTED, // tuple contains bigint; no bigint type in JSON Schema
  'CIRCULAR.object_with_index_prop': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        $id: 'circular_object_with_index_prop',
        type: 'object',
        properties: {
          index: {
            type: 'object',
            additionalProperties: {$ref: 'circular_object_with_index_prop'},
          },
        },
        required: ['index'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        $id: 'circular_object_with_index_prop',
        type: 'object',
        properties: {
          index: {
            type: 'object',
            additionalProperties: {$ref: 'circular_object_with_index_prop'},
          },
        },
        required: ['index'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'CIRCULAR.object_deeply_nested': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        $id: 'object_deeply_nested',
        type: 'object',
        properties: {
          deep1: {
            type: 'object',
            properties: {
              deep2: {
                type: 'object',
                properties: {
                  deep3: {
                    type: 'object',
                    properties: {
                      deep4: {$ref: 'object_deeply_nested'},
                    },
                  },
                },
                required: ['deep3'],
              },
            },
            required: ['deep2'],
          },
        },
        required: ['deep1'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        $id: 'object_deeply_nested',
        type: 'object',
        properties: {
          deep1: {
            type: 'object',
            properties: {
              deep2: {
                type: 'object',
                properties: {
                  deep3: {
                    type: 'object',
                    properties: {
                      deep4: {$ref: 'object_deeply_nested'},
                    },
                  },
                },
                required: ['deep3'],
              },
            },
            required: ['deep2'],
          },
        },
        required: ['deep1'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'CIRCULAR.circular_child_under_literal_root': NOT_SUPPORTED, // child contains bigint; no bigint type in JSON Schema
  'CIRCULAR.multiple_circular_types_cross_referenced': NOT_SUPPORTED, // contains bigint and Date; no bigint/Date type in JSON Schema

  // ── CIRCULAR_REFS ── (cyclic VALUES; ajv has no cyclic-value detection)
  'CIRCULAR_REFS.linked_list_cycle': NOT_SUPPORTED, // a reference cycle would stack-overflow
  'CIRCULAR_REFS.tree_cycle': NOT_SUPPORTED, // a reference cycle would stack-overflow
  'CIRCULAR_REFS.object_self_cycle': NOT_SUPPORTED, // a reference cycle would stack-overflow

  // ── UTILITY ──
  'UTILITY.partial': NOT_SUPPORTED, // Partial type includes Date prop; no Date instance type in JSON Schema
  'UTILITY.required': NOT_SUPPORTED, // Required type includes Date prop; no Date instance type in JSON Schema
  'UTILITY.pick': NOT_SUPPORTED, // Pick result includes Date prop; no Date instance type in JSON Schema
  'UTILITY.omit': NOT_SUPPORTED, // Omit result includes Date prop; no Date instance type in JSON Schema
  'UTILITY.exclude_atomic': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({enum: ['name', 'createdAt']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({enum: ['name', 'createdAt']});
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.extract_atomic': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({enum: ['name', 'createdAt']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({enum: ['name', 'createdAt']});
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.exclude_from_object_union': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {kind: {const: 'square'}, x: {type: 'number'}}, required: ['kind', 'x']},
          {
            type: 'object',
            properties: {kind: {const: 'triangle'}, base: {type: 'number'}, height: {type: 'number'}},
            required: ['kind', 'base', 'height'],
          },
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {kind: {const: 'square'}, x: {type: 'number'}}, required: ['kind', 'x']},
          {
            type: 'object',
            properties: {kind: {const: 'triangle'}, base: {type: 'number'}, height: {type: 'number'}},
            required: ['kind', 'base', 'height'],
          },
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [{kind: 'circle', radius: 3}, {}, null, undefined, {kind: 'square'}, {kind: 'triangle', base: 4}]},
  }, // override: ajv {type:'number'} accepts NaN; drop {kind:'square',x:NaN} from invalid
  'UTILITY.non_nullable': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({anyOf: [{type: 'string'}, {type: 'number'}]});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({anyOf: [{type: 'string'}, {type: 'number'}]});
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [null, undefined, true, {}, []]},
  }, // override: ajv {type:'number'} accepts NaN/Infinity; drop NaN/Infinity from invalid
  'UTILITY.return_type': NOT_SUPPORTED, // ReturnType resolves to Date; no Date instance type in JSON Schema
  'UTILITY.readonly': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {name: {type: 'string'}, age: {type: 'number'}},
        required: ['name', 'age'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {name: {type: 'string'}, age: {type: 'number'}},
        required: ['name', 'age'],
      });
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [{name: 'John'}, {age: 30}, null, undefined, {name: 1, age: 30}]},
  }, // override: ajv {type:'number'} accepts NaN; drop {name:'John',age:NaN} from invalid
  'UTILITY.intersection_with_required_override': NOT_SUPPORTED, // optional Date prop; no Date instance type in JSON Schema
  'UTILITY.omit_keeping_optional': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'object', properties: {b: {type: 'number'}, c: {type: 'boolean'}}, required: ['c']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'object', properties: {b: {type: 'number'}, c: {type: 'boolean'}}, required: ['c']});
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [{}, {b: 1}, {c: 'not boolean'}, null, undefined, {c: 0}, {b: 1, c: 1}]},
  }, // override: ajv {type:'number'} accepts NaN; drop {c:true,b:NaN} from invalid
  'UTILITY.keyof_to_literal_union': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({enum: ['name', 'age', 'createdAt']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({enum: ['name', 'age', 'createdAt']});
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.typeof_variable_query': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {url: {type: 'string'}, port: {type: 'number'}},
        required: ['url', 'port'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {url: {type: 'string'}, port: {type: 'number'}},
        required: ['url', 'port'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.indexed_access_type': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.conditional_type_resolved': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'boolean'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'boolean'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.mapped_type_custom': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          a: {type: ['string', 'null']},
          b: {type: ['number', 'null']},
        },
        required: ['a', 'b'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          a: {type: ['string', 'null']},
          b: {type: ['number', 'null']},
        },
        required: ['a', 'b'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.mapped_type_with_conditional_value': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          name: {
            type: 'object',
            properties: {kind: {const: 'text'}, value: {type: 'string'}},
            required: ['kind', 'value'],
          },
          age: {
            type: 'object',
            properties: {kind: {const: 'number'}, value: {type: 'number'}, min: {type: 'number'}},
            required: ['kind', 'value'],
          },
          admin: {
            type: 'object',
            properties: {kind: {const: 'checkbox'}, value: {type: 'boolean'}},
            required: ['kind', 'value'],
          },
        },
        required: ['name', 'age', 'admin'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          name: {
            type: 'object',
            properties: {kind: {const: 'text'}, value: {type: 'string'}},
            required: ['kind', 'value'],
          },
          age: {
            type: 'object',
            properties: {kind: {const: 'number'}, value: {type: 'number'}, min: {type: 'number'}},
            required: ['kind', 'value'],
          },
          admin: {
            type: 'object',
            properties: {kind: {const: 'checkbox'}, value: {type: 'boolean'}},
            required: ['kind', 'value'],
          },
        },
        required: ['name', 'age', 'admin'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.distributive_conditional_over_union': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {w: {type: 'string'}}, required: ['w']},
          {type: 'object', properties: {w: {type: 'number'}}, required: ['w']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {w: {type: 'string'}}, required: ['w']},
          {type: 'object', properties: {w: {type: 'number'}}, required: ['w']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    samples: {invalid: [{w: true}, {w: null}, {}, null, undefined]},
  }, // override: ajv {type:'number'} accepts NaN; drop {w:NaN} from invalid
  'UTILITY.deep_partial_recursive_mapped': NOT_SUPPORTED, // all-optional plain-object guard rejects `new Date()` (an invalid sample), but ajv {type:'object'} accepts it; no JSON Schema knob for the plain-object-only constraint

  // ── TYPE_MAPPINGS ──
  'TYPE_MAPPINGS.key_prefix_rename': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {user_id: {type: 'number'}, user_name: {type: 'string'}},
        required: ['user_id', 'user_name'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {user_id: {type: 'number'}, user_name: {type: 'string'}},
        required: ['user_id', 'user_name'],
      });
      return (value: unknown) => validate(value) === true;
    },
  }, // mapped type resolves to concrete {user_id:number;user_name:string} — plain properties+required
  'TYPE_MAPPINGS.key_conditional_rename': NOT_SUPPORTED, // resolved shape carries a `createdAt: Date` prop; no Date instance type in JSON Schema
  'TYPE_MAPPINGS.key_filter_via_never': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {id: {type: 'number'}, name: {type: 'string'}},
        required: ['id', 'name'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {id: {type: 'number'}, name: {type: 'string'}},
        required: ['id', 'name'],
      });
      return (value: unknown) => validate(value) === true;
    },
  }, // `secret`→never drops it; resolves to concrete {id:number;name:string}. extra `secret` prop passes structurally (additionalProperties default allows it)

  // ── DATETIME ──
  'DATETIME.date': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.instant': NOT_SUPPORTED, // no Temporal.Instant instance type in JSON Schema
  'DATETIME.zonedDateTime': NOT_SUPPORTED, // no Temporal.ZonedDateTime instance type in JSON Schema
  'DATETIME.plainDate': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainTime': NOT_SUPPORTED, // no Temporal.PlainTime instance type in JSON Schema
  'DATETIME.plainDateTime': NOT_SUPPORTED, // no Temporal.PlainDateTime instance type in JSON Schema
  'DATETIME.plainYearMonth': NOT_SUPPORTED, // no Temporal.PlainYearMonth instance type in JSON Schema
  'DATETIME.plainMonthDay': NOT_SUPPORTED, // no Temporal.PlainMonthDay instance type in JSON Schema
  'DATETIME.duration': NOT_SUPPORTED, // no Temporal.Duration instance type in JSON Schema

  // ── STRING_FORMAT ──
  'STRING_FORMAT.string_maxLength': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', maxLength: 5});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', maxLength: 5});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_minLength': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', minLength: 3});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', minLength: 3});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_length': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', minLength: 4, maxLength: 4});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', minLength: 4, maxLength: 4});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_range': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', minLength: 2, maxLength: 4});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', minLength: 2, maxLength: 4});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_allowedChars': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', pattern: '^[0-9a-f]+$'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', pattern: '^[0-9a-f]+$'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_allowedChars_ignoreCase': NOT_SUPPORTED, // case-insensitive regex; JSON Schema pattern has no ignore-case flag
  'STRING_FORMAT.string_allowedChars_literal': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', pattern: '^[.\\-]+$'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', pattern: '^[.\\-]+$'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_disallowedChars': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', pattern: '^[^!@#]*$'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', pattern: '^[^!@#]*$'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_allowedValues': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', enum: ['red', 'green', 'blue']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', enum: ['red', 'green', 'blue']});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_allowedValues_ignoreCase': NOT_SUPPORTED, // case-insensitive enum match; no JSON Schema equivalent
  'STRING_FORMAT.string_allowedValues_escaped': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', enum: ['a.b', 'c+d']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', enum: ['a.b', 'c+d']});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_disallowedValues': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', not: {enum: ['admin', 'root']}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', not: {enum: ['admin', 'root']}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_customErrorMessage': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', enum: ['a', 'b']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', enum: ['a', 'b']});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.alpha': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', pattern: '^[A-Za-z]+$'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', pattern: '^[A-Za-z]+$'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.alphaNumeric': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', pattern: '^[A-Za-z0-9]+$'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', pattern: '^[A-Za-z0-9]+$'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.numeric': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', pattern: '^[0-9]+$'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', pattern: '^[0-9]+$'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.alpha_withLength': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', pattern: '^[A-Za-z]+$', maxLength: 3});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', pattern: '^[A-Za-z]+$', maxLength: 3});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.lowercase_validate': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.uuidv4': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.uuidv7': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.date_iso': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', format: 'date'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', format: 'date'});
      return (value: unknown) => validate(value) === true;
    },
  }, // ajv-formats full mode: calendar-aware ISO date
  'STRING_FORMAT.date_DMY': NOT_SUPPORTED, // invalid sample '31-04-2024' is layout-valid (DD=31,MM=04) but April has 30 days; rejecting it needs per-month day-count validation a pattern cannot express
  'STRING_FORMAT.date_YM': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.date_MD': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.date_minMax_absolute': NOT_SUPPORTED, // requires date-comparison logic; pattern alone cannot enforce date range
  'STRING_FORMAT.time_iso': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.time_HHmmss': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.time_HHmmss_ms': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d{1,3})?$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d{1,3})?$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.time_minMax_absolute': NOT_SUPPORTED, // requires time-comparison logic; pattern alone cannot enforce time range
  // ajv-formats full mode gives calendar validity; pattern 'T' enforces the ISO
  // 'T' separator (ajv-formats/RFC3339 also accept a space, which we reject).
  'STRING_FORMAT.dateTime_default': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', format: 'date-time', pattern: 'T'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', format: 'date-time', pattern: 'T'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.dateTime_custom': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^(0[1-9]|[12]\\d|3[01])-(0[1-9]|1[0-2])-\\d{4} ([01]\\d|2[0-3]):[0-5]\\d$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^(0[1-9]|[12]\\d|3[01])-(0[1-9]|1[0-2])-\\d{4} ([01]\\d|2[0-3]):[0-5]\\d$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.dateTime_minMax_absolute': NOT_SUPPORTED, // requires datetime-comparison logic; pattern alone cannot enforce range
  'STRING_FORMAT.ipv4': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', format: 'ipv4'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', format: 'ipv4'});
      return (value: unknown) => validate(value) === true;
    },
  }, // ajv-formats
  'STRING_FORMAT.ipv6': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', format: 'ipv6'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', format: 'ipv6'});
      return (value: unknown) => validate(value) === true;
    },
  }, // ajv-formats
  'STRING_FORMAT.ip_any': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        anyOf: [
          {pattern: '^(?:(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]\\d|\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]\\d|\\d)$'},
          {
            pattern:
              '^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^::1$|^::$',
          },
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        anyOf: [
          {pattern: '^(?:(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]\\d|\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]\\d|\\d)$'},
          {
            pattern:
              '^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^::1$|^::$',
          },
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.ipv4_port': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern:
          '^(?:(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]\\d|\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]\\d|\\d):(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern:
          '^(?:(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]\\d|\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]\\d|\\d):(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.ipv6_port': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern:
          '^\\[(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\\]:(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$|^\\[::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}\\]:(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$|^\\[(?:[0-9a-fA-F]{1,4}:){1,7}:\\]:(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$|^\\[(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}\\]:(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$|^\\[::1\\]:(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern:
          '^\\[(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\\]:(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$|^\\[::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}\\]:(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$|^\\[(?:[0-9a-fA-F]{1,4}:){1,7}:\\]:(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$|^\\[(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}\\]:(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$|^\\[::1\\]:(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.domain': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.domainStrict': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.){1,5}[a-zA-Z]{2,}$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.){1,5}[a-zA-Z]{2,}$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.email': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        // local-part 2+ chars (rejects 'a@...'); domain: optional subdomains + 2+ char label + 2+ char TLD
        pattern: '^[a-zA-Z0-9._%+\\-]{2,}@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)*[a-zA-Z0-9]{2,}\\.[a-zA-Z]{2,}$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        // local-part 2+ chars (rejects 'a@...'); domain: optional subdomains + 2+ char label + 2+ char TLD
        pattern: '^[a-zA-Z0-9._%+\\-]{2,}@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)*[a-zA-Z0-9]{2,}\\.[a-zA-Z]{2,}$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.emailPunycode': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern:
          '^[a-zA-Z0-9._%+\\-]{2,}@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)*[a-zA-Z0-9]{2,}\\.(?:[a-zA-Z]{2,}|xn--[a-zA-Z0-9]+)$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern:
          '^[a-zA-Z0-9._%+\\-]{2,}@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)*[a-zA-Z0-9]{2,}\\.(?:[a-zA-Z]{2,}|xn--[a-zA-Z0-9]+)$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.emailStrict': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        // strict: no + in local, no _ in domain, 2+ char domain label, 2+ char TLD
        pattern: '^[a-zA-Z0-9.\\-]+@(?:[a-zA-Z0-9](?:[a-zA-Z0-9\\-]{0,61}[a-zA-Z0-9])?\\.)*[a-zA-Z0-9]{2,}\\.[a-zA-Z]{2,}$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        // strict: no + in local, no _ in domain, 2+ char domain label, 2+ char TLD
        pattern: '^[a-zA-Z0-9.\\-]+@(?:[a-zA-Z0-9](?:[a-zA-Z0-9\\-]{0,61}[a-zA-Z0-9])?\\.)*[a-zA-Z0-9]{2,}\\.[a-zA-Z]{2,}$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.url': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^(?:https?|ftp|wss?):\\/\\/.+',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^(?:https?|ftp|wss?):\\/\\/.+',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.urlHttp': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^https?:\\/\\/.+',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^https?:\\/\\/.+',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.urlFile': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^file:\\/\\/.+',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^file:\\/\\/.+',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.pattern_slug': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.pattern_hex': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', pattern: '^[0-9a-fA-F]+$'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'string', pattern: '^[0-9a-fA-F]+$'});
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── NUMBER_FORMAT ──
  'NUMBER_FORMAT.number_max': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'number', maximum: 100});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'number', maximum: 100});
      return (value: unknown) => validate(value) === true;
    },
  },
  'NUMBER_FORMAT.number_min': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'number', minimum: 0});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'number', minimum: 0});
      return (value: unknown) => validate(value) === true;
    },
  },
  'NUMBER_FORMAT.number_lt': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'number', exclusiveMaximum: 10});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'number', exclusiveMaximum: 10});
      return (value: unknown) => validate(value) === true;
    },
  },
  'NUMBER_FORMAT.number_gt': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'number', exclusiveMinimum: 0});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'number', exclusiveMinimum: 0});
      return (value: unknown) => validate(value) === true;
    },
  },
  'NUMBER_FORMAT.number_integer': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'integer'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'integer'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'NUMBER_FORMAT.number_float': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'number', not: {type: 'integer'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'number', not: {type: 'integer'}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'NUMBER_FORMAT.number_multipleOf': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'number', multipleOf: 5});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'number', multipleOf: 5});
      return (value: unknown) => validate(value) === true;
    },
  },
  'NUMBER_FORMAT.number_combined': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'integer', minimum: 0, maximum: 100, multipleOf: 5});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'integer', minimum: 0, maximum: 100, multipleOf: 5});
      return (value: unknown) => validate(value) === true;
    },
  },
  'NUMBER_FORMAT.number_int8': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'integer', minimum: -128, maximum: 127});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'integer', minimum: -128, maximum: 127});
      return (value: unknown) => validate(value) === true;
    },
  },
  'NUMBER_FORMAT.number_uint8': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'integer', minimum: 0, maximum: 255});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({type: 'integer', minimum: 0, maximum: 255});
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── BIGINT_FORMAT ──
  'BIGINT_FORMAT.bigint_max': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_min': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_lt': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_gt': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_multipleOf': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_combined': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_int64': NOT_SUPPORTED, // no bigint type in JSON Schema
  'BIGINT_FORMAT.bigint_uint64': NOT_SUPPORTED, // no bigint type in JSON Schema

  // ── DATETIME ──
  'DATETIME.date_minmax': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.date_gtlt': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.date_min_lt': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.date_max_now': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.date_rel_window': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.date_rel_datetime_components': NOT_SUPPORTED, // no Date instance type in JSON Schema
  'DATETIME.instant_minmax': NOT_SUPPORTED, // no Temporal.Instant instance type in JSON Schema
  'DATETIME.instant_gtlt': NOT_SUPPORTED, // no Temporal.Instant instance type in JSON Schema
  'DATETIME.instant_rel': NOT_SUPPORTED, // no Temporal.Instant instance type in JSON Schema
  'DATETIME.plainDate_minmax': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_gtlt': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_min_lt': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_gt_max': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_min_only': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_max_only': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_gt_only': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_lt_only': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_rel_window': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_rel_ymd': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainDate_rel_weeks': NOT_SUPPORTED, // no Temporal.PlainDate instance type in JSON Schema
  'DATETIME.plainTime_minmax': NOT_SUPPORTED, // no Temporal.PlainTime instance type in JSON Schema
  'DATETIME.plainTime_gtlt': NOT_SUPPORTED, // no Temporal.PlainTime instance type in JSON Schema
  'DATETIME.plainDateTime_minmax': NOT_SUPPORTED, // no Temporal.PlainDateTime instance type in JSON Schema
  'DATETIME.plainDateTime_gtlt': NOT_SUPPORTED, // no Temporal.PlainDateTime instance type in JSON Schema
  'DATETIME.plainDateTime_rel': NOT_SUPPORTED, // no Temporal.PlainDateTime instance type in JSON Schema
  'DATETIME.plainDateTime_rel_combo': NOT_SUPPORTED, // no Temporal.PlainDateTime instance type in JSON Schema
  'DATETIME.plainYearMonth_minmax': NOT_SUPPORTED, // no Temporal.PlainYearMonth instance type in JSON Schema
  'DATETIME.plainYearMonth_gtlt': NOT_SUPPORTED, // no Temporal.PlainYearMonth instance type in JSON Schema
  'DATETIME.plainYearMonth_rel': NOT_SUPPORTED, // no Temporal.PlainYearMonth instance type in JSON Schema
  'DATETIME.zonedDateTime_minmax': NOT_SUPPORTED, // no Temporal.ZonedDateTime instance type in JSON Schema
  'DATETIME.zonedDateTime_gtlt': NOT_SUPPORTED, // no Temporal.ZonedDateTime instance type in JSON Schema
  'DATETIME.zonedDateTime_rel': NOT_SUPPORTED, // no Temporal.ZonedDateTime instance type in JSON Schema

  // ── REALWORLD ──
  'REALWORLD.user': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          id: {type: 'number'},
          email: {type: 'string'},
          name: {type: 'string'},
          age: {type: 'number'},
          roles: {type: 'array', items: {enum: ['admin', 'editor', 'user']}},
          active: {type: 'boolean'},
          createdAt: {type: 'string'},
        },
        required: ['id', 'email', 'name', 'roles', 'active', 'createdAt'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          id: {type: 'number'},
          email: {type: 'string'},
          name: {type: 'string'},
          age: {type: 'number'},
          roles: {type: 'array', items: {enum: ['admin', 'editor', 'user']}},
          active: {type: 'boolean'},
          createdAt: {type: 'string'},
        },
        required: ['id', 'email', 'name', 'roles', 'active', 'createdAt'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'REALWORLD.order': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          id: {type: 'string'},
          customer: {type: 'object', properties: {id: {type: 'number'}, email: {type: 'string'}}, required: ['id', 'email']},
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {sku: {type: 'string'}, name: {type: 'string'}, qty: {type: 'number'}, price: {type: 'number'}},
              required: ['sku', 'name', 'qty', 'price'],
            },
          },
          shipping: {
            type: 'object',
            properties: {
              street: {type: 'string'},
              city: {type: 'string'},
              state: {type: 'string'},
              zip: {type: 'string'},
              country: {type: 'string'},
            },
            required: ['street', 'city', 'state', 'zip', 'country'],
          },
          status: {enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled']},
          total: {type: 'number'},
          note: {type: 'string'},
        },
        required: ['id', 'customer', 'items', 'shipping', 'status', 'total'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          id: {type: 'string'},
          customer: {type: 'object', properties: {id: {type: 'number'}, email: {type: 'string'}}, required: ['id', 'email']},
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {sku: {type: 'string'}, name: {type: 'string'}, qty: {type: 'number'}, price: {type: 'number'}},
              required: ['sku', 'name', 'qty', 'price'],
            },
          },
          shipping: {
            type: 'object',
            properties: {
              street: {type: 'string'},
              city: {type: 'string'},
              state: {type: 'string'},
              zip: {type: 'string'},
              country: {type: 'string'},
            },
            required: ['street', 'city', 'state', 'zip', 'country'],
          },
          status: {enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled']},
          total: {type: 'number'},
          note: {type: 'string'},
        },
        required: ['id', 'customer', 'items', 'shipping', 'status', 'total'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'REALWORLD.blogPost': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          id: {type: 'number'},
          title: {type: 'string'},
          slug: {type: 'string'},
          body: {type: 'string'},
          tags: {type: 'array', items: {type: 'string'}},
          author: {type: 'object', properties: {name: {type: 'string'}, email: {type: 'string'}}, required: ['name', 'email']},
          published: {type: 'boolean'},
          publishedAt: {type: 'string'},
          meta: {type: 'object', properties: {views: {type: 'number'}, likes: {type: 'number'}}, required: ['views', 'likes']},
        },
        required: ['id', 'title', 'slug', 'body', 'tags', 'author', 'published', 'meta'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          id: {type: 'number'},
          title: {type: 'string'},
          slug: {type: 'string'},
          body: {type: 'string'},
          tags: {type: 'array', items: {type: 'string'}},
          author: {type: 'object', properties: {name: {type: 'string'}, email: {type: 'string'}}, required: ['name', 'email']},
          published: {type: 'boolean'},
          publishedAt: {type: 'string'},
          meta: {type: 'object', properties: {views: {type: 'number'}, likes: {type: 'number'}}, required: ['views', 'likes']},
        },
        required: ['id', 'title', 'slug', 'body', 'tags', 'author', 'published', 'meta'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'REALWORLD.product': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          id: {type: 'string'},
          name: {type: 'string'},
          description: {type: 'string'},
          price: {type: 'number'},
          currency: {enum: ['USD', 'EUR', 'GBP']},
          inStock: {type: 'boolean'},
          categories: {type: 'array', items: {type: 'string'}},
          dimensions: {
            type: 'object',
            properties: {width: {type: 'number'}, height: {type: 'number'}, depth: {type: 'number'}},
            required: ['width', 'height', 'depth'],
          },
        },
        required: ['id', 'name', 'description', 'price', 'currency', 'inStock', 'categories'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          id: {type: 'string'},
          name: {type: 'string'},
          description: {type: 'string'},
          price: {type: 'number'},
          currency: {enum: ['USD', 'EUR', 'GBP']},
          inStock: {type: 'boolean'},
          categories: {type: 'array', items: {type: 'string'}},
          dimensions: {
            type: 'object',
            properties: {width: {type: 'number'}, height: {type: 'number'}, depth: {type: 'number'}},
            required: ['width', 'height', 'depth'],
          },
        },
        required: ['id', 'name', 'description', 'price', 'currency', 'inStock', 'categories'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'REALWORLD.productPage': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: {type: 'string'},
                name: {type: 'string'},
                description: {type: 'string'},
                price: {type: 'number'},
                currency: {enum: ['USD', 'EUR', 'GBP']},
                inStock: {type: 'boolean'},
                categories: {type: 'array', items: {type: 'string'}},
                dimensions: {
                  type: 'object',
                  properties: {width: {type: 'number'}, height: {type: 'number'}, depth: {type: 'number'}},
                  required: ['width', 'height', 'depth'],
                },
              },
              required: ['id', 'name', 'description', 'price', 'currency', 'inStock', 'categories'],
            },
          },
          page: {type: 'number'},
          pageSize: {type: 'number'},
          total: {type: 'number'},
          hasMore: {type: 'boolean'},
        },
        required: ['data', 'page', 'pageSize', 'total', 'hasMore'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: {type: 'string'},
                name: {type: 'string'},
                description: {type: 'string'},
                price: {type: 'number'},
                currency: {enum: ['USD', 'EUR', 'GBP']},
                inStock: {type: 'boolean'},
                categories: {type: 'array', items: {type: 'string'}},
                dimensions: {
                  type: 'object',
                  properties: {width: {type: 'number'}, height: {type: 'number'}, depth: {type: 'number'}},
                  required: ['width', 'height', 'depth'],
                },
              },
              required: ['id', 'name', 'description', 'price', 'currency', 'inStock', 'categories'],
            },
          },
          page: {type: 'number'},
          pageSize: {type: 'number'},
          total: {type: 'number'},
          hasMore: {type: 'boolean'},
        },
        required: ['data', 'page', 'pageSize', 'total', 'hasMore'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'REALWORLD.registrationForm': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          email: {type: 'string'},
          password: {type: 'string'},
          acceptedTerms: {const: true},
          profile: {
            type: 'object',
            properties: {firstName: {type: 'string'}, lastName: {type: 'string'}, age: {type: 'number'}},
            required: ['firstName', 'lastName'],
          },
        },
        required: ['email', 'password', 'acceptedTerms', 'profile'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          email: {type: 'string'},
          password: {type: 'string'},
          acceptedTerms: {const: true},
          profile: {
            type: 'object',
            properties: {firstName: {type: 'string'}, lastName: {type: 'string'}, age: {type: 'number'}},
            required: ['firstName', 'lastName'],
          },
        },
        required: ['email', 'password', 'acceptedTerms', 'profile'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'REALWORLD.toBeChecked': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          number: {type: 'number'},
          negNumber: {type: 'number'},
          maxNumber: {type: 'number'},
          string: {type: 'string'},
          longString: {type: 'string'},
          boolean: {type: 'boolean'},
          deeplyNested: {
            type: 'object',
            properties: {foo: {type: 'string'}, num: {type: 'number'}, bool: {type: 'boolean'}},
            required: ['foo', 'num', 'bool'],
          },
        },
        required: ['number', 'negNumber', 'maxNumber', 'string', 'longString', 'boolean', 'deeplyNested'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          number: {type: 'number'},
          negNumber: {type: 'number'},
          maxNumber: {type: 'number'},
          string: {type: 'string'},
          longString: {type: 'string'},
          boolean: {type: 'boolean'},
          deeplyNested: {
            type: 'object',
            properties: {foo: {type: 'string'}, num: {type: 'number'}, bool: {type: 'boolean'}},
            required: ['foo', 'num', 'bool'],
          },
        },
        required: ['number', 'negNumber', 'maxNumber', 'string', 'longString', 'boolean', 'deeplyNested'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── JSON_SCHEMA ──
  // One document, compiled by ajv 2020-12 exactly as ts-runtypes receives it.
  // No `samples` override survives in this group: every remaining case was
  // verified to agree with our semantics by RUNNING ajv (full-mode email
  // requires the dotted TLD; multipleOf rejects NaN and Infinity). The two
  // cases that did diverge (record_number, union_anyof, both the bare
  // `{type:'number'}` NaN/Infinity split) were plain shapes and left this group
  // with the rest of the shape cases.
  'JSON_SCHEMA.property_names': {
    build: () => compile2020('property_names', false),
    buildErrors: () => compile2020('property_names', true),
  },
  'JSON_SCHEMA.contains_count': {
    build: () => compile2020('contains_count', false),
    buildErrors: () => compile2020('contains_count', true),
  },
  'JSON_SCHEMA.unique_items': {
    build: () => compile2020('unique_items', false),
    buildErrors: () => compile2020('unique_items', true),
  },
  'JSON_SCHEMA.object_size': {
    build: () => compile2020('object_size', false),
    buildErrors: () => compile2020('object_size', true),
  },
  'JSON_SCHEMA.string_email': {
    build: () => compile2020('string_email', false),
    buildErrors: () => compile2020('string_email', true),
  },
  'JSON_SCHEMA.int_bounded': {
    build: () => compile2020('int_bounded', false),
    buildErrors: () => compile2020('int_bounded', true),
  },
  'JSON_SCHEMA.string_pattern': {
    build: () => compile2020('string_pattern', false),
    buildErrors: () => compile2020('string_pattern', true),
  },
  'JSON_SCHEMA.multiple_of': {
    build: () => compile2020('multiple_of', false),
    buildErrors: () => compile2020('multiple_of', true),
  },

  // ── STRICT ──
  // additionalProperties:false at every level — ajv's closedness, the direct
  // counterpart to the count check the RunTypes column runs.
  'STRICT.flat_required': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {id: {type: 'number'}, name: {type: 'string'}, active: {type: 'boolean'}},
        required: ['id', 'name', 'active'],
        additionalProperties: false,
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {id: {type: 'number'}, name: {type: 'string'}, active: {type: 'boolean'}},
        required: ['id', 'name', 'active'],
        additionalProperties: false,
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRICT.nested_required': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          name: {type: 'string'},
          inner: {
            type: 'object',
            properties: {x: {type: 'number'}, y: {type: 'string'}},
            required: ['x', 'y'],
            additionalProperties: false,
          },
        },
        required: ['name', 'inner'],
        additionalProperties: false,
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          name: {type: 'string'},
          inner: {
            type: 'object',
            properties: {x: {type: 'number'}, y: {type: 'string'}},
            required: ['x', 'y'],
            additionalProperties: false,
          },
        },
        required: ['name', 'inner'],
        additionalProperties: false,
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRICT.moltar_dto': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          number: {type: 'number'},
          negNumber: {type: 'number'},
          maxNumber: {type: 'number'},
          string: {type: 'string'},
          longString: {type: 'string'},
          boolean: {type: 'boolean'},
          deeplyNested: {
            type: 'object',
            properties: {foo: {type: 'string'}, num: {type: 'number'}, bool: {type: 'boolean'}},
            required: ['foo', 'num', 'bool'],
            additionalProperties: false,
          },
        },
        required: ['number', 'negNumber', 'maxNumber', 'string', 'longString', 'boolean', 'deeplyNested'],
        additionalProperties: false,
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          number: {type: 'number'},
          negNumber: {type: 'number'},
          maxNumber: {type: 'number'},
          string: {type: 'string'},
          longString: {type: 'string'},
          boolean: {type: 'boolean'},
          deeplyNested: {
            type: 'object',
            properties: {foo: {type: 'string'}, num: {type: 'number'}, bool: {type: 'boolean'}},
            required: ['foo', 'num', 'bool'],
            additionalProperties: false,
          },
        },
        required: ['number', 'negNumber', 'maxNumber', 'string', 'longString', 'boolean', 'deeplyNested'],
        additionalProperties: false,
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRICT.realworld_order': {
    build: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          id: {type: 'string'},
          customer: {
            type: 'object',
            properties: {id: {type: 'number'}, email: {type: 'string'}},
            required: ['id', 'email'],
            additionalProperties: false,
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {sku: {type: 'string'}, name: {type: 'string'}, qty: {type: 'number'}, price: {type: 'number'}},
              required: ['sku', 'name', 'qty', 'price'],
              additionalProperties: false,
            },
          },
          shipping: {
            type: 'object',
            properties: {street: {type: 'string'}, city: {type: 'string'}, state: {type: 'string'}, zip: {type: 'string'}, country: {type: 'string'}},
            required: ['street', 'city', 'state', 'zip', 'country'],
            additionalProperties: false,
          },
          status: {enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled']},
          total: {type: 'number'},
          note: {type: 'string'},
        },
        required: ['id', 'customer', 'items', 'shipping', 'status', 'total'],
        additionalProperties: false,
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({strict: false, allowUnionTypes: true, allErrors: true});
      addFormats(ajv, {mode: 'full'});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          id: {type: 'string'},
          customer: {
            type: 'object',
            properties: {id: {type: 'number'}, email: {type: 'string'}},
            required: ['id', 'email'],
            additionalProperties: false,
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {sku: {type: 'string'}, name: {type: 'string'}, qty: {type: 'number'}, price: {type: 'number'}},
              required: ['sku', 'name', 'qty', 'price'],
              additionalProperties: false,
            },
          },
          shipping: {
            type: 'object',
            properties: {street: {type: 'string'}, city: {type: 'string'}, state: {type: 'string'}, zip: {type: 'string'}, country: {type: 'string'}},
            required: ['street', 'city', 'state', 'zip', 'country'],
            additionalProperties: false,
          },
          status: {enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled']},
          total: {type: 'number'},
          note: {type: 'string'},
        },
        required: ['id', 'customer', 'items', 'shipping', 'status', 'total'],
        additionalProperties: false,
      });
      return (value: unknown) => validate(value) === true;
    },
  },
};
