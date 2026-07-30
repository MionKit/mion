// json-schema define suite driver — runs every registry case through the shared
// asserts, then pins the schema-authoring-specific behaviors that have no
// value-first analogue: keyword-subset enforcement (type-level), ignored
// annotations, idempotency (same schema at two call sites / cross-file /
// key-order permutation), three-way convergence (type-first ↔ value-first ↔
// jsonSchema), and the CLAUDE.md marker-rule paired `getRunTypeId` shapes with
// a hash-equivalence assertion.

import {describe, expect, it} from 'vitest';
import {createValidateFn, createMockDataFn, getRunTypeId, type CompTimeArgs} from '@ts-runtypes/core';
import * as TF from '@ts-runtypes/core/formats';
import * as RT from '@ts-runtypes/core/schema';
import {jsonSchema, type ExactJsonSchema, type FromJsonSchema, type JsonSchemaInput} from '@ts-runtypes/core/json-schema';
import {JSON_SCHEMA_DEFINE_SUITE, USER_SCHEMA, VALID_USER, type ExpectedUser} from './index.ts';
import {
  assertValidateStatic,
  assertValidateReflect,
  assertValidateDeserializeStatic,
  assertValidateJsonSchema,
  assertGetValidationErrorsContract,
  assertMockTypeStatic,
} from '../../util/validationAsserts.ts';

describe('json-schema define', () => {
  for (const c of Object.values(JSON_SCHEMA_DEFINE_SUITE)) {
    it(`validate/static — ${c.title}`, () => assertValidateStatic(c));
    it(`validate/reflect — ${c.title}`, () => assertValidateReflect(c));
    it(`validate/deserialize-static — ${c.title}`, () => assertValidateDeserializeStatic(c));
    it(`validate/json-schema — ${c.title}`, () => assertValidateJsonSchema(c));
    it(`getValidationErrors — ${c.title}`, () => assertGetValidationErrorsContract(c));
    it(`mockType — ${c.title}`, () => assertMockTypeStatic(c));
  }
});

describe('json-schema define — marker coverage rule (paired getRunTypeId shapes)', () => {
  it('static <T>, reflection (value) and builder forms resolve ONE hash', () => {
    // Static form: the recovered type supplied explicitly.
    const idStatic = getRunTypeId<FromJsonSchema<typeof USER_SCHEMA>>();
    // Reflection form: T inferred from a value's declared type.
    const reflectValue = VALID_USER as unknown as FromJsonSchema<typeof USER_SCHEMA>;
    expect(getRunTypeId(reflectValue)).toBe(idStatic);
    // Builder form: the schema literal itself.
    expect(getRunTypeId(jsonSchema(USER_SCHEMA))).toBe(idStatic);
    // And the hand-written type-first twin — the translation-correctness pin.
    expect(getRunTypeId<ExpectedUser>()).toBe(idStatic);
  });
});

describe('json-schema define — idempotency', () => {
  it('the same module-const schema at two call sites resolves ONE cached factory', () => {
    expect(createValidateFn(jsonSchema(USER_SCHEMA))).toBe(createValidateFn(jsonSchema(USER_SCHEMA)));
  });

  it('the same schema re-authored inline in ANOTHER FILE resolves the same factory', () => {
    // USER_SCHEMA lives in ./index.ts; this literal is authored here — the
    // cross-file half of "same schema at two call sites/files → same factory".
    const fromInline = createValidateFn(
      jsonSchema({
        type: 'object',
        properties: {
          id: {type: 'string', format: 'uuid'},
          name: {type: 'string', minLength: 2, maxLength: 50},
          age: {type: 'integer', minimum: 0, maximum: 130},
          email: {type: 'string', format: 'email'},
          tags: {type: 'array', items: {type: 'string'}},
          address: {
            type: 'object',
            properties: {street: {type: 'string'}, city: {type: 'string'}},
            required: ['street'],
          },
        },
        required: ['id', 'name', 'age', 'tags', 'address'],
      })
    );
    expect(fromInline).toBe(JSON_SCHEMA_DEFINE_SUITE.user_object.validateJsonSchema());
  });

  it('a key-order permutation of the same schema resolves the same id', () => {
    const orderedId = getRunTypeId(jsonSchema({type: 'string', minLength: 2, maxLength: 50}));
    const permutedId = getRunTypeId(jsonSchema({maxLength: 50, minLength: 2, type: 'string'}));
    expect(permutedId).toBe(orderedId);
  });
});

