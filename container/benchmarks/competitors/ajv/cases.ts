import Ajv, {_, type Code, type KeywordCxt, type Name} from 'ajv';
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

// `plainObject`: the document's root is a record, so mion's plain-object guard (R3) joins its `type: 'object'`.
function compile2020(key: JsonSchemaKey, allErrors: boolean, plainObject = false): (value: unknown) => boolean {
  const ajv = new Ajv2020({allErrors});
  if (key === 'string_email') addFormats(ajv, {mode: 'full'}); // full: `email` must require the dotted TLD ('missing@tld')
  if (plainObject) addPlainObject(ajv);
  const validate = ajv.compile(plainObject ? {...doc(key), plainObject: true} : doc(key));
  return (value: unknown) => validate(value) === true;
}

// ── Leaf hooks ──
// JSON Schema has no keyword for bigint, undefined, Date, Temporal, the plain-object guard or cycle detection, so each
// is an ajv `code` keyword: its check is inlined into the generated validator (no call, no per-call object), bound
// values are bound once from ajv's scope. `cxt.pass(cond)` / `cxt.error()` report one error; without allErrors ajv
// returns at once, with allErrors it records it and keeps going, so one keyword serves both metrics.

type Op = '>=' | '<=' | '>' | '<';
const holds: Record<Op, (l: Code, r: Code) => Code> = {
  '>=': (l, r) => _`${l} >= ${r}`,
  '<=': (l, r) => _`${l} <= ${r}`,
  '>': (l, r) => _`${l} > ${r}`,
  '<': (l, r) => _`${l} < ${r}`,
};
// A fixed bound is bound once; a function bound (a relative "now" bound) is called on every check.
const boundCode = (cxt: KeywordCxt, bound: unknown): Code =>
  typeof bound === 'function' ? _`${cxt.gen.scopeValue('func', {ref: bound})}()` : cxt.gen.scopeValue('obj', {ref: bound});

// `{bigint: true}`: `typeof v === 'bigint'` (R5). `{bigint: {max, lt, min, gt, multipleOf}}` (decimal strings, as a
// bigint cannot be JSON): the type check, then one error per failed bound in mion's order. Type-less: runs on any value.
function addBigint(ajv: Ajv): void {
  ajv.addKeyword({
    keyword: 'bigint',
    schemaType: ['boolean', 'object'],
    code(cxt: KeywordCxt) {
      const {gen, data, schema} = cxt;
      if (schema === true) return cxt.pass(_`typeof ${data} == "bigint"`);
      const big = (k: string) => gen.scopeValue('obj', {ref: BigInt(schema[k])});
      const fails: Code[] = [];
      if (schema.max !== undefined) fails.push(_`${data} > ${big('max')}`);
      if (schema.lt !== undefined) fails.push(_`${data} >= ${big('lt')}`);
      if (schema.min !== undefined) fails.push(_`${data} < ${big('min')}`);
      if (schema.gt !== undefined) fails.push(_`${data} <= ${big('gt')}`);
      if (schema.multipleOf !== undefined) fails.push(_`${data} % ${big('multipleOf')} !== 0n`);
      gen.if(
        _`typeof ${data} != "bigint"`,
        () => cxt.error(),
        () => fails.forEach((fail) => gen.if(fail, () => cxt.error()))
      );
    },
  });
}

// `{bigintConst: '1'}`: `v === 1n`, mion's bigint literal check (R5).
function addBigintConst(ajv: Ajv): void {
  ajv.addKeyword({
    keyword: 'bigintConst',
    schemaType: 'string',
    code: (cxt: KeywordCxt) => cxt.pass(_`${cxt.data} === ${cxt.gen.scopeValue('obj', {ref: BigInt(cxt.schema)})}`),
  });
}

// `{isUndefined: true}`: `v === undefined`. Type-less, so it also runs on `undefined`.
function addIsUndefined(ajv: Ajv): void {
  ajv.addKeyword({
    keyword: 'isUndefined',
    schemaType: 'boolean',
    code: (cxt: KeywordCxt) => cxt.pass(_`${cxt.data} === undefined`),
  });
}

// `{plainObject: true}` next to `type: 'object'`: mion's plain-object guard (R3), on index-signature and
// all-optional nodes only. `type: 'object'` already rejects null and arrays; this adds the toString test and runs
// first in the object group (before the key loop), like mion's guard.
function addPlainObject(ajv: Ajv): void {
  ajv.addKeyword({
    keyword: 'plainObject',
    type: 'object',
    schemaType: 'boolean',
    before: 'maxProperties',
    code: (cxt: KeywordCxt) => cxt.pass(_`Object.prototype.toString.call(${cxt.data}) === "[object Object]"`),
  });
}

// `{validDate: true}`: a valid Date, mion's `v instanceof Date && !isNaN(v.getTime())` (R2), then each `bounds`
// entry as `v.getTime() <op> bound` in the given order (mion's). Type-less: runs on any value.
function addValidDate(ajv: Ajv, bounds: [Op, number | (() => number)][] = []): void {
  ajv.addKeyword({
    keyword: 'validDate',
    schemaType: 'boolean',
    code(cxt: KeywordCxt) {
      const {gen, data} = cxt;
      const isDate = _`${data} instanceof Date && !isNaN(${data}.getTime())`;
      if (bounds.length === 0) return cxt.pass(isDate);
      gen.if(
        _`!(${isDate})`,
        () => cxt.error(),
        () => bounds.forEach(([op, b]) => gen.if(_`!(${holds[op](_`${data}.getTime()`, boundCode(cxt, b))})`, () => cxt.error()))
      );
    },
  });
}

// `{temporal: true}`: `v instanceof <Class>` (R4), then each `bounds` entry as `<Class>.compare(v, bound) <op> 0`
// in the given order (mion's). The class is passed in, so Temporal is only read inside a DATETIME builder.
function addTemporal(ajv: Ajv, cls: object, bounds: [Op, unknown][] = []): void {
  ajv.addKeyword({
    keyword: 'temporal',
    schemaType: 'boolean',
    code(cxt: KeywordCxt) {
      const {gen, data} = cxt;
      const C = gen.scopeValue('obj', {ref: cls});
      if (bounds.length === 0) return cxt.pass(_`${data} instanceof ${C}`);
      gen.if(
        _`!(${data} instanceof ${C})`,
        () => cxt.error(),
        () =>
          bounds.forEach(([op, b]) => {
            const cmp = _`${C}.compare(${data}, ${boundCode(cxt, b)})`;
            gen.if(_`!(${holds[op](cmp, _`0`)})`, () => cxt.error());
          })
      );
    },
  });
}

// `{noCycle: true}` at the root: one call to `hasCycle`, which walks ONLY the recursive property path (R6). Used as
// `if: {noCycle: true}, then: <shape>, else: false`: the `if` runs without allErrors, so a cyclic value never
// reaches the recursive shape check (which would never end) in either metric.
function addNoCycle(ajv: Ajv, hasCycle: (value: unknown) => boolean): void {
  ajv.addKeyword({
    keyword: 'noCycle',
    schemaType: 'boolean',
    code: (cxt: KeywordCxt) => cxt.fail(_`${cxt.gen.scopeValue('func', {ref: hasCycle})}(${cxt.data})`),
  });
}

// `{<keyword>: true}`: one inlined `test(v)` for a value JSON Schema cannot type (symbol, RegExp, function,
// thenable: the cases mion refuses as non-data). Type-less: runs on any value.
function addTest(ajv: Ajv, keyword: string, test: (data: Name) => Code): void {
  ajv.addKeyword({keyword, schemaType: 'boolean', code: (cxt: KeywordCxt) => cxt.pass(test(cxt.data))});
}

// Gregorian day-of-month check shared by the custom date formats (the calendar rule of ajv-formats `date`).
const DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function isCalendarDate(y: number, m: number, d: number): boolean {
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  return m >= 1 && m <= 12 && d >= 1 && d <= (m === 2 && leap ? 29 : DAYS[m]);
}

// Each supported case compiles its JSON Schema inside its own builder thunk:
// self-contained and copy-paste runnable, with any shared sub-schema inlined (the
// leaf hooks above are the only shared code). The `validate` metric uses a default
// Ajv; `validationErrors` uses an allErrors:true Ajv (the "collect every error"
// path). Options stay at ajv's defaults: strict mode on, which also keeps
// `strictNumbers` on, so every `number` / `integer` check rejects NaN and
// ±Infinity like mion. A non-default option (`allowUnionTypes` for a `type` array,
// `discriminator` for a tag switch) carries its reason at the call site. ajv-formats
// is added only where a schema uses one of its formats or limit keywords, in full
// mode only where mion's check is calendar-aware. Self references are `$ref: '#'`
// (a direct self-call). The Ajv instance + compile run inside the builder (one-time
// setup, not timed), so only the returned check function is measured. No case
// carries a `samples` override.

