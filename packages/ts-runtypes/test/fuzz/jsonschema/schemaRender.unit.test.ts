// Pins the M7 normalizer + schema renderer: toSchemaExpressible must be total
// over the wild TypeShape space (replacing, not dropping, the inexpressible
// kinds) and renderSchemaLiteral must emit exactly the draft 2020-12 spellings
// the FromJsonSchema suites prove convergent. Pure TS — no Go binary.

import {describe, expect, it} from 'vitest';
import type {GeneratedType, TypeShape} from '../core/typeGen.ts';
import {hasContainerEntryReuse, renderSchemaLiteral, toSchemaExpressible} from './schemaRender.ts';

function norm(root: TypeShape, decls: GeneratedType['decls'] = []): ReturnType<typeof toSchemaExpressible> {
  return toSchemaExpressible({decls, root});
}

describe('toSchemaExpressible — total normalization into the expressible subset', () => {
  it('replaces the no-spelling kinds instead of dropping them', () => {
    expect(norm({kind: 'bigint'}).root).toEqual({kind: 'number'});
    expect(norm({kind: 'undefined'}).root).toEqual({kind: 'null'});
    expect(norm({kind: 'void'}).root).toEqual({kind: 'null'});
    expect(norm({kind: 'any'}).root).toEqual({kind: 'unknown'});
    expect(norm({kind: 'date'}).root).toEqual({kind: 'string'});
    expect(norm({kind: 'symbol'}).root).toEqual({kind: 'string'});
    expect(norm({kind: 'typedarray', name: 'Uint8Array'}).root).toEqual({kind: 'string'});
    expect(norm({kind: 'function', params: [], ret: {kind: 'number'}}).root).toEqual({kind: 'string'});
  });

  it('keeps structure through container replacements (Map→Record, Set→Array, Promise→value)', () => {
    expect(norm({kind: 'map', key: {kind: 'string'}, value: {kind: 'bigint'}}).root).toEqual({
      kind: 'record',
      value: {kind: 'number'},
    });
    expect(norm({kind: 'set', elem: {kind: 'date'}}).root).toEqual({kind: 'array', elem: {kind: 'string'}});
    expect(norm({kind: 'promise', value: {kind: 'boolean'}}).root).toEqual({kind: 'boolean'});
  });

  it('drops method props, strips readonly, erases non-string index keys', () => {
    const {root} = norm({
      kind: 'object',
      props: [
        {name: 'a', optional: false, readonly: true, method: false, shape: {kind: 'string'}},
        {name: 'm', optional: false, readonly: false, method: true, shape: {kind: 'function', params: [], ret: {kind: 'null'}}},
        {name: 'f', optional: true, readonly: false, method: false, shape: {kind: 'function', params: [], ret: {kind: 'null'}}},
      ],
      index: {kind: 'number'},
      indexKey: ['number', 'symbol'],
    });
    expect(root).toEqual({
      kind: 'object',
      props: [{name: 'a', optional: false, readonly: false, method: false, shape: {kind: 'string'}}],
    });
  });

  it('widens a fully-erased object to Record<string, unknown> ({} and object are different types)', () => {
    const {root} = norm({
      kind: 'object',
      props: [
        {name: 'm', optional: false, readonly: false, method: true, shape: {kind: 'function', params: [], ret: {kind: 'null'}}},
      ],
    });
    expect(root).toEqual({kind: 'record', value: {kind: 'unknown'}});
  });

  it('inlines enum refs to their literal-value union and erases class refs (nominal)', () => {
    const decls: GeneratedType['decls'] = [
      {
        kind: 'enum',
        name: 'E0',
        members: [
          {name: 'M0', value: 'e0'},
          {name: 'M1', value: 'e1'},
        ],
      },
      {kind: 'enum', name: 'E1', members: [{name: 'M0'}, {name: 'M1'}, {name: 'M2'}]},
      {kind: 'class', name: 'C0', props: []},
    ];
    expect(norm({kind: 'ref', name: 'E0'}, decls).root).toEqual({
      kind: 'union',
      members: [
        {kind: 'literal', value: 'e0'},
        {kind: 'literal', value: 'e1'},
      ],
    });
    expect(norm({kind: 'ref', name: 'E1'}, decls).root).toEqual({
      kind: 'union',
      members: [
        {kind: 'literal', value: 0},
        {kind: 'literal', value: 1},
        {kind: 'literal', value: 2},
      ],
    });
    expect(norm({kind: 'ref', name: 'C0'}, decls).root).toEqual({kind: 'string'});
  });

  it('keeps reachable interfaces as normalized $defs and prunes unreached ones', () => {
    const decls: GeneratedType['decls'] = [
      {
        kind: 'interface',
        name: 'N0',
        props: [
          {name: 'next', optional: true, readonly: true, method: false, shape: {kind: 'ref', name: 'N0'}},
          {name: 'v', optional: false, readonly: false, method: false, shape: {kind: 'bigint'}},
        ],
      },
      {
        kind: 'interface',
        name: 'N1',
        props: [{name: 'x', optional: false, readonly: false, method: false, shape: {kind: 'string'}}],
      },
    ];
    const result = norm({kind: 'array', elem: {kind: 'ref', name: 'N0'}}, decls);
    expect(result.defs).toEqual([
      {
        name: 'N0',
        props: [
          {name: 'next', optional: true, readonly: false, method: false, shape: {kind: 'ref', name: 'N0'}},
          {name: 'v', optional: false, readonly: false, method: false, shape: {kind: 'number'}},
        ],
      },
    ]);
  });
});

