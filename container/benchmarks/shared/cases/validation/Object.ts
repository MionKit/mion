import type {SharedCase} from '../types.ts';

export const OBJECT = {
  simple_interface: {
    title: 'Simple interface with string and number props',
    description:
      'interface.spec.ts "validate object" (simplified to the atomic-prop subset that the current Go port can validate end-to-end)',
    getSamples: () => ({
      valid: [
        {a: 'hello', b: 1},
        {a: '', b: 0},
        {a: 'x', b: 42, extra: true},
      ],
      invalid: [
        'hello',
        null,
        undefined,
        {a: 'x'},
        {a: 1, b: 1},
        {a: 'x', b: 'not number'},
        {a: 'x', b: NaN},
        {a: 'x', b: Infinity},
        {b: 1},
        true,
      ],
    }),
  },
  object_as_const_literals: {
    title: 'Object pinned with `as const` (readonly literal props)',
    description:
      'Object literal pinned with `as const` — every property becomes a readonly literal type. Verifies that the type-id resolution and validator emit handle the readonly-literal-props shape end-to-end and that the static / reflect forms agree.',
    getSamples: () => ({
      valid: [{name: 'john', age: 30}],
      invalid: [
        {name: 'jane', age: 30}, // name not the literal 'john'
        {name: 'john', age: 31}, // age not the literal 30
        {name: 'john'}, // missing age
        {age: 30}, // missing name
        {},
        null,
        'not object',
      ],
    }),
  },
  object_via_return_type_utility: {
    title: 'Object inferred via ReturnType<typeof factory>',
    description:
      'Static-form usage of the recommended `ReturnType<typeof fn>` idiom when you have a factory function whose return type you want to validate. The reflect form `createValidateFn(makeUser())` would invoke the function at runtime purely for type inference — anti-pattern that the resolver now flags as a build-time warning. The reflect-form thunk is intentionally omitted; the diagnostic test in ts-runtypes-devtools covers the warning.',
    getSamples: () => ({
      valid: [
        {id: 1, name: 'john'},
        {id: 0, name: ''},
        {id: 42, name: 'jane', extra: true},
      ],
      invalid: [{id: 'not number', name: 'x'}, {id: 1}, {name: 'x'}, null, 'not object'],
    }),
  },
  object_via_property_access: {
    title: 'Object inferred via property access on a parent shape',
    description:
      "Reflect form with a property-access argument (`createValidateFn(outer.user)`). T comes from the property's declared type on the parent shape — property accesses don't go through const-binding CFA, so the natural pattern produces the same hash as the static form.",
    getSamples: () => ({
      valid: [
        {id: 1, name: 'john'},
        {id: 0, name: ''},
      ],
      invalid: [{id: 'not number', name: 'x'}, {id: 1}, null],
    }),
  },
  object_via_array_access: {
    title: 'Object inferred via array element access',
    description:
      "Reflect form with an array-element-access argument (`createValidateFn(items[0])`). T comes from the array's declared element type — indexed accesses don't go through const-binding CFA, so the natural pattern produces the same hash as the static form.",
    getSamples: () => ({
      valid: [
        {id: 1, name: 'john'},
        {id: 0, name: ''},
      ],
      invalid: [{id: 'not number', name: 'x'}, {id: 1}, null],
    }),
  },
  interface_with_optional: {
    title: 'Interface with one optional property',
    description: 'optional property — `(v.b === undefined || Number.isFinite(v.b))` per PropertyRunType.emitIsType',
    getSamples: () => ({
      valid: [{a: 'x'}, {a: 'x', b: 0}, {a: 'x', b: undefined}],
      invalid: [{a: 'x', b: 'not number'}, {a: 1}, null, undefined, {}, {b: 1}, {a: 'x', b: NaN}],
    }),
  },
  interface_with_date: {
    title: 'Interface with a Date property',
    description: 'tests that Date child validates via instanceof inside the AND chain — interface.spec.ts ObjectType subset',
    getSamples: () => ({
      valid: [{date: new Date(), name: 'x'}],
      invalid: [
        {date: 'not date', name: 'x'},
        {date: new Date(), name: 1},
        {name: 'x'},
        null,
        undefined,
        {date: new Date('invalid'), name: 'x'},
        {date: new Date(NaN), name: 'x'},
      ],
    }),
  },
  interface_with_method: {
    title: 'Interface with a method (function prop skipped from check)',
    description:
      "objectSkipProps — function-typed properties are skipped from validate (`getRTChild → undefined` for function children). validate({name:'x'}) PASSES even without `cb`.",
    getSamples: () => ({
      valid: [{name: 'x'}, {name: 'x', cb: () => null}, {name: 'x', cb: 42}, {name: 'x', cb: null}, {name: 'x', cb: 'not-a-fn'}],
      invalid: [{name: 1}, null, undefined],
    }),
  },
  nested_object: {
    title: 'Interface with a nested object property',
    description: 'nested object — outer + inner AND-chains; ObjectType "deep" subset',
    getSamples: () => ({
      valid: [{a: 'x', deep: {b: 'y', c: 1}}],
      invalid: [
        {a: 'x'},
        {a: 'x', deep: {b: 1, c: 1}},
        {a: 'x', deep: null},
        null,
        undefined,
        {a: 'x', deep: {b: 'y', c: NaN}},
        {a: 'x', deep: {b: 'y'}},
      ],
    }),
  },
  interface_string_array_prop: {
    title: 'Interface with a string-array property',
    description: 'an array-typed property — exercises the dependency-call layer through an object',
    getSamples: () => ({
      valid: [{tags: []}, {tags: ['a', 'b']}],
      invalid: [{tags: ['a', 1]}, {tags: 'not array'}, null, undefined, {tags: [null]}, {tags: [undefined]}, {}],
    }),
  },
  circular_interface: {
    title: 'Self-referential interface (linked-list shape)',
    description:
      "interface.spec.ts 'validate circular object'. Exercises self-recursive dependency call (isSelf branch — `<innerFnName>(v.child)` without `.fn`).",
    getSamples: () => ({
      valid: [{name: 'root'}, {name: 'root', child: {name: 'a'}}, {name: 'root', child: {name: 'a', child: {name: 'b'}}}],
      invalid: [
        {name: 1},
        {name: 'x', child: {name: 1}},
        {name: 'x', child: 'not object'},
        null,
        undefined,
        {}, // missing required name
        {name: 'x', child: {}}, // child missing required name
      ],
    }),
  },
  circular_interface_on_array: {
    title: 'Self-referential interface via an array-of-self property',
    description: "interface.spec.ts 'validate circular interface on array' — circular type traversed via an array property.",
    getSamples: () => ({
      valid: [{name: 'r'}, {name: 'r', children: []}, {name: 'r', children: [{name: 'a'}, {name: 'b', children: [{name: 'c'}]}]}],
      invalid: [{name: 'r', children: [{name: 1}]}, {name: 'r', children: 'not array'}, {name: 1}],
    }),
  },
  circular_interface_on_nested_object: {
    title: 'Self-referential interface buried in a nested object',
    description:
      "interface.spec.ts 'validate circular interface on nested object' — circular reference deep inside a property.",
    getSamples: () => ({
      valid: [
        {name: 'r', embedded: {hello: 'h'}},
        {name: 'r', embedded: {hello: 'h', child: {name: 'c', embedded: {hello: 'h2'}}}},
      ],
      invalid: [{name: 'r'}, {name: 'r', embedded: {hello: 1}}, {name: 'r', embedded: null}],
    }),
  },
  index_signature_string: {
    title: 'Index signature with string values',
    description:
      "indexProperty.spec.ts 'validate index run type' — for-in loop over own keys, value must satisfy the value type.",
    getSamples: () => ({
      valid: [{}, {a: 'x'}, {a: 'x', b: 'y'}],
      invalid: [{a: 1}, {a: 'x', b: 2}, null, 'not object', undefined, {a: null}, {a: undefined}],
    }),
  },
  index_signature_named_props: {
    title: 'Index signature combined with named properties',
    description:
      "indexProperty.spec.ts 'validate index run type + extra properties' — named props (a, b) AND the index signature both validate; extras (any key not a/b) must satisfy the union value type.",
    getSamples: () => ({
      valid: [
        {a: 'x', b: 1},
        {a: 'x', b: 1, extra: 'y'},
        {a: 'x', b: 1, extra: 7},
      ],
      invalid: [{a: 1, b: 1}, {a: 'x'}, null, {a: 'x', b: 1, extra: true}],
    }),
  },
  index_signature_nested: {
    title: 'Nested index signatures (number leaf values)',
    description: 'indexProperty.spec.ts nested rtNested — index sig pointing at another index sig.',
    getSamples: () => ({
      valid: [{}, {a: {x: 1, y: 2}}, {a: {}, b: {n: 0}}],
      invalid: [{a: 1}, {a: {x: 'not number'}}, null, undefined, {a: {x: NaN}}, {a: {x: null}}],
    }),
  },
  index_signature_date_value: {
    title: 'Nested index signatures with Date leaf values',
    description: 'indexProperty.spec.ts rtNested2 — Date as the leaf value type.',
    getSamples: () => ({
      valid: [{}, {a: {x: new Date()}}],
      invalid: [{a: {x: 'not date'}}, {a: 'not object'}, null, undefined, {a: {x: new Date('invalid')}}],
    }),
  },
  index_signature_non_root: {
    title: 'Index signature on a nested (non-root) object property',
    description:
      "indexProperty.spec.ts 'IndexType non root' — index signature attached to a nested (non-root) object property.",
    getSamples: () => ({
      valid: [
        {b: 'hello', c: {a: 'world', c: 'world'}},
        {b: 'x', c: {a: 'y'}},
      ],
      invalid: [{b: 'hello', c: {a: 'world', c: 123}}, {b: 'hello'}, {b: 'hello', c: 'not object'}, null],
    }),
  },
  function_top_level: {
    title: 'Function type at top level (any function passes)',
    description: "FunctionRunType.emitIsType — `typeof v === 'function'`. Param-arity check is deferred.",
    getSamples: () => ({
      valid: [() => {}, function () {}, async () => {}, class {}],
      invalid: [null, undefined, 42, 'function', {}, [], true],
    }),
  },
  interface_callable: {
    title: 'Callable interface (function plus data properties)',
    description:
      'interface.spec.ts "validate callable interface" — the emit detects a CallSignature child and switches the typeof guard from `object` to `function`, then AND-chains the remaining properties on top (JS functions can carry properties).',
    getSamples: () => ({
      valid: [
        Object.assign(
          function (_a: number, _b: boolean) {
            return 'x';
          },
          {extra: 'x'}
        ),
      ],
      invalid: [
        {extra: 'x'}, // not a function
        () => {}, // missing `extra` prop
        Object.assign(() => {}, {extra: 42}), // extra wrong type
        null,
        undefined,
        Object.assign(() => {}, {extra: null}), // extra wrong type (null)
      ],
    }),
  },
  interface_all_optional: {
    title: 'Interface with every property optional (plain-object guard)',
    description:
      "interface.spec.ts \"validate empty object for ObjectAllOptional type\". The `allOptionalCode` guard `(!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]')` is added when every contributing child is optional, so arrays / Date / Map / Set are explicitly rejected (without the guard they'd slip through the bare `typeof === 'object'` check).",
    getSamples: () => ({
      valid: [{}, {a: 'x'}, {a: 'x', b: 1}, {a: undefined, b: undefined}],
      invalid: [[], new Date(), new Map(), new Set(), null, 'hello', 42, undefined, /regex/, true],
    }),
  },
  class_simple: {
    title: 'Class with two atomic props (instance or plain match)',
    description:
      "class.spec.ts 'validate class'. ClassRunType inherits InterfaceRunType.emitIsType, so the KindClass+SubKindNone arm in istype.go falls through to emitObjectValidate. The serializer filters synthetic `prototype` members from class projections so the AND chain only includes user-declared properties + methods (methods drop out via the function-skip rule).",
    getSamples: () => {
      class Match {
        date = new Date();
        name = 'x';
        someMethod() {
          return 'unused';
        }
      }
      return {
        valid: [new Match(), {date: new Date(), name: 'x'}, {date: new Date(), name: 'x', someMethod: () => null}],
        invalid: [
          {date: 'not date', name: 'x'},
          {date: new Date()},
          {name: 'x'},
          null,
          'not object',
          undefined,
          {date: new Date('invalid'), name: 'x'},
          {date: new Date(NaN), name: 'x'},
        ],
      };
    },
  },
  rpc_error_class: {
    title: 'RpcError-shaped class with branded discriminator',
    description:
      "classRpcError.spec.ts — verifies the standard class projection handles RpcError-shaped classes (the actual RpcError class isn't a built-in node kind; it's a regular class with a literal-true brand + generic type discriminator). We define a local equivalent here to exercise the same shape end-to-end without pulling in that dependency for a single test.",
    getSamples: () => {
      const validInstance = {
        'mion@isΣrrθr': true,
        type: 'test-error',
        publicMessage: 'error',
      };
      const validWithId = {...validInstance, id: 'error-123'};
      return {
        valid: [validInstance, validWithId],
        invalid: [
          // brand wrong
          {'mion@isΣrrθr': false, type: 'test-error', publicMessage: 'x'},
          // type discriminator wrong
          {'mion@isΣrrθr': true, type: 'other-error', publicMessage: 'x'},
          // missing publicMessage
          {'mion@isΣrrθr': true, type: 'test-error'},
          null,
          'not object',
          undefined,
          {}, // missing everything
          {publicMessage: 'x'}, // missing brand + type
          // publicMessage wrong type
          {'mion@isΣrrθr': true, type: 'test-error', publicMessage: 42},
        ],
      };
    },
  },
  call_signature_params: {
    title: 'Function parameters extracted via Parameters<F>',
    description:
      "callSignature.spec.ts 'should validate correct parameters' — the reference exposes this via `rt.getCallSignature().createRTParamsFunction(RTFunctions.validate)`; our pipeline uses TypeScript's built-in `Parameters<F>` to extract the param tuple as a first-class type and reuses the standard tuple emit. Same observable behavior: the validator accepts `[number, boolean]`, rejects wrong-type args, accepts missing trailing args (treats them as undefined per the `v.length <= N` policy), rejects excess args.",
    getSamples: () => ({
      valid: [
        [1, true],
        [0, false],
        // missing trailing args treated as undefined; if the
        // param type is `boolean` (not `boolean | undefined`) then
        // `[1]` fails because v[1] === undefined doesn't satisfy
        // typeof === 'boolean'. Same shape here.
      ],
      invalid: [
        [1, 'not boolean'],
        [1], // missing required boolean
        [1, true, 'extra'], // excess args
        ['not number', true],
        'not array',
        null,
        undefined,
        [NaN, true], // NaN fails Number.isFinite
        [],
      ],
    }),
  },
  call_signature_params_with_optional: {
    title: 'Parameters<F> tuple with a trailing optional argument',
    description:
      "function.spec.ts 'validate function parameters' — params tuple with a trailing optional. `Parameters<F>` resolves to `[number, boolean, string?]`; the optional slot accepts undefined OR a string.",
    getSamples: () => ({
      valid: [
        [3, true, 'hello'],
        [3, false],
      ],
      invalid: [
        [3, 3, 3], // wrong type for b and c
        [3, true, 'hello', 7], // excess args
        [3], // missing required boolean
        'not array',
        null,
        undefined,
        [NaN, true], // NaN fails Number.isFinite
      ],
    }),
  },
  call_signature_params_with_rest: {
    title: 'Parameters<F> tuple with a trailing rest segment',
    description:
      "function.spec.ts 'validate function with rest parameters' — params tuple ending in a rest segment. `Parameters<F>` resolves to `[number, boolean, ...Date[]]`; all trailing slots must satisfy Date.",
    getSamples: () => {
      const date1 = new Date();
      const date2 = new Date();
      return {
        valid: [
          [3, true, date1, date2],
          [3, false],
          [3, true],
        ],
        invalid: [
          [3, 3, 3], // wrong type for b
          [3, true, new Date(), 7], // 7 is not a Date in rest slot
          [3, true, new Date(), 7, true], // multiple wrong rest entries
          'not array',
          null,
          undefined,
          [3, true, new Date('invalid')], // Invalid Date in rest slot
        ],
      };
    },
  },
  record_union_keys: {
    title: 'Record<UnionKey, V> — resolves to a fixed-property shape',
    description:
      '`Record<K, V>` with a literal-union key resolves to a fixed-property object literal (`{a: V; b: V}`) at the type-checker level — tsgo distributes the union over the property names. Same emit path as a hand-written object literal; each key is a required property of type V.',
    getSamples: () => ({
      valid: [
        {a: 1, b: 2},
        {a: 0, b: 0},
        // Extra props pass — Record<UnionKey, V> doesn't imply strict.
        {a: 1, b: 2, c: 3},
      ],
      invalid: [
        {a: 1}, // missing 'b'
        {b: 1}, // missing 'a'
        {}, // empty
        {a: 'x', b: 1}, // wrong type
        null,
        'not object',
        undefined,
        {a: 1, b: NaN}, // NaN fails Number.isFinite
        {a: Infinity, b: 1},
      ],
    }),
  },
  union_value_index: {
    title: 'Index signature with a union value type',
    description:
      'index signature with union value type — union emit landed; for-in loop applies the union check to every own key.',
    getSamples: () => ({
      valid: [{}, {a: 'x'}, {a: 'x', b: 1}, {a: 1, b: 'x'}],
      invalid: [{a: true}, {a: 'x', b: null}, 'not object', null, undefined, {a: BigInt(1)}, {a: NaN}],
    }),
  },
  object_with_union_prop: {
    title: 'Object with a discriminated-union string property',
    description:
      'discriminated union as a property type — union emit handles the literal-string union as an OR-chain of `===` checks.',
    getSamples: () => ({
      valid: [
        {kind: 'a', n: 1},
        {kind: 'b', n: 0},
      ],
      invalid: [{kind: 'c', n: 1}, {n: 1}, {kind: 'a', n: 'not number'}, null, undefined, {kind: 'a', n: NaN}, {kind: 'a'}],
    }),
  },
  interface_inheritance: {
    title: 'Interface that extends a parent interface',
    description:
      "TS `interface Child extends Base {…}` — inherited props are merged into the child's RunType.Children by tsgo's GetPropertiesOfType. The validator's emit walks the merged set; runtime behaviour matches a hand-flattened object literal.",
    getSamples: () => ({
      valid: [
        {a: 'x', b: 1},
        {a: '', b: 0},
      ],
      invalid: [
        {a: 'x'}, // missing b (inherited check still applies)
        {b: 1}, // missing a (parent prop)
        {a: 1, b: 1}, // a wrong type
        null,
        undefined,
      ],
    }),
  },
  class_inheritance: {
    title: 'Class that extends a parent class',
    description:
      "TS `class Sub extends Base {…}` — same merging as interface inheritance, but on the KindClass branch. Inherited data members appear in the child class's Children alongside its own.",
    getSamples: () => ({
      valid: [
        {a: 'x', b: 1},
        {a: '', b: 0},
      ],
      invalid: [
        {a: 'x'}, // missing inherited b
        {b: 1}, // missing inherited a
        {a: 'x', b: 'not number'},
        null,
        undefined,
      ],
    }),
  },
  index_signature_number_key: {
    title: 'Index signature with a number key',
    description:
      '`{[k: number]: T}` — TS lets you declare number-keyed index signatures. JS object keys are always strings at runtime, so the resolver normalises this to the same shape as `{[k: string]: T}` and the validator behaves identically.',
    getSamples: () => ({
      valid: [{}, {0: 'x'}, {1: 'x', 2: 'y'}],
      invalid: [{0: 1}, null, 'not object', undefined, {0: null}],
    }),
  },
} as const satisfies Record<string, SharedCase>;