describe('json-schema define — three-way convergence (type-first ↔ value-first ↔ jsonSchema)', () => {
  it('all three authoring forms of one shape resolve ONE cached factory', () => {
    interface Point {
      name: string;
      x: number;
      y: number;
    }
    const typeFirst = createValidateFn<Point>();
    const valueFirst = createValidateFn(RT.object({name: TF.string(), x: TF.number(), y: TF.number()}));
    const schemaFirst = createValidateFn(
      jsonSchema({
        type: 'object',
        properties: {name: {type: 'string'}, x: {type: 'number'}, y: {type: 'number'}},
        required: ['name', 'x', 'y'],
      })
    );
    expect(valueFirst).toBe(typeFirst);
    expect(schemaFirst).toBe(typeFirst);
  });
});

describe('json-schema define — boolean root schemas (2020-12)', () => {
  it('jsonSchema(true) recovers unknown and converges with the type-first form', () => {
    expect(createValidateFn(jsonSchema(true))).toBe(createValidateFn<unknown>());
  });

  it('jsonSchema(false) recovers never — the reject-all validator, converging with type-first', () => {
    const isNever = createValidateFn(jsonSchema(false));
    expect(isNever).toBe(createValidateFn<never>());
    expect(isNever('anything')).toBe(false);
    expect(isNever(undefined)).toBe(false);
  });
});