describe('renderSchemaLiteral — draft 2020-12 spellings', () => {
  it('scalars, literals, unknown and never', () => {
    expect(renderSchemaLiteral(norm({kind: 'number'}))).toBe(`{type: 'number'}`);
    expect(renderSchemaLiteral(norm({kind: 'literal', value: 'on'}))).toBe(`{const: "on"}`);
    expect(renderSchemaLiteral(norm({kind: 'literal', value: 7}))).toBe(`{const: 7}`);
    expect(renderSchemaLiteral(norm({kind: 'literal', value: false}))).toBe(`{const: false}`);
    expect(renderSchemaLiteral(norm({kind: 'unknown'}))).toBe(`{}`);
    expect(renderSchemaLiteral(norm({kind: 'never'}))).toBe(`{enum: []}`);
  });

  it('containers: array, closed tuple, record, union, intersection', () => {
    expect(renderSchemaLiteral(norm({kind: 'array', elem: {kind: 'string'}}))).toBe(`{type: 'array', items: {type: 'string'}}`);
    expect(renderSchemaLiteral(norm({kind: 'tuple', elems: [{kind: 'string'}, {kind: 'number'}]}))).toBe(
      `{type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], minItems: 2, items: false}`
    );
    expect(renderSchemaLiteral(norm({kind: 'record', value: {kind: 'null'}}))).toBe(
      `{type: 'object', additionalProperties: {type: 'null'}}`
    );
    expect(renderSchemaLiteral(norm({kind: 'union', members: [{kind: 'string'}, {kind: 'number'}]}))).toBe(
      `{anyOf: [{type: 'string'}, {type: 'number'}]}`
    );
    expect(
      renderSchemaLiteral(
        norm({
          kind: 'intersection',
          members: [
            {kind: 'object', props: [{name: 'a', optional: false, readonly: false, method: false, shape: {kind: 'string'}}]},
            {kind: 'object', props: [{name: 'b', optional: true, readonly: false, method: false, shape: {kind: 'number'}}]},
          ],
        })
      )
    ).toBe(
      `{allOf: [{type: 'object', properties: {"a": {type: 'string'}}, required: ["a"]}, {type: 'object', properties: {"b": {type: 'number'}}}]}`
    );
  });

  it('objects: required inversion, weird keys quoted, mixed index form', () => {
    expect(
      renderSchemaLiteral(
        norm({
          kind: 'object',
          props: [
            {name: 'has space', optional: false, readonly: false, method: false, shape: {kind: 'boolean'}},
            {name: 'opt', optional: true, readonly: false, method: false, shape: {kind: 'null'}},
          ],
        })
      )
    ).toBe(`{type: 'object', properties: {"has space": {type: 'boolean'}, "opt": {type: 'null'}}, required: ["has space"]}`);
    expect(
      renderSchemaLiteral(
        norm({
          kind: 'object',
          props: [{name: 'p0', optional: false, readonly: false, method: false, shape: {kind: 'string'}}],
          index: {kind: 'string'},
          indexKey: ['string'],
        })
      )
    ).toBe(`{type: 'object', properties: {"p0": {type: 'string'}}, required: ["p0"], additionalProperties: {type: 'string'}}`);
  });

  it('flags only container-entry reuse (the open entry-point-anchoring class)', () => {
    const prop = (name: string, shape: TypeShape, optional = false) => ({name, optional, readonly: false, method: false, shape});
    const arrOfRef: TypeShape = {kind: 'array', elem: {kind: 'ref', name: 'N0'}};
    const recursiveDef = (shapes: TypeShape[]): GeneratedType['decls'] => [
      {kind: 'interface', name: 'N0', props: shapes.map((shape, i) => prop(`p${i}`, shape, i === 0))},
    ];
    // Entry through a container that also appears inside the cycle → flagged
    // (seeds 1662213203 / 2140920747 / 2144068665 of base 20260730 are this shape).
    expect(
      hasContainerEntryReuse(toSchemaExpressible({decls: recursiveDef([arrOfRef]), root: {kind: 'record', value: arrOfRef}}))
    ).toBe(true);
    // Knot entry (root IS the recursive ref) → the Go depth fix covers it, not flagged.
    expect(
      hasContainerEntryReuse(toSchemaExpressible({decls: recursiveDef([arrOfRef, arrOfRef]), root: {kind: 'ref', name: 'N0'}}))
    ).toBe(false);
    // Root-only repetition (no container inside the cycle) → converges, not flagged.
    expect(
      hasContainerEntryReuse(
        toSchemaExpressible({
          decls: recursiveDef([{kind: 'ref', name: 'N0'}]),
          root: {kind: 'object', props: [prop('a', arrOfRef), prop('b', arrOfRef)]},
        })
      )
    ).toBe(false);
    // Entry container differs from the cycle's internal container → converges, not flagged.
    expect(
      hasContainerEntryReuse(
        toSchemaExpressible({
          decls: recursiveDef([{kind: 'object', props: [prop('v', {kind: 'ref', name: 'N0'})]}]),
          root: {kind: 'record', value: arrOfRef},
        })
      )
    ).toBe(false);
  });

  it('recursive interfaces render as $defs + $ref (root ref splices into the $defs block)', () => {
    const decls: GeneratedType['decls'] = [
      {
        kind: 'interface',
        name: 'N0',
        props: [
          {name: 'value', optional: false, readonly: false, method: false, shape: {kind: 'number'}},
          {name: 'next', optional: true, readonly: false, method: false, shape: {kind: 'ref', name: 'N0'}},
        ],
      },
    ];
    expect(renderSchemaLiteral(norm({kind: 'ref', name: 'N0'}, decls))).toBe(
      `{$defs: {N0: {type: 'object', properties: {"value": {type: 'number'}, "next": {$ref: '#/$defs/N0'}}, required: ["value"]}}, $ref: '#/$defs/N0'}`
    );
    expect(renderSchemaLiteral(norm({kind: 'array', elem: {kind: 'ref', name: 'N0'}}, decls))).toBe(
      `{$defs: {N0: {type: 'object', properties: {"value": {type: 'number'}, "next": {$ref: '#/$defs/N0'}}, required: ["value"]}}, type: 'array', items: {$ref: '#/$defs/N0'}}`
    );
  });
});