// TOTAL map over every shared case key (order matches the suite). Supported cases
// compile a JSON Schema, with a leaf hook where JSON Schema has no type (bigint,
// undefined, Date, Temporal, Map, Set, symbol, RegExp, function, thenable, the
// plain-object guard, cycle detection). The cases mion refuses as non-data still run
// here (scoring fills mion's cell). NOT_SUPPORTED is left only for the two cases
// with no shared samples.
export const cases: CompetitorCases = {
  // ── ATOMIC ──
  'ATOMIC.any': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.bigint': {
    build: () => {
      const ajv = new Ajv();
      addBigint(ajv);
      const validate = ajv.compile({bigint: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addBigint(ajv);
      const validate = ajv.compile({bigint: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.boolean': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'boolean'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'boolean'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.date': {
    build: () => {
      const ajv = new Ajv();
      addValidDate(ajv);
      const validate = ajv.compile({validDate: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addValidDate(ajv);
      const validate = ajv.compile({validDate: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.enum_mixed': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({enum: [0, 'green', 2]});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({enum: [0, 'green', 2]});
      return (value: unknown) => validate(value) === true;
    },
  }, // Color.Red=0, Color.Green='green', Color.Blue=2
  'ATOMIC.literal_2': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({const: 2});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({const: 2});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.literal_a': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({const: 'a'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({const: 'a'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.literal_true': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({const: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({const: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.literal_1n': {
    build: () => {
      const ajv = new Ajv();
      addBigintConst(ajv);
      const validate = ajv.compile({bigintConst: '1'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addBigintConst(ajv);
      const validate = ajv.compile({bigintConst: '1'});
      return (value: unknown) => validate(value) === true;
    },
  },
  // the case matches a symbol by its description
  'ATOMIC.literal_symbol': {
    build: () => {
      const ajv = new Ajv();
      addTest(ajv, 'helloSymbol', (v) => _`typeof ${v} == "symbol" && ${v}.description === "hello"`);
      const validate = ajv.compile({helloSymbol: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addTest(ajv, 'helloSymbol', (v) => _`typeof ${v} == "symbol" && ${v}.description === "hello"`);
      const validate = ajv.compile({helloSymbol: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.never': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({not: {}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({not: {}});
      return (value: unknown) => validate(value) === true;
    },
  }, // JSON Schema {not:{}} rejects every value — exact analogue of TS `never`
  'ATOMIC.null': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'null'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'null'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.number': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'number'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'number'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.object': {
    build: () => {
      // allowUnionTypes: the schema has a `type` array (compile-time only, silences the strictTypes log)
      const ajv = new Ajv({allowUnionTypes: true});
      const validate = ajv.compile({type: ['object', 'array']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      // allowUnionTypes: the schema has a `type` array (compile-time only, silences the strictTypes log)
      const ajv = new Ajv({allowUnionTypes: true, allErrors: true});
      const validate = ajv.compile({type: ['object', 'array']});
      return (value: unknown) => validate(value) === true;
    },
  }, // TS `object` = any non-null object, arrays included: one `typeof` test
  'ATOMIC.regexp': {
    build: () => {
      const ajv = new Ajv();
      addTest(ajv, 'isRegExp', (v) => _`${v} instanceof RegExp`);
      const validate = ajv.compile({isRegExp: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addTest(ajv, 'isRegExp', (v) => _`${v} instanceof RegExp`);
      const validate = ajv.compile({isRegExp: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.string': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.symbol': NOT_SUPPORTED, // no shared samples (factoryThrows): nothing to check
  'ATOMIC.undefined': {
    build: () => {
      const ajv = new Ajv();
      addIsUndefined(ajv);
      const validate = ajv.compile({isUndefined: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addIsUndefined(ajv);
      const validate = ajv.compile({isUndefined: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.void': {
    build: () => {
      const ajv = new Ajv();
      addIsUndefined(ajv);
      const validate = ajv.compile({isUndefined: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addIsUndefined(ajv);
      const validate = ajv.compile({isUndefined: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ATOMIC.unknown': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({});
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── ARRAY ──
  'ARRAY.string_array': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'array', items: {type: 'string'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'array', items: {type: 'string'}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.number_array': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'array', items: {type: 'number'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'array', items: {type: 'number'}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.boolean_array': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'array', items: {type: 'boolean'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'array', items: {type: 'boolean'}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.bigint_array': {
    build: () => {
      const ajv = new Ajv();
      addBigint(ajv);
      const validate = ajv.compile({type: 'array', items: {bigint: true}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addBigint(ajv);
      const validate = ajv.compile({type: 'array', items: {bigint: true}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.date_array': {
    build: () => {
      const ajv = new Ajv();
      addValidDate(ajv);
      const validate = ajv.compile({type: 'array', items: {validDate: true}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addValidDate(ajv);
      const validate = ajv.compile({type: 'array', items: {validDate: true}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.regexp_array': {
    build: () => {
      const ajv = new Ajv();
      addTest(ajv, 'isRegExp', (v) => _`${v} instanceof RegExp`);
      const validate = ajv.compile({type: 'array', items: {isRegExp: true}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addTest(ajv, 'isRegExp', (v) => _`${v} instanceof RegExp`);
      const validate = ajv.compile({type: 'array', items: {isRegExp: true}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.undefined_array': {
    build: () => {
      const ajv = new Ajv();
      addIsUndefined(ajv);
      const validate = ajv.compile({type: 'array', items: {isUndefined: true}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addIsUndefined(ajv);
      const validate = ajv.compile({type: 'array', items: {isUndefined: true}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.null_array': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'array', items: {type: 'null'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'array', items: {type: 'null'}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.array_generic': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'array', items: {type: 'string'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'array', items: {type: 'string'}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.string_array_2d': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'array', items: {type: 'array', items: {type: 'string'}}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'array', items: {type: 'array', items: {type: 'string'}}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.string_array_3d': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'array',
        items: {type: 'array', items: {type: 'array', items: {type: 'string'}}},
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'array',
        items: {type: 'array', items: {type: 'array', items: {type: 'string'}}},
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.object_array': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'array', items: {type: 'object', properties: {a: {type: 'string'}}, required: ['a']}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'array', items: {type: 'object', properties: {a: {type: 'string'}}, required: ['a']}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.union_array': {
    build: () => {
      // allowUnionTypes: the schema has a `type` array (compile-time only, silences the strictTypes log)
      const ajv = new Ajv({allowUnionTypes: true});
      const validate = ajv.compile({type: 'array', items: {type: ['string', 'number']}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      // allowUnionTypes: the schema has a `type` array (compile-time only, silences the strictTypes log)
      const ajv = new Ajv({allowUnionTypes: true, allErrors: true});
      const validate = ajv.compile({type: 'array', items: {type: ['string', 'number']}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.tuple_array': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'array',
        items: {type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2},
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'array',
        items: {type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2},
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.circular_array': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'array',
        items: {$ref: '#'},
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'array',
        items: {$ref: '#'},
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.circular_object_with_array': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'object',
        properties: {
          a: {type: 'string'},
          deep: {
            type: 'object',
            properties: {b: {type: 'string'}, c: {type: 'number'}},
            required: ['b', 'c'],
          },
          d: {type: 'array', items: {$ref: '#'}},
        },
        required: ['a'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          a: {type: 'string'},
          deep: {
            type: 'object',
            properties: {b: {type: 'string'}, c: {type: 'number'}},
            required: ['b', 'c'],
          },
          d: {type: 'array', items: {$ref: '#'}},
        },
        required: ['a'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'ARRAY.symbol_array': NOT_SUPPORTED, // no shared samples (factoryThrows): nothing to check
  'ARRAY.readonly_string_array': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'array', items: {type: 'string'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'array', items: {type: 'string'}});
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── OBJECT ──
  'OBJECT.simple_interface': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'object',
        properties: {a: {type: 'string'}, b: {type: 'number'}},
        required: ['a', 'b'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'object',
        properties: {a: {type: 'string'}, b: {type: 'number'}},
        required: ['a', 'b'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.object_as_const_literals': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'object',
        properties: {name: {const: 'john'}, age: {const: 30}},
        required: ['name', 'age'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'object',
        properties: {id: {type: 'number'}, name: {type: 'string'}},
        required: ['id', 'name'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'object',
        properties: {id: {type: 'number'}, name: {type: 'string'}},
        required: ['id', 'name'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'object',
        properties: {id: {type: 'number'}, name: {type: 'string'}},
        required: ['id', 'name'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'object', properties: {a: {type: 'string'}, b: {type: 'number'}}, required: ['a']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'object', properties: {a: {type: 'string'}, b: {type: 'number'}}, required: ['a']});
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.interface_with_date': {
    build: () => {
      const ajv = new Ajv();
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {date: {validDate: true}, name: {type: 'string'}},
        required: ['date', 'name'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {date: {validDate: true}, name: {type: 'string'}},
        required: ['date', 'name'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.interface_with_method': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'object', properties: {name: {type: 'string'}}, required: ['name']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'object', properties: {name: {type: 'string'}}, required: ['name']});
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.nested_object': {
    build: () => {
      const ajv = new Ajv();
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
      const ajv = new Ajv({allErrors: true});
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
  },
  'OBJECT.interface_string_array_prop': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'object',
        properties: {tags: {type: 'array', items: {type: 'string'}}},
        required: ['tags'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'object',
        properties: {
          name: {type: 'string'},
          child: {$ref: '#'},
        },
        required: ['name'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          name: {type: 'string'},
          child: {$ref: '#'},
        },
        required: ['name'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.circular_interface_on_array': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'object',
        properties: {
          name: {type: 'string'},
          children: {type: 'array', items: {$ref: '#'}},
        },
        required: ['name'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          name: {type: 'string'},
          children: {type: 'array', items: {$ref: '#'}},
        },
        required: ['name'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.circular_interface_on_nested_object': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'object',
        properties: {
          name: {type: 'string'},
          embedded: {
            type: 'object',
            properties: {
              hello: {type: 'string'},
              child: {$ref: '#'},
            },
            required: ['hello'],
          },
        },
        required: ['name', 'embedded'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'object',
        properties: {
          name: {type: 'string'},
          embedded: {
            type: 'object',
            properties: {
              hello: {type: 'string'},
              child: {$ref: '#'},
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
      const ajv = new Ajv();
      addPlainObject(ajv);
      const validate = ajv.compile({type: 'object', plainObject: true, additionalProperties: {type: 'string'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addPlainObject(ajv);
      const validate = ajv.compile({type: 'object', plainObject: true, additionalProperties: {type: 'string'}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.index_signature_named_props': {
    build: () => {
      // allowUnionTypes: the schema has a `type` array (compile-time only, silences the strictTypes log)
      const ajv = new Ajv({allowUnionTypes: true});
      addPlainObject(ajv);
      const validate = ajv.compile({
        type: 'object',
        plainObject: true,
        properties: {a: {type: 'string'}, b: {type: 'number'}},
        required: ['a', 'b'],
        additionalProperties: {type: ['string', 'number']},
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      // allowUnionTypes: the schema has a `type` array (compile-time only, silences the strictTypes log)
      const ajv = new Ajv({allowUnionTypes: true, allErrors: true});
      addPlainObject(ajv);
      const validate = ajv.compile({
        type: 'object',
        plainObject: true,
        properties: {a: {type: 'string'}, b: {type: 'number'}},
        required: ['a', 'b'],
        additionalProperties: {type: ['string', 'number']},
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.index_signature_nested': {
    build: () => {
      const ajv = new Ajv();
      addPlainObject(ajv);
      const validate = ajv.compile({
        type: 'object',
        plainObject: true,
        additionalProperties: {type: 'object', plainObject: true, additionalProperties: {type: 'number'}},
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addPlainObject(ajv);
      const validate = ajv.compile({
        type: 'object',
        plainObject: true,
        additionalProperties: {type: 'object', plainObject: true, additionalProperties: {type: 'number'}},
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.index_signature_date_value': {
    build: () => {
      const ajv = new Ajv();
      addPlainObject(ajv);
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        plainObject: true,
        additionalProperties: {type: 'object', plainObject: true, additionalProperties: {validDate: true}},
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addPlainObject(ajv);
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        plainObject: true,
        additionalProperties: {type: 'object', plainObject: true, additionalProperties: {validDate: true}},
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.index_signature_non_root': {
    build: () => {
      const ajv = new Ajv();
      addPlainObject(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {
          b: {type: 'string'},
          c: {
            type: 'object',
            plainObject: true,
            properties: {a: {type: 'string'}},
            required: ['a'],
            additionalProperties: {type: 'string'},
          },
        },
        required: ['b', 'c'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addPlainObject(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {
          b: {type: 'string'},
          c: {
            type: 'object',
            plainObject: true,
            properties: {a: {type: 'string'}},
            required: ['a'],
            additionalProperties: {type: 'string'},
          },
        },
        required: ['b', 'c'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.function_top_level': {
    build: () => {
      const ajv = new Ajv();
      addTest(ajv, 'isFunction', (v) => _`typeof ${v} == "function"`);
      const validate = ajv.compile({isFunction: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addTest(ajv, 'isFunction', (v) => _`typeof ${v} == "function"`);
      const validate = ajv.compile({isFunction: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  // a function with a string `extra` prop (ajv's object keywords skip a function value)
  'OBJECT.interface_callable': {
    build: () => {
      const ajv = new Ajv();
      addTest(ajv, 'callable', (v) => _`typeof ${v} == "function" && typeof ${v}.extra == "string"`);
      const validate = ajv.compile({callable: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addTest(ajv, 'callable', (v) => _`typeof ${v} == "function" && typeof ${v}.extra == "string"`);
      const validate = ajv.compile({callable: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.interface_all_optional': {
    build: () => {
      const ajv = new Ajv();
      addPlainObject(ajv);
      const validate = ajv.compile({
        type: 'object',
        plainObject: true,
        properties: {a: {type: 'string'}, b: {type: 'number'}},
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addPlainObject(ajv);
      const validate = ajv.compile({
        type: 'object',
        plainObject: true,
        properties: {a: {type: 'string'}, b: {type: 'number'}},
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.class_simple': {
    build: () => {
      const ajv = new Ajv();
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {date: {validDate: true}, name: {type: 'string'}},
        required: ['date', 'name'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {date: {validDate: true}, name: {type: 'string'}},
        required: ['date', 'name'],
      });
      return (value: unknown) => validate(value) === true;
    },
  }, // structural like mion: no instanceof on the class, someMethod unchecked
  'OBJECT.rpc_error_class': {
    build: () => {
      const ajv = new Ajv();
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
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'array', items: [{type: 'number'}, {type: 'boolean'}], minItems: 2, maxItems: 2});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'array', items: [{type: 'number'}, {type: 'boolean'}], minItems: 2, maxItems: 2});
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.call_signature_params_with_optional': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'array',
        items: [{type: 'number'}, {type: 'boolean'}, {type: 'string'}],
        minItems: 2,
        maxItems: 3,
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'array',
        items: [{type: 'number'}, {type: 'boolean'}, {type: 'string'}],
        minItems: 2,
        maxItems: 3,
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.call_signature_params_with_rest': {
    build: () => {
      const ajv = new Ajv();
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'array',
        items: [{type: 'number'}, {type: 'boolean'}],
        minItems: 2, // ajv skips absent tuple slots, mion fails them on their type check
        additionalItems: {validDate: true},
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'array',
        items: [{type: 'number'}, {type: 'boolean'}],
        minItems: 2, // ajv skips absent tuple slots, mion fails them on their type check
        additionalItems: {validDate: true},
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.record_union_keys': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'object',
        properties: {a: {type: 'number'}, b: {type: 'number'}},
        required: ['a', 'b'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'object',
        properties: {a: {type: 'number'}, b: {type: 'number'}},
        required: ['a', 'b'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.union_value_index': {
    build: () => {
      // allowUnionTypes: the schema has a `type` array (compile-time only, silences the strictTypes log)
      const ajv = new Ajv({allowUnionTypes: true});
      addPlainObject(ajv);
      const validate = ajv.compile({type: 'object', plainObject: true, additionalProperties: {type: ['string', 'number']}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      // allowUnionTypes: the schema has a `type` array (compile-time only, silences the strictTypes log)
      const ajv = new Ajv({allowUnionTypes: true, allErrors: true});
      addPlainObject(ajv);
      const validate = ajv.compile({type: 'object', plainObject: true, additionalProperties: {type: ['string', 'number']}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.object_with_union_prop': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'object',
        properties: {kind: {enum: ['a', 'b']}, n: {type: 'number'}},
        required: ['kind', 'n'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'object',
        properties: {kind: {enum: ['a', 'b']}, n: {type: 'number'}},
        required: ['kind', 'n'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'OBJECT.interface_inheritance': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'object',
        properties: {a: {type: 'string'}, b: {type: 'number'}},
        required: ['a', 'b'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'object',
        properties: {a: {type: 'string'}, b: {type: 'number'}},
        required: ['a', 'b'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
      addPlainObject(ajv);
      const validate = ajv.compile({type: 'object', plainObject: true, additionalProperties: {type: 'string'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addPlainObject(ajv);
      const validate = ajv.compile({type: 'object', plainObject: true, additionalProperties: {type: 'string'}});
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── TUPLE ──
  'TUPLE.string_number_pair': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2});
      return (value: unknown) => validate(value) === true;
    },
  },
  'TUPLE.full_mion_tuple': {
    build: () => {
      const ajv = new Ajv();
      addValidDate(ajv);
      addBigint(ajv);
      const validate = ajv.compile({
        type: 'array',
        items: [
          {validDate: true},
          {type: 'number'},
          {type: 'string'},
          {type: 'null'},
          {type: 'array', items: {type: 'string'}},
          {bigint: true},
        ],
        minItems: 6,
        maxItems: 6,
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addValidDate(ajv);
      addBigint(ajv);
      const validate = ajv.compile({
        type: 'array',
        items: [
          {validDate: true},
          {type: 'number'},
          {type: 'string'},
          {type: 'null'},
          {type: 'array', items: {type: 'string'}},
          {bigint: true},
        ],
        minItems: 6,
        maxItems: 6,
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'TUPLE.tuple_with_optional': {
    build: () => {
      const ajv = new Ajv();
      addBigint(ajv);
      addIsUndefined(ajv);
      const validate = ajv.compile({
        type: 'array',
        items: [
          {type: 'number'},
          {anyOf: [{bigint: true}, {isUndefined: true}]},
          {anyOf: [{type: 'boolean'}, {isUndefined: true}]},
          {anyOf: [{type: 'number'}, {isUndefined: true}]},
        ],
        minItems: 1, // ajv skips absent tuple slots, mion fails a missing slot 0 on its type check
        maxItems: 4,
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addBigint(ajv);
      addIsUndefined(ajv);
      const validate = ajv.compile({
        type: 'array',
        items: [
          {type: 'number'},
          {anyOf: [{bigint: true}, {isUndefined: true}]},
          {anyOf: [{type: 'boolean'}, {isUndefined: true}]},
          {anyOf: [{type: 'number'}, {isUndefined: true}]},
        ],
        minItems: 1, // ajv skips absent tuple slots, mion fails a missing slot 0 on its type check
        maxItems: 4,
      });
      return (value: unknown) => validate(value) === true;
    },
  }, // an optional slot also accepts an explicit `undefined`, like mion
  'TUPLE.nested_tuple_in_array': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'array',
        items: {type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2},
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'array',
        items: {type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2},
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'TUPLE.tuple_rest': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'array', items: [{type: 'number'}], additionalItems: {type: 'string'}, minItems: 1});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'array', items: [{type: 'number'}], additionalItems: {type: 'string'}, minItems: 1});
      return (value: unknown) => validate(value) === true;
    },
  },
  'TUPLE.tuple_circular': {
    build: () => {
      const ajv = new Ajv();
      addValidDate(ajv);
      addBigint(ajv);
      addIsUndefined(ajv);
      const validate = ajv.compile({
        type: 'array',
        items: [
          {validDate: true},
          {type: 'number'},
          {type: 'string'},
          {type: 'null'},
          {type: 'array', items: {type: 'string'}},
          {bigint: true},
          {anyOf: [{$ref: '#'}, {isUndefined: true}]},
        ],
        minItems: 6,
        maxItems: 7,
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addValidDate(ajv);
      addBigint(ajv);
      addIsUndefined(ajv);
      const validate = ajv.compile({
        type: 'array',
        items: [
          {validDate: true},
          {type: 'number'},
          {type: 'string'},
          {type: 'null'},
          {type: 'array', items: {type: 'string'}},
          {bigint: true},
          {anyOf: [{$ref: '#'}, {isUndefined: true}]},
        ],
        minItems: 6,
        maxItems: 7,
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'TUPLE.tuple_multiple_trailing_optionals': {
    build: () => {
      const ajv = new Ajv();
      addBigint(ajv);
      addIsUndefined(ajv);
      const validate = ajv.compile({
        type: 'array',
        items: [
          {type: 'number'},
          {anyOf: [{bigint: true}, {isUndefined: true}]},
          {anyOf: [{type: 'boolean'}, {isUndefined: true}]},
          {anyOf: [{type: 'number'}, {isUndefined: true}]},
        ],
        minItems: 1, // ajv skips absent tuple slots, mion fails a missing slot 0 on its type check
        maxItems: 4,
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addBigint(ajv);
      addIsUndefined(ajv);
      const validate = ajv.compile({
        type: 'array',
        items: [
          {type: 'number'},
          {anyOf: [{bigint: true}, {isUndefined: true}]},
          {anyOf: [{type: 'boolean'}, {isUndefined: true}]},
          {anyOf: [{type: 'number'}, {isUndefined: true}]},
        ],
        minItems: 1, // ajv skips absent tuple slots, mion fails a missing slot 0 on its type check
        maxItems: 4,
      });
      return (value: unknown) => validate(value) === true;
    },
  }, // an optional slot also accepts an explicit `undefined`, like mion
  'TUPLE.tuple_named_labels': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'array', items: [{type: 'string'}, {type: 'number'}], minItems: 2, maxItems: 2});
      return (value: unknown) => validate(value) === true;
    },
  },
  // the function slot must be `undefined`, like zod / TypeBox (an absent slot passes too)
  'TUPLE.tuple_with_non_serializable': {
    build: () => {
      const ajv = new Ajv();
      addIsUndefined(ajv);
      const validate = ajv.compile({type: 'array', items: [{type: 'number'}, {isUndefined: true}], minItems: 1, maxItems: 2});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addIsUndefined(ajv);
      const validate = ajv.compile({type: 'array', items: [{type: 'number'}, {isUndefined: true}], minItems: 1, maxItems: 2});
      return (value: unknown) => validate(value) === true;
    },
  },
  'TUPLE.empty_tuple': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'array', maxItems: 0});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'array', maxItems: 0});
      return (value: unknown) => validate(value) === true;
    },
  },
  'TUPLE.single_element_tuple': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'array', items: [{type: 'string'}], minItems: 1, maxItems: 1});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'array', items: [{type: 'string'}], minItems: 1, maxItems: 1});
      return (value: unknown) => validate(value) === true;
    },
  },
  'TUPLE.readonly_tuple': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'array',
        items: [{type: 'string'}, {type: 'number'}],
        minItems: 2,
        maxItems: 2,
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
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
  'UNION.atomic_union': {
    build: () => {
      // allowUnionTypes: the schema has a `type` array (compile-time only, silences the strictTypes log)
      const ajv = new Ajv({allowUnionTypes: true});
      addValidDate(ajv);
      addBigint(ajv);
      const validate = ajv.compile({anyOf: [{validDate: true}, {type: ['number', 'string', 'null']}, {bigint: true}]});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      // allowUnionTypes: the schema has a `type` array (compile-time only, silences the strictTypes log)
      const ajv = new Ajv({allowUnionTypes: true, allErrors: true});
      addValidDate(ajv);
      addBigint(ajv);
      const validate = ajv.compile({anyOf: [{validDate: true}, {type: ['number', 'string', 'null']}, {bigint: true}]});
      return (value: unknown) => validate(value) === true;
    },
  }, // adjacent primitive arms share one `type` array
  'UNION.string_literal_union': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({enum: ['UNO', 'DOS', 'TRES']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({enum: ['UNO', 'DOS', 'TRES']});
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.large_union_eight_arms': {
    build: () => {
      // allowUnionTypes: the schema has a `type` array (compile-time only, silences the strictTypes log)
      const ajv = new Ajv({allowUnionTypes: true});
      addBigint(ajv);
      const validate = ajv.compile({
        anyOf: [
          {enum: ['a', 'b']},
          {type: ['number', 'boolean', 'null']},
          {type: 'object', properties: {a: {type: 'string'}}, required: ['a']},
          {type: 'object', properties: {a: {type: 'string'}, b: {type: 'number'}}, required: ['a', 'b']},
          {type: 'object', properties: {c: {bigint: true}}, required: ['c']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      // allowUnionTypes: the schema has a `type` array (compile-time only, silences the strictTypes log)
      const ajv = new Ajv({allowUnionTypes: true, allErrors: true});
      addBigint(ajv);
      const validate = ajv.compile({
        anyOf: [
          {enum: ['a', 'b']},
          {type: ['number', 'boolean', 'null']},
          {type: 'object', properties: {a: {type: 'string'}}, required: ['a']},
          {type: 'object', properties: {a: {type: 'string'}, b: {type: 'number'}}, required: ['a', 'b']},
          {type: 'object', properties: {c: {bigint: true}}, required: ['c']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
  }, // adjacent primitive arms share one `type` array
  'UNION.string_or_number': {
    build: () => {
      // allowUnionTypes: the schema has a `type` array (compile-time only, silences the strictTypes log)
      const ajv = new Ajv({allowUnionTypes: true});
      const validate = ajv.compile({type: ['string', 'number']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      // allowUnionTypes: the schema has a `type` array (compile-time only, silences the strictTypes log)
      const ajv = new Ajv({allowUnionTypes: true, allErrors: true});
      const validate = ajv.compile({type: ['string', 'number']});
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.union_of_array_types': {
    build: () => {
      const ajv = new Ajv();
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
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        anyOf: [
          {type: 'array', items: {type: 'string'}},
          {type: 'array', items: {type: 'number'}},
          {type: 'array', items: {type: 'boolean'}},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.array_of_union': {
    build: () => {
      const ajv = new Ajv();
      addValidDate(ajv);
      addBigint(ajv);
      const validate = ajv.compile({
        type: 'array',
        items: {anyOf: [{type: 'string'}, {bigint: true}, {type: 'boolean'}, {validDate: true}]},
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addValidDate(ajv);
      addBigint(ajv);
      const validate = ajv.compile({
        type: 'array',
        items: {anyOf: [{type: 'string'}, {bigint: true}, {type: 'boolean'}, {validDate: true}]},
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.union_of_object_shapes': {
    build: () => {
      const ajv = new Ajv();
      addBigint(ajv);
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {a: {type: 'string'}, aa: {type: 'boolean'}}, required: ['a', 'aa']},
          {type: 'object', properties: {b: {type: 'number'}}, required: ['b']},
          {type: 'object', properties: {c: {bigint: true}}, required: ['c']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addBigint(ajv);
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {a: {type: 'string'}, aa: {type: 'boolean'}}, required: ['a', 'aa']},
          {type: 'object', properties: {b: {type: 'number'}}, required: ['b']},
          {type: 'object', properties: {c: {bigint: true}}, required: ['c']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.discriminated_union': {
    build: () => {
      // discriminator: enables ajv's tag switch for a discriminated union (only the matching arm runs)
      const ajv = new Ajv({discriminator: true});
      const validate = ajv.compile({
        type: 'object',
        discriminator: {propertyName: 'kind'},
        oneOf: [
          {properties: {kind: {const: 'a'}, n: {type: 'number'}}, required: ['kind', 'n']},
          {properties: {kind: {const: 'b'}, s: {type: 'string'}}, required: ['kind', 's']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      // discriminator: enables ajv's tag switch for a discriminated union (only the matching arm runs)
      const ajv = new Ajv({discriminator: true, allErrors: true});
      const validate = ajv.compile({
        type: 'object',
        discriminator: {propertyName: 'kind'},
        oneOf: [
          {properties: {kind: {const: 'a'}, n: {type: 'number'}}, required: ['kind', 'n']},
          {properties: {kind: {const: 'b'}, s: {type: 'string'}}, required: ['kind', 's']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.circular_union': {
    build: () => {
      // allowUnionTypes: the schema has a `type` array (compile-time only, silences the strictTypes log)
      const ajv = new Ajv({allowUnionTypes: true});
      addValidDate(ajv);
      addPlainObject(ajv);
      // leaf hook: mion's weak-type guard on the all-optional arm (at least one known key, or no key at all)
      ajv.addKeyword({
        keyword: 'weakType',
        type: 'object',
        schemaType: 'array',
        code: (cxt: KeywordCxt) =>
          cxt.pass(
            (cxt.schema as string[]).reduceRight(
              (c: Code, k) => _`${k} in ${cxt.data} || ${c}`,
              _`Object.keys(${cxt.data}).length === 0`
            )
          ),
      });
      const validate = ajv.compile({
        anyOf: [
          {validDate: true},
          {type: ['number', 'string']},
          {type: 'object', plainObject: true, weakType: ['a', 'b'], properties: {a: {$ref: '#'}, b: {type: 'string'}}},
          {type: 'array', items: {$ref: '#'}},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      // allowUnionTypes: the schema has a `type` array (compile-time only, silences the strictTypes log)
      const ajv = new Ajv({allowUnionTypes: true, allErrors: true});
      addValidDate(ajv);
      addPlainObject(ajv);
      // leaf hook: mion's weak-type guard on the all-optional arm (at least one known key, or no key at all)
      ajv.addKeyword({
        keyword: 'weakType',
        type: 'object',
        schemaType: 'array',
        code: (cxt: KeywordCxt) =>
          cxt.pass(
            (cxt.schema as string[]).reduceRight(
              (c: Code, k) => _`${k} in ${cxt.data} || ${c}`,
              _`Object.keys(${cxt.data}).length === 0`
            )
          ),
      });
      const validate = ajv.compile({
        anyOf: [
          {validDate: true},
          {type: ['number', 'string']},
          {type: 'object', plainObject: true, weakType: ['a', 'b'], properties: {a: {$ref: '#'}, b: {type: 'string'}}},
          {type: 'array', items: {$ref: '#'}},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.union_with_methods': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {name: {type: 'string'}}, required: ['name']},
          {type: 'object', properties: {age: {type: 'number'}}, required: ['age']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'object',
        properties: {a: {type: 'string'}, b: {type: 'number'}},
        required: ['a', 'b'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'object',
        properties: {a: {type: 'string'}, b: {type: 'number'}},
        required: ['a', 'b'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.union_with_index_arm': {
    build: () => {
      const ajv = new Ajv();
      addBigint(ajv);
      addPlainObject(ajv);
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {a: {type: 'string'}, aa: {type: 'boolean'}}, required: ['a', 'aa']},
          {type: 'object', properties: {b: {type: 'number'}}, required: ['b']},
          {
            type: 'object',
            plainObject: true,
            properties: {c: {bigint: true}},
            required: ['c'],
            additionalProperties: {bigint: true},
          },
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addBigint(ajv);
      addPlainObject(ajv);
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {a: {type: 'string'}, aa: {type: 'boolean'}}, required: ['a', 'aa']},
          {type: 'object', properties: {b: {type: 'number'}}, required: ['b']},
          {
            type: 'object',
            plainObject: true,
            properties: {c: {bigint: true}},
            required: ['c'],
            additionalProperties: {bigint: true},
          },
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.union_same_prop_different_types': {
    build: () => {
      // discriminator: enables ajv's tag switch for a discriminated union (only the matching arm runs)
      const ajv = new Ajv({discriminator: true});
      const validate = ajv.compile({
        type: 'object',
        discriminator: {propertyName: 'type'},
        oneOf: [
          {properties: {type: {const: 'a'}, prop: {type: 'boolean'}}, required: ['type', 'prop']},
          {properties: {type: {const: 'b'}, prop: {type: 'number'}}, required: ['type', 'prop']},
          {properties: {type: {const: 'c'}, prop: {type: 'string'}}, required: ['type', 'prop']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      // discriminator: enables ajv's tag switch for a discriminated union (only the matching arm runs)
      const ajv = new Ajv({discriminator: true, allErrors: true});
      const validate = ajv.compile({
        type: 'object',
        discriminator: {propertyName: 'type'},
        oneOf: [
          {properties: {type: {const: 'a'}, prop: {type: 'boolean'}}, required: ['type', 'prop']},
          {properties: {type: {const: 'b'}, prop: {type: 'number'}}, required: ['type', 'prop']},
          {properties: {type: {const: 'c'}, prop: {type: 'string'}}, required: ['type', 'prop']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.union_mixed_arrays_and_objects': {
    build: () => {
      const ajv = new Ajv();
      addBigint(ajv);
      const validate = ajv.compile({
        anyOf: [
          {type: 'array', items: {type: 'string'}},
          {type: 'array', items: {type: 'number'}},
          {type: 'array', items: {type: 'boolean'}},
          {type: 'object', properties: {a: {type: 'string'}, aa: {type: 'boolean'}}, required: ['a', 'aa']},
          {type: 'object', properties: {b: {type: 'number'}}, required: ['b']},
          {type: 'object', properties: {c: {bigint: true}, aa: {const: 'string'}}, required: ['c', 'aa']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addBigint(ajv);
      const validate = ajv.compile({
        anyOf: [
          {type: 'array', items: {type: 'string'}},
          {type: 'array', items: {type: 'number'}},
          {type: 'array', items: {type: 'boolean'}},
          {type: 'object', properties: {a: {type: 'string'}, aa: {type: 'boolean'}}, required: ['a', 'aa']},
          {type: 'object', properties: {b: {type: 'number'}}, required: ['b']},
          {type: 'object', properties: {c: {bigint: true}, aa: {const: 'string'}}, required: ['c', 'aa']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.union_merged_property': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {a: {type: 'boolean'}}, required: ['a']},
          {type: 'object', properties: {a: {type: 'number'}}, required: ['a']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {a: {type: 'boolean'}}, required: ['a']},
          {type: 'object', properties: {a: {type: 'number'}}, required: ['a']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.union_mixed_with_index': {
    build: () => {
      const ajv = new Ajv();
      addBigint(ajv);
      addPlainObject(ajv);
      const validate = ajv.compile({
        anyOf: [
          {type: 'array', items: {type: 'string'}},
          {type: 'object', properties: {a: {type: 'string'}, aa: {type: 'boolean'}}, required: ['a', 'aa']},
          {type: 'object', properties: {b: {type: 'number'}}, required: ['b']},
          {
            type: 'object',
            plainObject: true,
            properties: {a: {type: 'string'}},
            required: ['a'],
            additionalProperties: {type: 'string'},
          },
          {
            type: 'object',
            plainObject: true,
            properties: {b: {bigint: true}},
            required: ['b'],
            additionalProperties: {bigint: true},
          },
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addBigint(ajv);
      addPlainObject(ajv);
      const validate = ajv.compile({
        anyOf: [
          {type: 'array', items: {type: 'string'}},
          {type: 'object', properties: {a: {type: 'string'}, aa: {type: 'boolean'}}, required: ['a', 'aa']},
          {type: 'object', properties: {b: {type: 'number'}}, required: ['b']},
          {
            type: 'object',
            plainObject: true,
            properties: {a: {type: 'string'}},
            required: ['a'],
            additionalProperties: {type: 'string'},
          },
          {
            type: 'object',
            plainObject: true,
            properties: {b: {bigint: true}},
            required: ['b'],
            additionalProperties: {bigint: true},
          },
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.union_with_any_fallback': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({});
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.union_with_unknown_fallback': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({});
      return (value: unknown) => validate(value) === true;
    },
  },
  'UNION.union_subset_small_first': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {a: {type: 'string'}}, required: ['a']},
          {type: 'object', properties: {a: {type: 'string'}, b: {type: 'number'}}, required: ['a', 'b']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
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
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
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
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {id: {type: 'string'}}, required: ['id']},
          {type: 'object', properties: {id: {type: 'string'}, name: {type: 'string'}}, required: ['id', 'name']},
          {type: 'object', properties: {value: {type: 'number'}}, required: ['value']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── TEMPLATE_LITERAL ──
  'TEMPLATE_LITERAL.url_with_number_id': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'string',
        pattern: '^api\\/user\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^api\\/user\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'TEMPLATE_LITERAL.multi_segment_url': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'string',
        pattern: '^\\/api\\/v-?(?:\\d+\\.?\\d*|\\.\\d+)\\/user\\/[\\s\\S]*\\/posts\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^\\/api\\/v-?(?:\\d+\\.?\\d*|\\.\\d+)\\/user\\/[\\s\\S]*\\/posts\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$',
      });
      return (value: unknown) => validate(value) === true;
    },
  }, // `${number}` -> -?(?:\d+\.?\d*|\.\d+), `${string}` -> [\s\S]*, as mion
  'TEMPLATE_LITERAL.leading_string_placeholder': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'string',
        pattern: '^[\\s\\S]*\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^[\\s\\S]*\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'TEMPLATE_LITERAL.regex_special_chars': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'string',
        pattern: '^\\(-?(?:\\d+\\.?\\d*|\\.\\d+)\\)$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^\\(-?(?:\\d+\\.?\\d*|\\.\\d+)\\)$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'TEMPLATE_LITERAL.template_literal_nested_in_object': {
    build: () => {
      const ajv = new Ajv();
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
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
      addPlainObject(ajv);
      const validate = ajv.compile({
        type: 'object',
        plainObject: true,
        propertyNames: {pattern: '^api\\/[\\s\\S]*$'},
        additionalProperties: {type: 'number'},
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addPlainObject(ajv);
      const validate = ajv.compile({
        type: 'object',
        plainObject: true,
        propertyNames: {pattern: '^api\\/[\\s\\S]*$'},
        additionalProperties: {type: 'number'},
      });
      return (value: unknown) => validate(value) === true;
    },
  }, // key type `api/${string}`: every key must match, every value is a finite number
  'TEMPLATE_LITERAL.template_literal_union_placeholder': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'string',
        pattern: '^(?:a|b)--?(?:\\d+\\.?\\d*|\\.\\d+)$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^(?:a|b)--?(?:\\d+\\.?\\d*|\\.\\d+)$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── NATIVE ──
  'NATIVE.map_string_number': {
    build: () => {
      const ajv = new Ajv();
      // leaf hook: JSON Schema has no Map; instanceof + entry walk, key and value checked by inlined ajv subschemas
      ajv.addKeyword({
        keyword: 'mapOf',
        schemaType: 'object',
        code(cxt: KeywordCxt) {
          const {gen, data} = cxt;
          const valid = gen.name('valid');
          gen.if(
            _`${data} instanceof Map`,
            () =>
              gen.forOf('entry', _`${data}.entries()`, (entry) => {
                cxt.subschema({keyword: 'mapOf', schemaProp: 'key', data: _`${entry}[0]`}, valid);
                cxt.subschema({keyword: 'mapOf', schemaProp: 'value', data: _`${entry}[1]`}, valid);
              }),
            () => cxt.error()
          );
        },
      });
      const validate = ajv.compile({mapOf: {key: {type: 'string'}, value: {type: 'number'}}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // leaf hook: JSON Schema has no Map; instanceof + entry walk, key and value checked by inlined ajv subschemas
      ajv.addKeyword({
        keyword: 'mapOf',
        schemaType: 'object',
        code(cxt: KeywordCxt) {
          const {gen, data} = cxt;
          const valid = gen.name('valid');
          gen.if(
            _`${data} instanceof Map`,
            () =>
              gen.forOf('entry', _`${data}.entries()`, (entry) => {
                cxt.subschema({keyword: 'mapOf', schemaProp: 'key', data: _`${entry}[0]`}, valid);
                cxt.subschema({keyword: 'mapOf', schemaProp: 'value', data: _`${entry}[1]`}, valid);
              }),
            () => cxt.error()
          );
        },
      });
      const validate = ajv.compile({mapOf: {key: {type: 'string'}, value: {type: 'number'}}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'NATIVE.set_string': {
    build: () => {
      const ajv = new Ajv();
      // leaf hook: JSON Schema has no Set; instanceof + item walk, each item checked by an inlined ajv subschema
      ajv.addKeyword({
        keyword: 'setOf',
        schemaType: 'object',
        code(cxt: KeywordCxt) {
          const {gen, data} = cxt;
          const valid = gen.name('valid');
          gen.if(
            _`${data} instanceof Set`,
            () => gen.forOf('item', _`${data}.values()`, (item) => cxt.subschema({keyword: 'setOf', data: item}, valid)),
            () => cxt.error()
          );
        },
      });
      const validate = ajv.compile({setOf: {type: 'string'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // leaf hook: JSON Schema has no Set; instanceof + item walk, each item checked by an inlined ajv subschema
      ajv.addKeyword({
        keyword: 'setOf',
        schemaType: 'object',
        code(cxt: KeywordCxt) {
          const {gen, data} = cxt;
          const valid = gen.name('valid');
          gen.if(
            _`${data} instanceof Set`,
            () => gen.forOf('item', _`${data}.values()`, (item) => cxt.subschema({keyword: 'setOf', data: item}, valid)),
            () => cxt.error()
          );
        },
      });
      const validate = ajv.compile({setOf: {type: 'string'}});
      return (value: unknown) => validate(value) === true;
    },
  },
  // a thenable: an object whose `then` is a function
  'NATIVE.promise_string': {
    build: () => {
      const ajv = new Ajv();
      addTest(ajv, 'isThenable', (v) => _`typeof ${v} == "object" && ${v} !== null && typeof ${v}.then == "function"`);
      const validate = ajv.compile({isThenable: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addTest(ajv, 'isThenable', (v) => _`typeof ${v} == "object" && ${v} !== null && typeof ${v}.then == "function"`);
      const validate = ajv.compile({isThenable: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'NATIVE.awaited_promise': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string'});
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── CIRCULAR ──
  'CIRCULAR.object_full_mion_shape': {
    build: () => {
      const ajv = new Ajv();
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {n: {type: 'number'}, s: {type: 'string'}, c: {$ref: '#'}, d: {validDate: true}},
        required: ['n', 's'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {n: {type: 'number'}, s: {type: 'string'}, c: {$ref: '#'}, d: {validDate: true}},
        required: ['n', 's'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'CIRCULAR.array_of_union_with_self_ref': {
    build: () => {
      // allowUnionTypes: the schema has a `type` array (compile-time only, silences the strictTypes log)
      const ajv = new Ajv({allowUnionTypes: true});
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'array',
        items: {anyOf: [{$ref: '#'}, {validDate: true}, {type: ['number', 'string']}]},
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      // allowUnionTypes: the schema has a `type` array (compile-time only, silences the strictTypes log)
      const ajv = new Ajv({allowUnionTypes: true, allErrors: true});
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'array',
        items: {anyOf: [{$ref: '#'}, {validDate: true}, {type: ['number', 'string']}]},
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'CIRCULAR.object_with_tuple_prop': {
    build: () => {
      const ajv = new Ajv();
      addBigint(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {tuple: {type: 'array', items: [{bigint: true}, {$ref: '#'}], minItems: 1, maxItems: 2}},
        required: ['tuple'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addBigint(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {tuple: {type: 'array', items: [{bigint: true}, {$ref: '#'}], minItems: 1, maxItems: 2}},
        required: ['tuple'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'CIRCULAR.object_with_index_prop': {
    build: () => {
      const ajv = new Ajv();
      addPlainObject(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {index: {type: 'object', plainObject: true, additionalProperties: {$ref: '#'}}},
        required: ['index'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addPlainObject(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {index: {type: 'object', plainObject: true, additionalProperties: {$ref: '#'}}},
        required: ['index'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'CIRCULAR.object_deeply_nested': {
    build: () => {
      const ajv = new Ajv();
      addPlainObject(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {
          deep1: {
            type: 'object',
            properties: {
              deep2: {
                type: 'object',
                properties: {deep3: {type: 'object', plainObject: true, properties: {deep4: {$ref: '#'}}}},
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
      const ajv = new Ajv({allErrors: true});
      addPlainObject(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {
          deep1: {
            type: 'object',
            properties: {
              deep2: {
                type: 'object',
                properties: {deep3: {type: 'object', plainObject: true, properties: {deep4: {$ref: '#'}}}},
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
  }, // only the all-optional deep3 gets the plain-object guard, as mion
  'CIRCULAR.circular_child_under_literal_root': {
    build: () => {
      const ajv = new Ajv();
      addBigint(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {isRoot: {const: true}, ciChild: {$ref: '#/definitions/ICircularDeep'}},
        required: ['isRoot', 'ciChild'],
        definitions: {
          ICircularDeep: {
            type: 'object',
            properties: {
              name: {type: 'string'},
              big: {bigint: true},
              embedded: {
                type: 'object',
                properties: {hello: {type: 'string'}, child: {$ref: '#/definitions/ICircularDeep'}},
                required: ['hello'],
              },
            },
            required: ['name', 'big', 'embedded'],
          },
        },
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addBigint(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {isRoot: {const: true}, ciChild: {$ref: '#/definitions/ICircularDeep'}},
        required: ['isRoot', 'ciChild'],
        definitions: {
          ICircularDeep: {
            type: 'object',
            properties: {
              name: {type: 'string'},
              big: {bigint: true},
              embedded: {
                type: 'object',
                properties: {hello: {type: 'string'}, child: {$ref: '#/definitions/ICircularDeep'}},
                required: ['hello'],
              },
            },
            required: ['name', 'big', 'embedded'],
          },
        },
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'CIRCULAR.multiple_circular_types_cross_referenced': {
    build: () => {
      const ajv = new Ajv();
      addBigint(ajv);
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {
          isRoot: {const: true},
          ciChild: {$ref: '#/definitions/ICircularDeep'},
          ciRoort: {$ref: '#'},
          ciDate: {$ref: '#/definitions/ICircularDate'},
        },
        required: ['isRoot', 'ciChild', 'ciDate'],
        definitions: {
          ICircularDeep: {
            type: 'object',
            properties: {
              name: {type: 'string'},
              big: {bigint: true},
              embedded: {
                type: 'object',
                properties: {hello: {type: 'string'}, child: {$ref: '#/definitions/ICircularDeep'}},
                required: ['hello'],
              },
            },
            required: ['name', 'big', 'embedded'],
          },
          ICircularDate: {
            type: 'object',
            properties: {
              date: {validDate: true},
              month: {type: 'number'},
              year: {type: 'number'},
              embedded: {$ref: '#/definitions/ICircularDate'},
              deep: {$ref: '#/definitions/ICircularDeep'},
            },
            required: ['date', 'month', 'year'],
          },
        },
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addBigint(ajv);
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {
          isRoot: {const: true},
          ciChild: {$ref: '#/definitions/ICircularDeep'},
          ciRoort: {$ref: '#'},
          ciDate: {$ref: '#/definitions/ICircularDate'},
        },
        required: ['isRoot', 'ciChild', 'ciDate'],
        definitions: {
          ICircularDeep: {
            type: 'object',
            properties: {
              name: {type: 'string'},
              big: {bigint: true},
              embedded: {
                type: 'object',
                properties: {hello: {type: 'string'}, child: {$ref: '#/definitions/ICircularDeep'}},
                required: ['hello'],
              },
            },
            required: ['name', 'big', 'embedded'],
          },
          ICircularDate: {
            type: 'object',
            properties: {
              date: {validDate: true},
              month: {type: 'number'},
              year: {type: 'number'},
              embedded: {$ref: '#/definitions/ICircularDate'},
              deep: {$ref: '#/definitions/ICircularDeep'},
            },
            required: ['date', 'month', 'year'],
          },
        },
      });
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── CIRCULAR_REFS ── (cyclic VALUES: ajv has no cycle check, so a root `noCycle` hook gates the shape check)
  'CIRCULAR_REFS.linked_list_cycle': {
    build: () => {
      const ajv = new Ajv();
      // cycle walk along the recursive `next` path only (R6): on one path the visited set is the ancestor set
      addNoCycle(ajv, (value) => {
        const seen = new Set<object>();
        for (let n = value; typeof n === 'object' && n !== null; n = (n as {next?: unknown}).next) {
          if (seen.has(n)) return true;
          seen.add(n);
        }
        return false;
      });
      const validate = ajv.compile({
        if: {noCycle: true},
        then: {$ref: '#/definitions/Node'},
        else: false,
        definitions: {
          Node: {
            type: 'object',
            properties: {value: {type: 'number'}, next: {anyOf: [{$ref: '#/definitions/Node'}, {type: 'null'}]}},
            required: ['value', 'next'],
          },
        },
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // cycle walk along the recursive `next` path only (R6): on one path the visited set is the ancestor set
      addNoCycle(ajv, (value) => {
        const seen = new Set<object>();
        for (let n = value; typeof n === 'object' && n !== null; n = (n as {next?: unknown}).next) {
          if (seen.has(n)) return true;
          seen.add(n);
        }
        return false;
      });
      const validate = ajv.compile({
        if: {noCycle: true},
        then: {$ref: '#/definitions/Node'},
        else: false,
        definitions: {
          Node: {
            type: 'object',
            properties: {value: {type: 'number'}, next: {anyOf: [{$ref: '#/definitions/Node'}, {type: 'null'}]}},
            required: ['value', 'next'],
          },
        },
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'CIRCULAR_REFS.tree_cycle': {
    build: () => {
      const ajv = new Ajv();
      // cycle walk along `children[*]` only (R6): ancestor stack + finished set, like mion's walker
      const hasCycle = (node: unknown, stack: object[], done: Set<object>): boolean => {
        if (typeof node !== 'object' || node === null || done.has(node)) return false;
        if (stack.includes(node)) return true;
        const children = (node as {children?: unknown}).children;
        if (Array.isArray(children)) {
          stack.push(node);
          for (let i = 0; i < children.length; i++) if (hasCycle(children[i], stack, done)) return true;
          stack.pop();
        }
        done.add(node);
        return false;
      };
      addNoCycle(ajv, (value) => hasCycle(value, [], new Set()));
      const validate = ajv.compile({
        if: {noCycle: true},
        then: {$ref: '#/definitions/Node'},
        else: false,
        definitions: {
          Node: {
            type: 'object',
            properties: {label: {type: 'string'}, children: {type: 'array', items: {$ref: '#/definitions/Node'}}},
            required: ['label', 'children'],
          },
        },
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // cycle walk along `children[*]` only (R6): ancestor stack + finished set, like mion's walker
      const hasCycle = (node: unknown, stack: object[], done: Set<object>): boolean => {
        if (typeof node !== 'object' || node === null || done.has(node)) return false;
        if (stack.includes(node)) return true;
        const children = (node as {children?: unknown}).children;
        if (Array.isArray(children)) {
          stack.push(node);
          for (let i = 0; i < children.length; i++) if (hasCycle(children[i], stack, done)) return true;
          stack.pop();
        }
        done.add(node);
        return false;
      };
      addNoCycle(ajv, (value) => hasCycle(value, [], new Set()));
      const validate = ajv.compile({
        if: {noCycle: true},
        then: {$ref: '#/definitions/Node'},
        else: false,
        definitions: {
          Node: {
            type: 'object',
            properties: {label: {type: 'string'}, children: {type: 'array', items: {$ref: '#/definitions/Node'}}},
            required: ['label', 'children'],
          },
        },
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'CIRCULAR_REFS.object_self_cycle': {
    build: () => {
      const ajv = new Ajv();
      // cycle walk along the recursive `next` path only (R6): on one path the visited set is the ancestor set
      addNoCycle(ajv, (value) => {
        const seen = new Set<object>();
        for (let n = value; typeof n === 'object' && n !== null; n = (n as {next?: unknown}).next) {
          if (seen.has(n)) return true;
          seen.add(n);
        }
        return false;
      });
      const validate = ajv.compile({
        if: {noCycle: true},
        then: {$ref: '#/definitions/Node'},
        else: false,
        definitions: {
          Node: {
            type: 'object',
            properties: {name: {type: 'string'}, next: {$ref: '#/definitions/Node'}},
            required: ['name'],
          },
        },
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // cycle walk along the recursive `next` path only (R6): on one path the visited set is the ancestor set
      addNoCycle(ajv, (value) => {
        const seen = new Set<object>();
        for (let n = value; typeof n === 'object' && n !== null; n = (n as {next?: unknown}).next) {
          if (seen.has(n)) return true;
          seen.add(n);
        }
        return false;
      });
      const validate = ajv.compile({
        if: {noCycle: true},
        then: {$ref: '#/definitions/Node'},
        else: false,
        definitions: {
          Node: {
            type: 'object',
            properties: {name: {type: 'string'}, next: {$ref: '#/definitions/Node'}},
            required: ['name'],
          },
        },
      });
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── UTILITY ──
  'UTILITY.partial': {
    build: () => {
      const ajv = new Ajv();
      addPlainObject(ajv);
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        plainObject: true,
        properties: {name: {type: 'string'}, age: {type: 'number'}, createdAt: {validDate: true}},
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addPlainObject(ajv);
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        plainObject: true,
        properties: {name: {type: 'string'}, age: {type: 'number'}, createdAt: {validDate: true}},
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.required': {
    build: () => {
      const ajv = new Ajv();
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {name: {type: 'string'}, age: {type: 'number'}, createdAt: {validDate: true}},
        required: ['name', 'age', 'createdAt'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {name: {type: 'string'}, age: {type: 'number'}, createdAt: {validDate: true}},
        required: ['name', 'age', 'createdAt'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.pick': {
    build: () => {
      const ajv = new Ajv();
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {name: {type: 'string'}, createdAt: {validDate: true}},
        required: ['name', 'createdAt'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {name: {type: 'string'}, createdAt: {validDate: true}},
        required: ['name', 'createdAt'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.omit': {
    build: () => {
      const ajv = new Ajv();
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {name: {type: 'string'}, createdAt: {validDate: true}},
        required: ['name', 'createdAt'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {name: {type: 'string'}, createdAt: {validDate: true}},
        required: ['name', 'createdAt'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.exclude_atomic': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({enum: ['name', 'createdAt']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({enum: ['name', 'createdAt']});
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.extract_atomic': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({enum: ['name', 'createdAt']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({enum: ['name', 'createdAt']});
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.exclude_from_object_union': {
    build: () => {
      // discriminator: enables ajv's tag switch for a discriminated union (only the matching arm runs)
      const ajv = new Ajv({discriminator: true});
      const validate = ajv.compile({
        type: 'object',
        discriminator: {propertyName: 'kind'},
        oneOf: [
          {properties: {kind: {const: 'square'}, x: {type: 'number'}}, required: ['kind', 'x']},
          {
            properties: {kind: {const: 'triangle'}, base: {type: 'number'}, height: {type: 'number'}},
            required: ['kind', 'base', 'height'],
          },
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      // discriminator: enables ajv's tag switch for a discriminated union (only the matching arm runs)
      const ajv = new Ajv({discriminator: true, allErrors: true});
      const validate = ajv.compile({
        type: 'object',
        discriminator: {propertyName: 'kind'},
        oneOf: [
          {properties: {kind: {const: 'square'}, x: {type: 'number'}}, required: ['kind', 'x']},
          {
            properties: {kind: {const: 'triangle'}, base: {type: 'number'}, height: {type: 'number'}},
            required: ['kind', 'base', 'height'],
          },
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.non_nullable': {
    build: () => {
      // allowUnionTypes: the schema has a `type` array (compile-time only, silences the strictTypes log)
      const ajv = new Ajv({allowUnionTypes: true});
      const validate = ajv.compile({type: ['string', 'number']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      // allowUnionTypes: the schema has a `type` array (compile-time only, silences the strictTypes log)
      const ajv = new Ajv({allowUnionTypes: true, allErrors: true});
      const validate = ajv.compile({type: ['string', 'number']});
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.return_type': {
    build: () => {
      const ajv = new Ajv();
      addValidDate(ajv);
      const validate = ajv.compile({validDate: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addValidDate(ajv);
      const validate = ajv.compile({validDate: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.readonly': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'object',
        properties: {name: {type: 'string'}, age: {type: 'number'}},
        required: ['name', 'age'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'object',
        properties: {name: {type: 'string'}, age: {type: 'number'}},
        required: ['name', 'age'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.intersection_with_required_override': {
    build: () => {
      const ajv = new Ajv();
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {name: {type: 'string'}, age: {type: 'number'}, createdAt: {validDate: true}},
        required: ['name'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {name: {type: 'string'}, age: {type: 'number'}, createdAt: {validDate: true}},
        required: ['name'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.omit_keeping_optional': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'object', properties: {b: {type: 'number'}, c: {type: 'boolean'}}, required: ['c']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'object', properties: {b: {type: 'number'}, c: {type: 'boolean'}}, required: ['c']});
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.keyof_to_literal_union': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({enum: ['name', 'age', 'createdAt']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({enum: ['name', 'age', 'createdAt']});
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.typeof_variable_query': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'object',
        properties: {url: {type: 'string'}, port: {type: 'number'}},
        required: ['url', 'port'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.conditional_type_resolved': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'boolean'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'boolean'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.mapped_type_custom': {
    build: () => {
      const ajv = new Ajv();
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
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
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
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {w: {type: 'string'}}, required: ['w']},
          {type: 'object', properties: {w: {type: 'number'}}, required: ['w']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        anyOf: [
          {type: 'object', properties: {w: {type: 'string'}}, required: ['w']},
          {type: 'object', properties: {w: {type: 'number'}}, required: ['w']},
        ],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'UTILITY.deep_partial_recursive_mapped': {
    build: () => {
      const ajv = new Ajv();
      addPlainObject(ajv);
      const validate = ajv.compile({
        type: 'object',
        plainObject: true,
        properties: {
          display: {
            type: 'object',
            plainObject: true,
            properties: {theme: {enum: ['light', 'dark']}, brightness: {type: 'number'}},
          },
          audio: {type: 'object', plainObject: true, properties: {volume: {type: 'number'}, muted: {type: 'boolean'}}},
        },
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addPlainObject(ajv);
      const validate = ajv.compile({
        type: 'object',
        plainObject: true,
        properties: {
          display: {
            type: 'object',
            plainObject: true,
            properties: {theme: {enum: ['light', 'dark']}, brightness: {type: 'number'}},
          },
          audio: {type: 'object', plainObject: true, properties: {volume: {type: 'number'}, muted: {type: 'boolean'}}},
        },
      });
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── TYPE_MAPPINGS ──
  'TYPE_MAPPINGS.key_prefix_rename': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'object',
        properties: {user_id: {type: 'number'}, user_name: {type: 'string'}},
        required: ['user_id', 'user_name'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'object',
        properties: {user_id: {type: 'number'}, user_name: {type: 'string'}},
        required: ['user_id', 'user_name'],
      });
      return (value: unknown) => validate(value) === true;
    },
  }, // mapped type resolves to concrete {user_id:number;user_name:string} — plain properties+required
  'TYPE_MAPPINGS.key_conditional_rename': {
    build: () => {
      const ajv = new Ajv();
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {_id: {type: 'number'}, name: {type: 'string'}, createdAt: {validDate: true}},
        required: ['_id', 'name', 'createdAt'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addValidDate(ajv);
      const validate = ajv.compile({
        type: 'object',
        properties: {_id: {type: 'number'}, name: {type: 'string'}, createdAt: {validDate: true}},
        required: ['_id', 'name', 'createdAt'],
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'TYPE_MAPPINGS.key_filter_via_never': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'object',
        properties: {id: {type: 'number'}, name: {type: 'string'}},
        required: ['id', 'name'],
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'object',
        properties: {id: {type: 'number'}, name: {type: 'string'}},
        required: ['id', 'name'],
      });
      return (value: unknown) => validate(value) === true;
    },
  }, // `secret`→never drops it; resolves to concrete {id:number;name:string}. extra `secret` prop passes structurally (additionalProperties default allows it)

  // ── DATETIME ──
  'DATETIME.date': {
    build: () => {
      const ajv = new Ajv();
      addValidDate(ajv);
      const validate = ajv.compile({validDate: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addValidDate(ajv);
      const validate = ajv.compile({validDate: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.instant': {
    build: () => {
      const ajv = new Ajv();
      addTemporal(ajv, Temporal.Instant);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addTemporal(ajv, Temporal.Instant);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.zonedDateTime': {
    build: () => {
      const ajv = new Ajv();
      addTemporal(ajv, Temporal.ZonedDateTime);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addTemporal(ajv, Temporal.ZonedDateTime);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainDate': {
    build: () => {
      const ajv = new Ajv();
      addTemporal(ajv, Temporal.PlainDate);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addTemporal(ajv, Temporal.PlainDate);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainTime': {
    build: () => {
      const ajv = new Ajv();
      addTemporal(ajv, Temporal.PlainTime);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addTemporal(ajv, Temporal.PlainTime);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainDateTime': {
    build: () => {
      const ajv = new Ajv();
      addTemporal(ajv, Temporal.PlainDateTime);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addTemporal(ajv, Temporal.PlainDateTime);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainYearMonth': {
    build: () => {
      const ajv = new Ajv();
      addTemporal(ajv, Temporal.PlainYearMonth);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addTemporal(ajv, Temporal.PlainYearMonth);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainMonthDay': {
    build: () => {
      const ajv = new Ajv();
      addTemporal(ajv, Temporal.PlainMonthDay);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addTemporal(ajv, Temporal.PlainMonthDay);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.duration': {
    build: () => {
      const ajv = new Ajv();
      addTemporal(ajv, Temporal.Duration);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addTemporal(ajv, Temporal.Duration);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── STRING_FORMAT ──
  'STRING_FORMAT.string_maxLength': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string', maxLength: 5});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string', maxLength: 5});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_minLength': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string', minLength: 3});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string', minLength: 3});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_length': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string', minLength: 4, maxLength: 4});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string', minLength: 4, maxLength: 4});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_range': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string', minLength: 2, maxLength: 4});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string', minLength: 2, maxLength: 4});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_allowedChars': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string', pattern: '^[0-9a-f]+$'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string', pattern: '^[0-9a-f]+$'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_allowedChars_ignoreCase': {
    build: () => {
      const ajv = new Ajv();
      // mion's exact regex: a RegExp format keeps its flags
      ajv.addFormat('allowed-chars-i', /^[abc]+$/i);
      const validate = ajv.compile({type: 'string', format: 'allowed-chars-i'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // mion's exact regex: a RegExp format keeps its flags
      ajv.addFormat('allowed-chars-i', /^[abc]+$/i);
      const validate = ajv.compile({type: 'string', format: 'allowed-chars-i'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_allowedChars_literal': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string', pattern: '^[.\\-]+$'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string', pattern: '^[.\\-]+$'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_disallowedChars': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string', pattern: '^[^!@#]*$'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string', pattern: '^[^!@#]*$'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_allowedValues': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string', enum: ['red', 'green', 'blue']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string', enum: ['red', 'green', 'blue']});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_allowedValues_ignoreCase': {
    build: () => {
      const ajv = new Ajv();
      // mion's exact regex: a RegExp format keeps its flags
      ajv.addFormat('allowed-values-i', /^(?:red|green)$/i);
      const validate = ajv.compile({type: 'string', format: 'allowed-values-i'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // mion's exact regex: a RegExp format keeps its flags
      ajv.addFormat('allowed-values-i', /^(?:red|green)$/i);
      const validate = ajv.compile({type: 'string', format: 'allowed-values-i'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_allowedValues_escaped': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string', enum: ['a.b', 'c+d']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string', enum: ['a.b', 'c+d']});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_disallowedValues': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string', not: {enum: ['admin', 'root']}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string', not: {enum: ['admin', 'root']}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.string_customErrorMessage': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string', enum: ['a', 'b']});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string', enum: ['a', 'b']});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.alpha': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string', pattern: '^[\\p{L}]+$'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string', pattern: '^[\\p{L}]+$'});
      return (value: unknown) => validate(value) === true;
    },
  }, // `pattern` gets the `u` flag from ajv, so the Unicode class works as in mion
  'STRING_FORMAT.alphaNumeric': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string', pattern: '^[\\p{L}\\p{N}]+$'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string', pattern: '^[\\p{L}\\p{N}]+$'});
      return (value: unknown) => validate(value) === true;
    },
  }, // `pattern` gets the `u` flag from ajv, so the Unicode class works as in mion
  'STRING_FORMAT.numeric': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string', pattern: '^[\\p{N}]+$'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string', pattern: '^[\\p{N}]+$'});
      return (value: unknown) => validate(value) === true;
    },
  }, // `pattern` gets the `u` flag from ajv, so the Unicode class works as in mion
  'STRING_FORMAT.alpha_withLength': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string', maxLength: 3, pattern: '^[\\p{L}]+$'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string', maxLength: 3, pattern: '^[\\p{L}]+$'});
      return (value: unknown) => validate(value) === true;
    },
  }, // `pattern` gets the `u` flag from ajv, so the Unicode class works as in mion
  'STRING_FORMAT.lowercase_validate': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.uuidv4': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'string',
        pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.uuidv7': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'string',
        pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.date_iso': {
    build: () => {
      const ajv = new Ajv();
      addFormats(ajv, {mode: 'full'}); // full: calendar-aware date, like mion (R9)
      const validate = ajv.compile({type: 'string', format: 'date'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addFormats(ajv, {mode: 'full'}); // full: calendar-aware date, like mion (R9)
      const validate = ajv.compile({type: 'string', format: 'date'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.date_DMY': {
    build: () => {
      const ajv = new Ajv();
      const DMY = /^(\d\d)-(\d\d)-(\d\d\d\d)$/;
      // leaf format hook: DD-MM-YYYY with the Gregorian calendar check
      ajv.addFormat('date-dmy', (s: string) => {
        const m = DMY.exec(s);
        return m !== null && isCalendarDate(+m[3], +m[2], +m[1]);
      });
      const validate = ajv.compile({type: 'string', format: 'date-dmy'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const DMY = /^(\d\d)-(\d\d)-(\d\d\d\d)$/;
      // leaf format hook: DD-MM-YYYY with the Gregorian calendar check
      ajv.addFormat('date-dmy', (s: string) => {
        const m = DMY.exec(s);
        return m !== null && isCalendarDate(+m[3], +m[2], +m[1]);
      });
      const validate = ajv.compile({type: 'string', format: 'date-dmy'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.date_YM': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'string',
        pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.date_MD': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'string',
        pattern: '^(?:(?:0[1-9]|1[0-2])-(?:0[1-9]|1\\d|2\\d)|(?:0[13-9]|1[0-2])-30|(?:0[13578]|1[02])-31)$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^(?:(?:0[1-9]|1[0-2])-(?:0[1-9]|1\\d|2\\d)|(?:0[13-9]|1[0-2])-30|(?:0[13578]|1[02])-31)$',
      });
      return (value: unknown) => validate(value) === true;
    },
  }, // per-month day limits, Feb 29 always allowed (no year), as mion
  'STRING_FORMAT.date_minMax_absolute': {
    build: () => {
      const ajv = new Ajv();
      addFormats(ajv, {mode: 'full', keywords: true}); // full: calendar `date` (R9); keywords: formatMinimum/formatMaximum
      const validate = ajv.compile({type: 'string', format: 'date', formatMinimum: '2020-01-01', formatMaximum: '2020-12-31'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addFormats(ajv, {mode: 'full', keywords: true}); // full: calendar `date` (R9); keywords: formatMinimum/formatMaximum
      const validate = ajv.compile({type: 'string', format: 'date', formatMinimum: '2020-01-01', formatMaximum: '2020-12-31'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.time_iso': {
    build: () => {
      const ajv = new Ajv();
      addFormats(ajv, {mode: 'full'}); // full: RFC 3339 time, tz required, leap second only at 23:59 UTC, like mion (R9)
      const validate = ajv.compile({type: 'string', format: 'time'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addFormats(ajv, {mode: 'full'}); // full: RFC 3339 time, tz required, leap second only at 23:59 UTC, like mion (R9)
      const validate = ajv.compile({type: 'string', format: 'time'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.time_HHmmss': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'string',
        pattern: '^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'string',
        pattern: '^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.time_HHmmss_ms': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string', pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d{3})?$'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string', pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d{3})?$'});
      return (value: unknown) => validate(value) === true;
    },
  }, // fraction is exactly 3 digits when present, as mion
  'STRING_FORMAT.time_minMax_absolute': {
    build: () => {
      const ajv = new Ajv();
      // leaf format with compare: HH:mm is fixed width, so a string compare orders it
      ajv.addFormat('time-hhmm', {
        validate: /^(?:[01]\d|2[0-3]):[0-5]\d$/,
        compare: (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0),
      });
      addFormats(ajv, {formats: [], keywords: true}); // only the formatMinimum/formatMaximum keywords
      const validate = ajv.compile({type: 'string', format: 'time-hhmm', formatMinimum: '09:00', formatMaximum: '17:00'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // leaf format with compare: HH:mm is fixed width, so a string compare orders it
      ajv.addFormat('time-hhmm', {
        validate: /^(?:[01]\d|2[0-3]):[0-5]\d$/,
        compare: (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0),
      });
      addFormats(ajv, {formats: [], keywords: true}); // only the formatMinimum/formatMaximum keywords
      const validate = ajv.compile({type: 'string', format: 'time-hhmm', formatMinimum: '09:00', formatMaximum: '17:00'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.dateTime_default': {
    build: () => {
      const ajv = new Ajv();
      addFormats(ajv, {mode: 'full'}); // full: calendar date + RFC 3339 time (R9)
      const validate = ajv.compile({type: 'string', format: 'date-time', pattern: '[Tt]'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addFormats(ajv, {mode: 'full'}); // full: calendar date + RFC 3339 time (R9)
      const validate = ajv.compile({type: 'string', format: 'date-time', pattern: '[Tt]'});
      return (value: unknown) => validate(value) === true;
    },
  }, // `[Tt]`: mion splits at T or t only; ajv-formats also takes a space
  'STRING_FORMAT.dateTime_custom': {
    build: () => {
      const ajv = new Ajv();
      const DMY_HM = /^(\d\d)-(\d\d)-(\d\d\d\d) (?:[01]\d|2[0-3]):[0-5]\d$/;
      // leaf format hook: DD-MM-YYYY (Gregorian calendar check) + ' ' + HH:mm
      ajv.addFormat('datetime-dmy-hhmm', (s: string) => {
        const m = DMY_HM.exec(s);
        return m !== null && isCalendarDate(+m[3], +m[2], +m[1]);
      });
      const validate = ajv.compile({type: 'string', format: 'datetime-dmy-hhmm'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const DMY_HM = /^(\d\d)-(\d\d)-(\d\d\d\d) (?:[01]\d|2[0-3]):[0-5]\d$/;
      // leaf format hook: DD-MM-YYYY (Gregorian calendar check) + ' ' + HH:mm
      ajv.addFormat('datetime-dmy-hhmm', (s: string) => {
        const m = DMY_HM.exec(s);
        return m !== null && isCalendarDate(+m[3], +m[2], +m[1]);
      });
      const validate = ajv.compile({type: 'string', format: 'datetime-dmy-hhmm'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.dateTime_minMax_absolute': {
    build: () => {
      const ajv = new Ajv();
      const DT = /^(\d\d\d\d)-(\d\d)-(\d\d)[Tt](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
      // leaf format with compare: YYYY-MM-DD (Gregorian calendar check) [Tt] HH:mm:ss, no tz
      ajv.addFormat('datetime-ymd-hms', {
        validate: (s: string) => {
          const m = DT.exec(s);
          return m !== null && isCalendarDate(+m[1], +m[2], +m[3]);
        },
        // fixed width: compare the date and time halves as strings, skipping the T/t at index 10
        compare: (a: string, b: string) => {
          const da = a.slice(0, 10);
          const db = b.slice(0, 10);
          if (da !== db) return da < db ? -1 : 1;
          const ta = a.slice(11);
          const tb = b.slice(11);
          return ta < tb ? -1 : ta > tb ? 1 : 0;
        },
      });
      addFormats(ajv, {formats: [], keywords: true}); // only the formatMinimum/formatMaximum keywords
      const validate = ajv.compile({
        type: 'string',
        format: 'datetime-ymd-hms',
        formatMinimum: '2020-01-01T00:00:00',
        formatMaximum: '2020-12-31T23:59:59',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const DT = /^(\d\d\d\d)-(\d\d)-(\d\d)[Tt](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
      // leaf format with compare: YYYY-MM-DD (Gregorian calendar check) [Tt] HH:mm:ss, no tz
      ajv.addFormat('datetime-ymd-hms', {
        validate: (s: string) => {
          const m = DT.exec(s);
          return m !== null && isCalendarDate(+m[1], +m[2], +m[3]);
        },
        // fixed width: compare the date and time halves as strings, skipping the T/t at index 10
        compare: (a: string, b: string) => {
          const da = a.slice(0, 10);
          const db = b.slice(0, 10);
          if (da !== db) return da < db ? -1 : 1;
          const ta = a.slice(11);
          const tb = b.slice(11);
          return ta < tb ? -1 : ta > tb ? 1 : 0;
        },
      });
      addFormats(ajv, {formats: [], keywords: true}); // only the formatMinimum/formatMaximum keywords
      const validate = ajv.compile({
        type: 'string',
        format: 'datetime-ymd-hms',
        formatMinimum: '2020-01-01T00:00:00',
        formatMaximum: '2020-12-31T23:59:59',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.ipv4': {
    build: () => {
      const ajv = new Ajv();
      addFormats(ajv, {formats: ['ipv4']}); // the library's own ipv4 rule (same regex in fast and full mode)
      const validate = ajv.compile({type: 'string', format: 'ipv4'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addFormats(ajv, {formats: ['ipv4']}); // the library's own ipv4 rule (same regex in fast and full mode)
      const validate = ajv.compile({type: 'string', format: 'ipv4'});
      return (value: unknown) => validate(value) === true;
    },
  }, // ajv-formats
  'STRING_FORMAT.ipv6': {
    build: () => {
      const ajv = new Ajv();
      addFormats(ajv, {formats: ['ipv6']}); // the library's own ipv6 rule (same regex in fast and full mode)
      const validate = ajv.compile({type: 'string', format: 'ipv6'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addFormats(ajv, {formats: ['ipv6']}); // the library's own ipv6 rule (same regex in fast and full mode)
      const validate = ajv.compile({type: 'string', format: 'ipv6'});
      return (value: unknown) => validate(value) === true;
    },
  }, // ajv-formats
  'STRING_FORMAT.ip_any': {
    build: () => {
      const ajv = new Ajv();
      addFormats(ajv, {formats: ['ipv4', 'ipv6']}); // the library's own ipv4 / ipv6 rules (same in fast and full mode)
      const validate = ajv.compile({type: 'string', anyOf: [{format: 'ipv4'}, {format: 'ipv6'}]});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addFormats(ajv, {formats: ['ipv4', 'ipv6']}); // the library's own ipv4 / ipv6 rules (same in fast and full mode)
      const validate = ajv.compile({type: 'string', anyOf: [{format: 'ipv4'}, {format: 'ipv6'}]});
      return (value: unknown) => validate(value) === true;
    },
  },
  // ajv-formats' IPv4 octet rule (as the ipv4 entry) + a port of 1-5 digits <= 65535, leading zeros allowed like mion.
  // Port required (stricter than mion, which accepts a missing port).
  'STRING_FORMAT.ipv4_port': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'string',
        pattern:
          '^(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d):(?:\\d{1,4}|[0-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'string',
        pattern:
          '^(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d):(?:\\d{1,4}|[0-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$',
      });
      return (value: unknown) => validate(value) === true;
    },
  }, // port required; 1-5 digits <= 65535, like mion
  'STRING_FORMAT.ipv6_port': {
    build: () => {
      const ajv = new Ajv();
      const IPV6 = addFormats.get('ipv6') as RegExp; // the library's own ipv6 rule
      const BRACKETED = /^\[([^\]]+)\]:(\d+)$/;
      // leaf format hook: mion's bracket + port split (port required, <= 65535), ajv-formats ipv6 inside
      ajv.addFormat('ipv6-port', (s: string) => {
        const m = BRACKETED.exec(s);
        return m !== null && IPV6.test(m[1]) && Number(m[2]) <= 65535;
      });
      const validate = ajv.compile({type: 'string', format: 'ipv6-port'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const IPV6 = addFormats.get('ipv6') as RegExp; // the library's own ipv6 rule
      const BRACKETED = /^\[([^\]]+)\]:(\d+)$/;
      // leaf format hook: mion's bracket + port split (port required, <= 65535), ajv-formats ipv6 inside
      ajv.addFormat('ipv6-port', (s: string) => {
        const m = BRACKETED.exec(s);
        return m !== null && IPV6.test(m[1]) && Number(m[2]) <= 65535;
      });
      const validate = ajv.compile({type: 'string', format: 'ipv6-port'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.domain': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'string',
        maxLength: 253,
        minLength: 5,
        pattern: '^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,63}$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'string',
        maxLength: 253,
        minLength: 5,
        pattern: '^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,63}$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.domainParts': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'string',
        maxLength: 253,
        minLength: 5,
        pattern: '^(?:[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\\.){1,5}[a-zA-Z]{2,12}$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'string',
        maxLength: 253,
        minLength: 5,
        pattern: '^(?:[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\\.){1,5}[a-zA-Z]{2,12}$',
      });
      return (value: unknown) => validate(value) === true;
    },
  }, // labels 2..63 with no edge hyphen, 2..6 parts, TLD 2..12 letters, as mion
  'STRING_FORMAT.email': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'string',
        maxLength: 254,
        minLength: 7,
        pattern: '^[^\\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\\.)+[a-zA-Z]{2,63}$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'string',
        maxLength: 254,
        minLength: 7,
        pattern: '^[^\\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\\.)+[a-zA-Z]{2,63}$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.emailPunycode': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'string',
        maxLength: 254,
        minLength: 7,
        pattern: '^[^\\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\\.)+[a-zA-Z0-9-]{2,63}$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'string',
        maxLength: 254,
        minLength: 7,
        pattern: '^[^\\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\\.)+[a-zA-Z0-9-]{2,63}$',
      });
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.emailParts': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'string',
        maxLength: 254,
        pattern:
          '^[^ ()<>\\[\\]:;\\\\,{}|+@]{1,64}@(?=.{5,253}$)(?:[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\\.){1,5}[a-zA-Z]{2,12}$',
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({
        type: 'string',
        maxLength: 254,
        pattern:
          '^[^ ()<>\\[\\]:;\\\\,{}|+@]{1,64}@(?=.{5,253}$)(?:[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\\.){1,5}[a-zA-Z]{2,12}$',
      });
      return (value: unknown) => validate(value) === true;
    },
  }, // local part 1..64 without the forbidden chars, then the domainParts rules, as mion
  'STRING_FORMAT.url': {
    build: () => {
      const ajv = new Ajv();
      // mion's exact regex: a RegExp format keeps its flags
      ajv.addFormat('url-any', /^(?:https?|ftps?|wss?):\/\/[^\s/$.?#-][^\s]*$/i);
      const validate = ajv.compile({type: 'string', maxLength: 2048, format: 'url-any'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // mion's exact regex: a RegExp format keeps its flags
      ajv.addFormat('url-any', /^(?:https?|ftps?|wss?):\/\/[^\s/$.?#-][^\s]*$/i);
      const validate = ajv.compile({type: 'string', maxLength: 2048, format: 'url-any'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.urlHttp': {
    build: () => {
      const ajv = new Ajv();
      // mion's exact regex: a RegExp format keeps its flags
      ajv.addFormat('url-http', /^https?:\/\/[^\s/$.?#-][^\s]*$/i);
      const validate = ajv.compile({type: 'string', maxLength: 2048, format: 'url-http'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // mion's exact regex: a RegExp format keeps its flags
      ajv.addFormat('url-http', /^https?:\/\/[^\s/$.?#-][^\s]*$/i);
      const validate = ajv.compile({type: 'string', maxLength: 2048, format: 'url-http'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.urlFile': {
    build: () => {
      const ajv = new Ajv();
      // mion's exact regex: a RegExp format keeps its flags
      ajv.addFormat('url-file', /^file:\/\/\/?(?:[a-zA-Z]:)?[^\s/$.?#-][^\s]*$/i);
      const validate = ajv.compile({type: 'string', maxLength: 2048, format: 'url-file'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // mion's exact regex: a RegExp format keeps its flags
      ajv.addFormat('url-file', /^file:\/\/\/?(?:[a-zA-Z]:)?[^\s/$.?#-][^\s]*$/i);
      const validate = ajv.compile({type: 'string', maxLength: 2048, format: 'url-file'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.pattern_slug': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string', pattern: '^[a-z0-9-]+$'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string', pattern: '^[a-z0-9-]+$'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'STRING_FORMAT.pattern_hex': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'string', pattern: '^[0-9a-fA-F]+$'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'string', pattern: '^[0-9a-fA-F]+$'});
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── NUMBER_FORMAT ──
  'NUMBER_FORMAT.number_max': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'number', maximum: 100});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'number', maximum: 100});
      return (value: unknown) => validate(value) === true;
    },
  },
  'NUMBER_FORMAT.number_min': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'number', minimum: 0});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'number', minimum: 0});
      return (value: unknown) => validate(value) === true;
    },
  },
  'NUMBER_FORMAT.number_lt': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'number', exclusiveMaximum: 10});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'number', exclusiveMaximum: 10});
      return (value: unknown) => validate(value) === true;
    },
  },
  'NUMBER_FORMAT.number_gt': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'number', exclusiveMinimum: 0});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'number', exclusiveMinimum: 0});
      return (value: unknown) => validate(value) === true;
    },
  },
  'NUMBER_FORMAT.number_integer': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'integer'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'integer'});
      return (value: unknown) => validate(value) === true;
    },
  },
  // FormatFloat carries no failable constraint, so the equivalent document is a
  // plain `{type: 'number'}`: whole values are legal floats.
  'NUMBER_FORMAT.number_float': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'number'});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'number'});
      return (value: unknown) => validate(value) === true;
    },
  },
  'NUMBER_FORMAT.number_multipleOf': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'number', multipleOf: 5});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'number', multipleOf: 5});
      return (value: unknown) => validate(value) === true;
    },
  },
  'NUMBER_FORMAT.number_combined': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'integer', minimum: 0, maximum: 100, multipleOf: 5});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'integer', minimum: 0, maximum: 100, multipleOf: 5});
      return (value: unknown) => validate(value) === true;
    },
  },
  'NUMBER_FORMAT.number_int8': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'integer', minimum: -128, maximum: 127});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'integer', minimum: -128, maximum: 127});
      return (value: unknown) => validate(value) === true;
    },
  },
  'NUMBER_FORMAT.number_uint8': {
    build: () => {
      const ajv = new Ajv();
      const validate = ajv.compile({type: 'integer', minimum: 0, maximum: 255});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      const validate = ajv.compile({type: 'integer', minimum: 0, maximum: 255});
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── BIGINT_FORMAT ──
  'BIGINT_FORMAT.bigint_max': {
    build: () => {
      const ajv = new Ajv();
      addBigint(ajv);
      const validate = ajv.compile({bigint: {max: '100'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addBigint(ajv);
      const validate = ajv.compile({bigint: {max: '100'}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'BIGINT_FORMAT.bigint_min': {
    build: () => {
      const ajv = new Ajv();
      addBigint(ajv);
      const validate = ajv.compile({bigint: {min: '0'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addBigint(ajv);
      const validate = ajv.compile({bigint: {min: '0'}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'BIGINT_FORMAT.bigint_lt': {
    build: () => {
      const ajv = new Ajv();
      addBigint(ajv);
      const validate = ajv.compile({bigint: {lt: '10'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addBigint(ajv);
      const validate = ajv.compile({bigint: {lt: '10'}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'BIGINT_FORMAT.bigint_gt': {
    build: () => {
      const ajv = new Ajv();
      addBigint(ajv);
      const validate = ajv.compile({bigint: {gt: '0'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addBigint(ajv);
      const validate = ajv.compile({bigint: {gt: '0'}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'BIGINT_FORMAT.bigint_multipleOf': {
    build: () => {
      const ajv = new Ajv();
      addBigint(ajv);
      const validate = ajv.compile({bigint: {multipleOf: '5'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addBigint(ajv);
      const validate = ajv.compile({bigint: {multipleOf: '5'}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'BIGINT_FORMAT.bigint_combined': {
    build: () => {
      const ajv = new Ajv();
      addBigint(ajv);
      const validate = ajv.compile({bigint: {max: '1000', min: '0', multipleOf: '10'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addBigint(ajv);
      const validate = ajv.compile({bigint: {max: '1000', min: '0', multipleOf: '10'}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'BIGINT_FORMAT.bigint_int64': {
    build: () => {
      const ajv = new Ajv();
      addBigint(ajv);
      const validate = ajv.compile({bigint: {max: '9223372036854775807', min: '-9223372036854775808'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addBigint(ajv);
      const validate = ajv.compile({bigint: {max: '9223372036854775807', min: '-9223372036854775808'}});
      return (value: unknown) => validate(value) === true;
    },
  },
  'BIGINT_FORMAT.bigint_uint64': {
    build: () => {
      const ajv = new Ajv();
      addBigint(ajv);
      const validate = ajv.compile({bigint: {max: '18446744073709551615', min: '0'}});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      addBigint(ajv);
      const validate = ajv.compile({bigint: {max: '18446744073709551615', min: '0'}});
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── DATETIME ──
  'DATETIME.date_minmax': {
    build: () => {
      const ajv = new Ajv();
      // naive bound strings are read as UTC, like mion
      addValidDate(ajv, [['>=', Date.UTC(2020, 0, 1, 0, 0, 0)], ['<=', Date.UTC(2020, 11, 31, 23, 59, 59)]]);
      const validate = ajv.compile({validDate: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // naive bound strings are read as UTC, like mion
      addValidDate(ajv, [['>=', Date.UTC(2020, 0, 1, 0, 0, 0)], ['<=', Date.UTC(2020, 11, 31, 23, 59, 59)]]);
      const validate = ajv.compile({validDate: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.date_gtlt': {
    build: () => {
      const ajv = new Ajv();
      // naive bound strings are read as UTC, like mion
      addValidDate(ajv, [['>', Date.UTC(2020, 0, 1, 0, 0, 0)], ['<', Date.UTC(2020, 11, 31, 23, 59, 59)]]);
      const validate = ajv.compile({validDate: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // naive bound strings are read as UTC, like mion
      addValidDate(ajv, [['>', Date.UTC(2020, 0, 1, 0, 0, 0)], ['<', Date.UTC(2020, 11, 31, 23, 59, 59)]]);
      const validate = ajv.compile({validDate: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.date_min_lt': {
    build: () => {
      const ajv = new Ajv();
      // naive bound strings are read as UTC, like mion
      addValidDate(ajv, [['>=', Date.UTC(2020, 0, 1, 0, 0, 0)], ['<', Date.UTC(2020, 11, 31, 23, 59, 59)]]);
      const validate = ajv.compile({validDate: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // naive bound strings are read as UTC, like mion
      addValidDate(ajv, [['>=', Date.UTC(2020, 0, 1, 0, 0, 0)], ['<', Date.UTC(2020, 11, 31, 23, 59, 59)]]);
      const validate = ajv.compile({validDate: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.date_max_now': {
    build: () => {
      const ajv = new Ajv();
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      addValidDate(ajv, [['<=', () => Date.now()]]);
      const validate = ajv.compile({validDate: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      addValidDate(ajv, [['<=', () => Date.now()]]);
      const validate = ajv.compile({validDate: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.date_rel_window': {
    build: () => {
      const ajv = new Ajv();
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      const shiftYears = (years: number) => () => {
        const d = new Date();
        d.setUTCFullYear(d.getUTCFullYear() + years);
        return d.getTime();
      };
      addValidDate(ajv, [
        ['>=', shiftYears(-1000)],
        ['<=', shiftYears(1000)],
      ]);
      const validate = ajv.compile({validDate: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      const shiftYears = (years: number) => () => {
        const d = new Date();
        d.setUTCFullYear(d.getUTCFullYear() + years);
        return d.getTime();
      };
      addValidDate(ajv, [
        ['>=', shiftYears(-1000)],
        ['<=', shiftYears(1000)],
      ]);
      const validate = ajv.compile({validDate: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.date_rel_datetime_components': {
    build: () => {
      const ajv = new Ajv();
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      addValidDate(ajv, [
        [
          '>=',
          () => {
            const d = new Date();
            d.setUTCFullYear(d.getUTCFullYear() - 1000);
            return d.getTime() - 12 * 3600000;
          },
        ],
      ]);
      const validate = ajv.compile({validDate: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      addValidDate(ajv, [
        [
          '>=',
          () => {
            const d = new Date();
            d.setUTCFullYear(d.getUTCFullYear() - 1000);
            return d.getTime() - 12 * 3600000;
          },
        ],
      ]);
      const validate = ajv.compile({validDate: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.instant_minmax': {
    build: () => {
      const ajv = new Ajv();
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.Instant, [
        ['>=', Temporal.Instant.from('2020-01-01T00:00:00Z')],
        ['<=', Temporal.Instant.from('2020-12-31T23:59:59Z')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.Instant, [
        ['>=', Temporal.Instant.from('2020-01-01T00:00:00Z')],
        ['<=', Temporal.Instant.from('2020-12-31T23:59:59Z')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.instant_gtlt': {
    build: () => {
      const ajv = new Ajv();
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.Instant, [
        ['>', Temporal.Instant.from('2020-01-01T00:00:00Z')],
        ['<', Temporal.Instant.from('2020-12-31T23:59:59Z')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.Instant, [
        ['>', Temporal.Instant.from('2020-01-01T00:00:00Z')],
        ['<', Temporal.Instant.from('2020-12-31T23:59:59Z')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.instant_rel': {
    build: () => {
      const ajv = new Ajv();
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      const nowFn = () => Temporal.Now.instant();
      const d0 = Temporal.Duration.from('PT8760000H');
      addTemporal(ajv, Temporal.Instant, [
        ['>=', () => nowFn().subtract(d0)],
        ['<=', () => nowFn().add(d0)],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      const nowFn = () => Temporal.Now.instant();
      const d0 = Temporal.Duration.from('PT8760000H');
      addTemporal(ajv, Temporal.Instant, [
        ['>=', () => nowFn().subtract(d0)],
        ['<=', () => nowFn().add(d0)],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainDate_minmax': {
    build: () => {
      const ajv = new Ajv();
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainDate, [
        ['>=', Temporal.PlainDate.from('2020-01-01')],
        ['<=', Temporal.PlainDate.from('2020-12-31')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainDate, [
        ['>=', Temporal.PlainDate.from('2020-01-01')],
        ['<=', Temporal.PlainDate.from('2020-12-31')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainDate_gtlt': {
    build: () => {
      const ajv = new Ajv();
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainDate, [
        ['>', Temporal.PlainDate.from('2020-01-01')],
        ['<', Temporal.PlainDate.from('2020-12-31')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainDate, [
        ['>', Temporal.PlainDate.from('2020-01-01')],
        ['<', Temporal.PlainDate.from('2020-12-31')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainDate_min_lt': {
    build: () => {
      const ajv = new Ajv();
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainDate, [
        ['>=', Temporal.PlainDate.from('2020-01-01')],
        ['<', Temporal.PlainDate.from('2020-01-10')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainDate, [
        ['>=', Temporal.PlainDate.from('2020-01-01')],
        ['<', Temporal.PlainDate.from('2020-01-10')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainDate_gt_max': {
    build: () => {
      const ajv = new Ajv();
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainDate, [
        ['<=', Temporal.PlainDate.from('2020-01-10')],
        ['>', Temporal.PlainDate.from('2020-01-01')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainDate, [
        ['<=', Temporal.PlainDate.from('2020-01-10')],
        ['>', Temporal.PlainDate.from('2020-01-01')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainDate_min_only': {
    build: () => {
      const ajv = new Ajv();
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainDate, [['>=', Temporal.PlainDate.from('2020-01-01')]]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainDate, [['>=', Temporal.PlainDate.from('2020-01-01')]]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainDate_max_only': {
    build: () => {
      const ajv = new Ajv();
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainDate, [['<=', Temporal.PlainDate.from('2020-12-31')]]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainDate, [['<=', Temporal.PlainDate.from('2020-12-31')]]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainDate_gt_only': {
    build: () => {
      const ajv = new Ajv();
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainDate, [['>', Temporal.PlainDate.from('2020-01-01')]]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainDate, [['>', Temporal.PlainDate.from('2020-01-01')]]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainDate_lt_only': {
    build: () => {
      const ajv = new Ajv();
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainDate, [['<', Temporal.PlainDate.from('2020-12-31')]]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainDate, [['<', Temporal.PlainDate.from('2020-12-31')]]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainDate_rel_window': {
    build: () => {
      const ajv = new Ajv();
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      const nowFn = () => Temporal.Now.plainDateISO();
      const d0 = Temporal.Duration.from('P1000Y');
      addTemporal(ajv, Temporal.PlainDate, [
        ['>=', () => nowFn().subtract(d0)],
        ['<=', () => nowFn().add(d0)],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      const nowFn = () => Temporal.Now.plainDateISO();
      const d0 = Temporal.Duration.from('P1000Y');
      addTemporal(ajv, Temporal.PlainDate, [
        ['>=', () => nowFn().subtract(d0)],
        ['<=', () => nowFn().add(d0)],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainDate_rel_ymd': {
    build: () => {
      const ajv = new Ajv();
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      const nowFn = () => Temporal.Now.plainDateISO();
      const d0 = Temporal.Duration.from('P100Y6M15D');
      addTemporal(ajv, Temporal.PlainDate, [
        ['>=', () => nowFn().subtract(d0)],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      const nowFn = () => Temporal.Now.plainDateISO();
      const d0 = Temporal.Duration.from('P100Y6M15D');
      addTemporal(ajv, Temporal.PlainDate, [
        ['>=', () => nowFn().subtract(d0)],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainDate_rel_weeks': {
    build: () => {
      const ajv = new Ajv();
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      const nowFn = () => Temporal.Now.plainDateISO();
      const d0 = Temporal.Duration.from('P52200W');
      addTemporal(ajv, Temporal.PlainDate, [
        ['>=', () => nowFn().subtract(d0)],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      const nowFn = () => Temporal.Now.plainDateISO();
      const d0 = Temporal.Duration.from('P52200W');
      addTemporal(ajv, Temporal.PlainDate, [
        ['>=', () => nowFn().subtract(d0)],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainTime_minmax': {
    build: () => {
      const ajv = new Ajv();
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainTime, [
        ['>=', Temporal.PlainTime.from('09:00:00')],
        ['<=', Temporal.PlainTime.from('17:00:00')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainTime, [
        ['>=', Temporal.PlainTime.from('09:00:00')],
        ['<=', Temporal.PlainTime.from('17:00:00')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainTime_gtlt': {
    build: () => {
      const ajv = new Ajv();
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainTime, [
        ['>', Temporal.PlainTime.from('09:00:00')],
        ['<', Temporal.PlainTime.from('17:00:00')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainTime, [
        ['>', Temporal.PlainTime.from('09:00:00')],
        ['<', Temporal.PlainTime.from('17:00:00')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainDateTime_minmax': {
    build: () => {
      const ajv = new Ajv();
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainDateTime, [
        ['>=', Temporal.PlainDateTime.from('2020-01-01T00:00:00')],
        ['<=', Temporal.PlainDateTime.from('2020-12-31T23:59:59')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainDateTime, [
        ['>=', Temporal.PlainDateTime.from('2020-01-01T00:00:00')],
        ['<=', Temporal.PlainDateTime.from('2020-12-31T23:59:59')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainDateTime_gtlt': {
    build: () => {
      const ajv = new Ajv();
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainDateTime, [
        ['>', Temporal.PlainDateTime.from('2020-01-01T00:00:00')],
        ['<', Temporal.PlainDateTime.from('2020-12-31T23:59:59')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainDateTime, [
        ['>', Temporal.PlainDateTime.from('2020-01-01T00:00:00')],
        ['<', Temporal.PlainDateTime.from('2020-12-31T23:59:59')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainDateTime_rel': {
    build: () => {
      const ajv = new Ajv();
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      const nowFn = () => Temporal.Now.plainDateTimeISO();
      const d0 = Temporal.Duration.from('P1000Y');
      addTemporal(ajv, Temporal.PlainDateTime, [
        ['>=', () => nowFn().subtract(d0)],
        ['<=', () => nowFn().add(d0)],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      const nowFn = () => Temporal.Now.plainDateTimeISO();
      const d0 = Temporal.Duration.from('P1000Y');
      addTemporal(ajv, Temporal.PlainDateTime, [
        ['>=', () => nowFn().subtract(d0)],
        ['<=', () => nowFn().add(d0)],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainDateTime_rel_combo': {
    build: () => {
      const ajv = new Ajv();
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      const nowFn = () => Temporal.Now.plainDateTimeISO();
      const d0 = Temporal.Duration.from('P500YT12H');
      addTemporal(ajv, Temporal.PlainDateTime, [
        ['>=', () => nowFn().subtract(d0)],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      const nowFn = () => Temporal.Now.plainDateTimeISO();
      const d0 = Temporal.Duration.from('P500YT12H');
      addTemporal(ajv, Temporal.PlainDateTime, [
        ['>=', () => nowFn().subtract(d0)],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainYearMonth_minmax': {
    build: () => {
      const ajv = new Ajv();
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainYearMonth, [
        ['>=', Temporal.PlainYearMonth.from('2020-01')],
        ['<=', Temporal.PlainYearMonth.from('2020-12')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainYearMonth, [
        ['>=', Temporal.PlainYearMonth.from('2020-01')],
        ['<=', Temporal.PlainYearMonth.from('2020-12')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainYearMonth_gtlt': {
    build: () => {
      const ajv = new Ajv();
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainYearMonth, [
        ['>', Temporal.PlainYearMonth.from('2020-01')],
        ['<', Temporal.PlainYearMonth.from('2020-12')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.PlainYearMonth, [
        ['>', Temporal.PlainYearMonth.from('2020-01')],
        ['<', Temporal.PlainYearMonth.from('2020-12')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.plainYearMonth_rel': {
    build: () => {
      const ajv = new Ajv();
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      const nowFn = () => Temporal.Now.plainDateISO().toPlainYearMonth();
      const d0 = Temporal.Duration.from('P1000Y');
      addTemporal(ajv, Temporal.PlainYearMonth, [
        ['>=', () => nowFn().subtract(d0)],
        ['<=', () => nowFn().add(d0)],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      const nowFn = () => Temporal.Now.plainDateISO().toPlainYearMonth();
      const d0 = Temporal.Duration.from('P1000Y');
      addTemporal(ajv, Temporal.PlainYearMonth, [
        ['>=', () => nowFn().subtract(d0)],
        ['<=', () => nowFn().add(d0)],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.zonedDateTime_minmax': {
    build: () => {
      const ajv = new Ajv();
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.ZonedDateTime, [
        ['>=', Temporal.ZonedDateTime.from('2020-01-01T00:00:00[UTC]')],
        ['<=', Temporal.ZonedDateTime.from('2020-12-31T23:59:59[UTC]')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.ZonedDateTime, [
        ['>=', Temporal.ZonedDateTime.from('2020-01-01T00:00:00[UTC]')],
        ['<=', Temporal.ZonedDateTime.from('2020-12-31T23:59:59[UTC]')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.zonedDateTime_gtlt': {
    build: () => {
      const ajv = new Ajv();
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.ZonedDateTime, [
        ['>', Temporal.ZonedDateTime.from('2020-01-01T00:00:00[UTC]')],
        ['<', Temporal.ZonedDateTime.from('2020-12-31T23:59:59[UTC]')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // fixed bounds parsed once (R4b)
      addTemporal(ajv, Temporal.ZonedDateTime, [
        ['>', Temporal.ZonedDateTime.from('2020-01-01T00:00:00[UTC]')],
        ['<', Temporal.ZonedDateTime.from('2020-12-31T23:59:59[UTC]')],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },
  'DATETIME.zonedDateTime_rel': {
    build: () => {
      const ajv = new Ajv();
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      const nowFn = () => Temporal.Now.zonedDateTimeISO();
      const d0 = Temporal.Duration.from('P1000Y');
      addTemporal(ajv, Temporal.ZonedDateTime, [
        ['>=', () => nowFn().subtract(d0)],
        ['<=', () => nowFn().add(d0)],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
      // relative bounds re-read the clock on every call (R4b), with mion's UTC calendar shift
      const nowFn = () => Temporal.Now.zonedDateTimeISO();
      const d0 = Temporal.Duration.from('P1000Y');
      addTemporal(ajv, Temporal.ZonedDateTime, [
        ['>=', () => nowFn().subtract(d0)],
        ['<=', () => nowFn().add(d0)],
      ]);
      const validate = ajv.compile({temporal: true});
      return (value: unknown) => validate(value) === true;
    },
  },

  // ── REALWORLD ──
  'REALWORLD.user': {
    build: () => {
      const ajv = new Ajv();
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
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
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
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
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
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
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
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
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
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
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
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
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
      const ajv = new Ajv({allErrors: true});
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
  // Each case's own 2020-12 document, compiled by ajv 2020-12 (full-mode email requires the dotted TLD; multipleOf
  // rejects NaN and Infinity). The two record roots add mion's plain-object guard.
  'JSON_SCHEMA.property_names': {
    build: () => compile2020('property_names', false, true),
    buildErrors: () => compile2020('property_names', true, true),
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
    build: () => compile2020('object_size', false, true),
    buildErrors: () => compile2020('object_size', true, true),
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
      const ajv = new Ajv();
      const validate = ajv.compile({
        type: 'object',
        properties: {id: {type: 'number'}, name: {type: 'string'}, active: {type: 'boolean'}},
        required: ['id', 'name', 'active'],
        additionalProperties: false,
      });
      return (value: unknown) => validate(value) === true;
    },
    buildErrors: () => {
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
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
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
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
      const ajv = new Ajv({allErrors: true});
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
      const ajv = new Ajv();
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
      const ajv = new Ajv({allErrors: true});
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