describe('json-schema define — $defs and $ref recursion (M6)', () => {
  it("$ref: '#' re-enters the root: circular array converges with the type-first twin", () => {
    type CircularArray = CircularArray[];
    const isCircular = createValidateFn(jsonSchema({type: 'array', items: {$ref: '#'}}));
    expect(isCircular).toBe(createValidateFn<CircularArray>());
    expect(isCircular([[[]], []])).toBe(true);
    expect(isCircular([42])).toBe(false);
  });

  it('non-recursive $defs lookup: two refs to one definition converge with the expanded twin', () => {
    const isAddressed = createValidateFn(
      jsonSchema({
        $defs: {address: {type: 'object', properties: {street: {type: 'string'}}, required: ['street']}},
        type: 'object',
        properties: {home: {$ref: '#/$defs/address'}, work: {$ref: '#/$defs/address'}},
        required: ['home'],
      })
    );
    expect(isAddressed).toBe(createValidateFn<{home: {street: string}; work?: {street: string}}>());
    expect(isAddressed({home: {street: 'a'}, work: {street: 'b'}})).toBe(true);
    expect(isAddressed({home: {street: 7}})).toBe(false);
  });

  it('recursive $defs: a linked-list definition converges and validates at depth', () => {
    interface ListNode {
      value: number;
      next?: ListNode;
    }
    const isNode = createValidateFn(
      jsonSchema({
        $defs: {
          node: {type: 'object', properties: {value: {type: 'number'}, next: {$ref: '#/$defs/node'}}, required: ['value']},
        },
        $ref: '#/$defs/node',
      })
    );
    expect(isNode).toBe(createValidateFn<ListNode>());
    expect(isNode({value: 1, next: {value: 2, next: {value: 3}}})).toBe(true);
    expect(isNode({value: 1, next: {value: 'x'}})).toBe(false);
    // Mock soundness holds through the cycle too (bounded by the walker).
    const mockNode = createMockDataFn(
      jsonSchema({
        $defs: {
          node: {type: 'object', properties: {value: {type: 'number'}, next: {$ref: '#/$defs/node'}}, required: ['value']},
        },
        $ref: '#/$defs/node',
      })
    );
    for (let round = 0; round < 8; round++) {
      expect(isNode(mockNode())).toBe(true);
    }
  });

  it('shared recursive containers converge: the same container shape at two members (the fuzz-lane finding)', () => {
    // The type-first side interns `N1[]` once (one checker node); the schema
    // side builds one container literal per occurrence. The id computer's
    // depth-correct cycle walk makes both spell the same back-edge depths, so
    // the forms converge (docs/done/json-schema-shared-recursive-container-id-divergence.md).
    interface N1 {
      p1?: N1[];
      kids2: N1[];
    }
    const isN1 = createValidateFn(
      jsonSchema({
        $defs: {
          N1: {
            type: 'object',
            properties: {
              p1: {type: 'array', items: {$ref: '#/$defs/N1'}},
              kids2: {type: 'array', items: {$ref: '#/$defs/N1'}},
            },
            required: ['kids2'],
          },
        },
        $ref: '#/$defs/N1',
      })
    );
    expect(isN1).toBe(createValidateFn<N1>());
    expect(isN1({kids2: [{kids2: []}], p1: [{kids2: []}]})).toBe(true);
    expect(isN1({kids2: [{kids2: [7]}]})).toBe(false);
  });

  it('nested reuse of a recursive container converges: N1[] standalone and inside N1[][]', () => {
    interface Tree {
      x: Tree[];
      y: Tree[][];
    }
    const isTree = createValidateFn(
      jsonSchema({
        $defs: {
          T: {
            type: 'object',
            properties: {
              x: {type: 'array', items: {$ref: '#/$defs/T'}},
              y: {type: 'array', items: {type: 'array', items: {$ref: '#/$defs/T'}}},
            },
            required: ['x', 'y'],
          },
        },
        $ref: '#/$defs/T',
      })
    );
    expect(isTree).toBe(createValidateFn<Tree>());
    expect(isTree({x: [], y: [[{x: [], y: []}]]})).toBe(true);
    expect(isTree({x: [], y: [{x: [], y: []}]})).toBe(false);
  });

  it('entry through a container the cycle also contains converges (canonical anchoring)', () => {
    // The walk enters N0's cycle THROUGH Array<N0> (the record value), which
    // N0 itself also contains — the shape class the fuzz lane's soak caught
    // (seeds 1662213203/2140920747/2144068665 of base 20260730). Type-first
    // interns one Array<N0> node so the raw back-edge used to anchor at the
    // ARRAY; the schema side's cloned containers anchored at the knot. The
    // canonical quotient emission (typeid/canonicalize.go) makes both spell
    // the loop identically.
    interface N0 {
      p1?: N0;
      p2?: N0[];
      p3: string;
      kids4: N0[];
    }
    type Board = Record<string, N0[]>;
    const isBoard = createValidateFn(
      jsonSchema({
        $defs: {
          N0: {
            type: 'object',
            properties: {
              p1: {$ref: '#/$defs/N0'},
              p2: {type: 'array', items: {$ref: '#/$defs/N0'}},
              p3: {type: 'string'},
              kids4: {type: 'array', items: {$ref: '#/$defs/N0'}},
            },
            required: ['p3', 'kids4'],
          },
        },
        type: 'object',
        additionalProperties: {type: 'array', items: {$ref: '#/$defs/N0'}},
      })
    );
    expect(isBoard).toBe(createValidateFn<Board>());
    expect(isBoard({lane: [{p3: 'x', kids4: [{p3: 'y', kids4: []}]}]})).toBe(true);
    expect(isBoard({lane: [{p3: 7, kids4: []}]})).toBe(false);
  });

  it("root '#' self-ref through two identical containers converges (the class is not $defs-specific)", () => {
    type Rooted = {p1?: Rooted[]; kids2: Rooted[]};
    const isRooted = createValidateFn(
      jsonSchema({
        type: 'object',
        properties: {p1: {type: 'array', items: {$ref: '#'}}, kids2: {type: 'array', items: {$ref: '#'}}},
        required: ['kids2'],
      })
    );
    expect(isRooted).toBe(createValidateFn<Rooted>());
    expect(isRooted({kids2: [], p1: [{kids2: []}]})).toBe(true);
    expect(isRooted({p1: [{kids2: []}]})).toBe(false);
  });
});

describe('json-schema define — sample-less pattern policy (04-migration-plan §1)', () => {
  it('mocking a schema-pattern type throws the TARGETED register-samples error, never junk', () => {
    const mockSlug = createMockDataFn(jsonSchema({type: 'string', pattern: '^[a-z-]+$'}));
    expect(() => mockSlug()).toThrow(/`mockSamples`/);
  });
});

describe('json-schema define — /schema utility builders compose over jsonSchema results (M5)', () => {
  // The utility builders take any RunType<T>, so a jsonSchema(...) result flows
  // in exactly like a value-first model and the composed factory converges with
  // the type-first utility application. returnType / parameters are function
  // territory — no schema-authored input can reach them (noop by design).
  interface ComposeBase {
    a: string;
    b: number;
  }

  it('partial / required / pick / omit / readonlyType compose over a schema-authored object', () => {
    const base = () => jsonSchema({type: 'object', properties: {a: {type: 'string'}, b: {type: 'number'}}, required: ['a', 'b']});
    expect(createValidateFn(RT.partial(base()))).toBe(createValidateFn<Partial<ComposeBase>>());
    expect(createValidateFn(RT.required(RT.partial(base())))).toBe(createValidateFn<ComposeBase>());
    expect(createValidateFn(RT.pick(base(), ['a']))).toBe(createValidateFn<Pick<ComposeBase, 'a'>>());
    expect(createValidateFn(RT.omit(base(), ['a']))).toBe(createValidateFn<Omit<ComposeBase, 'a'>>());
    expect(createValidateFn(RT.readonlyType(base()))).toBe(createValidateFn<Readonly<ComposeBase>>());
  });

  it('nonNullable / exclude / extract compose over schema-authored unions', () => {
    expect(createValidateFn(RT.nonNullable(jsonSchema({anyOf: [{type: 'string'}, {type: 'null'}]})))).toBe(
      createValidateFn<string>()
    );
    expect(createValidateFn(RT.exclude(jsonSchema({enum: ['a', 'b', 'c']}), RT.literal('c')))).toBe(
      createValidateFn<'a' | 'b'>()
    );
    expect(createValidateFn(RT.extract(jsonSchema({enum: ['a', 'b', 'c']}), jsonSchema({enum: ['a', 'b']})))).toBe(
      createValidateFn<'a' | 'b'>()
    );
  });
});

describe('json-schema define — ignored annotations', () => {
  it('$schema/title/description/examples/default do not change the resolved id', () => {
    const bare = createValidateFn(jsonSchema({type: 'string', minLength: 3}));
    const annotated = createValidateFn(
      jsonSchema({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: 'A short name',
        description: 'Non-structural metadata the inference must ignore.',
        examples: ['abc', 'defg'],
        default: 'abc',
        type: 'string',
        minLength: 3,
      })
    );
    expect(annotated).toBe(bare);
  });
});

describe('json-schema define — keyword subset enforcement (type-level)', () => {
  // Mirrors the builder's exact generic shape (`<const S extends
  // JsonSchemaInput>` + the deep guard folded inside `CompTimeArgs`) WITHOUT
  // being a marker site, so rejection cases don't register junk call sites with
  // the scanner. The `@ts-expect-error` lines are enforced by `pnpm run lint`'s
  // typecheck of this file (vitest itself transpiles without checking).
  const acceptsSchema = <const S extends JsonSchemaInput>(schema: CompTimeArgs<ExactJsonSchema<S>>): S => schema as S;

  it('accepts the full valid subset and rejects unknown keywords at every depth', () => {
    // Positive controls — the guard must be TRANSPARENT for valid schemas.
    acceptsSchema({type: 'string', minLength: 3, maxLength: 9});
    acceptsSchema({$schema: 'https://json-schema.org/draft/2020-12/schema', type: 'null'});
    acceptsSchema({
      type: 'object',
      properties: {a: {type: 'array', items: {type: 'integer', minimum: 0}}},
      required: ['a'],
      additionalProperties: false,
    });
    acceptsSchema({anyOf: [{type: 'string'}, {const: 7}]});

    // @ts-expect-error unknown top-level keyword (minLength typo)
    acceptsSchema({type: 'string', minLen: 3});
    // @ts-expect-error unknown keyword nested under properties
    acceptsSchema({type: 'object', properties: {a: {type: 'string', minLen: 3}}});
    // @ts-expect-error unknown keyword nested under items
    acceptsSchema({type: 'array', items: {type: 'number', minimum: 0, maximumm: 9}});
    // @ts-expect-error unknown keyword inside an anyOf member
    acceptsSchema({anyOf: [{type: 'string'}, {type: 'number', multipleOff: 2}]});
    // @ts-expect-error unknown keyword nested under additionalProperties
    acceptsSchema({type: 'object', additionalProperties: {type: 'string', patern: 'x'}});
    // @ts-expect-error a draft-07 $schema is not the accepted 2020-12 dialect
    acceptsSchema({$schema: 'http://json-schema.org/draft-07/schema#', type: 'string'});
    // @ts-expect-error draft-04 exclusiveMinimum took a boolean; 2020-12 takes a number
    acceptsSchema({type: 'number', minimum: 0, exclusiveMinimum: true});

    expect(typeof acceptsSchema).toBe('function'); // compile-time-only assertions above
  });
});
