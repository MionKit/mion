// jsonsize regression: a union of object members rides the wire as ONE merged
// shape, so a property two members declare with different types is wrapped as
// `[<candidateIndex>,value]`. The `jsonMaxBytes` walk sized each member on its
// own and never charged those wrappers, so a bounded `Set` of such a union
// claimed 68 bytes while the encoder emitted 70:
//   [[-1,{"kind":"t2","f0":[2,null],"f1":[1,"1995-03-12T13:06:34.149Z"]}]]
// The same merge happens wherever the union sits, so a `Map` value, a `Map`
// key and a bare root are all checked here.
import {describe, it, expect} from 'vitest';
import {getRunType} from '@mionjs/run-types';
import {openClient, compileType, hasBinary} from './typeFuzzHarness.ts';
import {typecheckGeneratedType} from './tsValidate.ts';
import type {GeneratedType, PropShape, TypeShape} from '../core/typeGen.ts';

function prop(name: string, shape: TypeShape): PropShape {
  return {name, optional: false, readonly: false, method: false, shape};
}

/** The four arms the soak reported: `f0` is declared by three of them with a
 *  different type each, `f1` by two, so both gain a sub-envelope. `tag` keeps
 *  every case's union a DISTINCT type: identical shapes share a node id, and
 *  the same id read back from an earlier case's build carries that build's row
 *  (a nested union has no bound, only a root does). **/
const union4 = (tag: string): TypeShape => ({
  kind: 'union',
  members: [
    {
      kind: 'object',
      props: [
        prop('kind', {kind: 'literal', value: `t0-${tag}`}),
        prop('f0', {kind: 'object', props: [prop('p0', {kind: 'number'})]}),
      ],
    },
    {
      kind: 'object',
      props: [
        prop('kind', {kind: 'literal', value: `t1-${tag}`}),
        prop('f0', {kind: 'undefined'}),
        prop('f1', {kind: 'set', elem: {kind: 'null'}, structural: {maxItems: 3}}),
      ],
    },
    {
      kind: 'object',
      props: [prop('kind', {kind: 'literal', value: `t2-${tag}`}), prop('f0', {kind: 'null'}), prop('f1', {kind: 'date'})],
    },
    {kind: 'object', props: [prop('kind', {kind: 'literal', value: `t3-${tag}`})]},
  ],
});

/** The widest arm: three properties, two of them sub-wrapped, one a Date. **/
const widestArm = (tag: string) => ({kind: `t2-${tag}`, f0: null, f1: new Date('2018-03-26T05:49:26.862Z')});

const cases: {title: string; root: TypeShape; values: () => unknown[]}[] = [
  {
    title: 'Set<union of objects> (the reported shape)',
    root: {kind: 'set', elem: union4('set'), structural: {maxItems: 1}},
    values: () => [new Set([widestArm('set')]), new Set([{kind: 't1-set', f0: undefined, f1: new Set([null, null, null])}])],
  },
  {
    title: 'Map<string, union of objects>',
    root: {kind: 'map', key: {kind: 'format', name: 'maxLen8'}, value: union4('mapvalue'), structural: {maxItems: 1}},
    values: () => [new Map([['abcdefgh', widestArm('mapvalue')]])],
  },
  {
    title: 'Map<union of objects, number>',
    root: {kind: 'map', key: union4('mapkey'), value: {kind: 'number'}, structural: {maxItems: 1}},
    values: () => [new Map([[widestArm('mapkey'), -1.7976931348623157e308]])],
  },
  {
    title: 'a bare union of objects, no sized container',
    root: union4('bare'),
    values: () => [widestArm('bare')],
  },
  {
    title: 'array of a union of objects',
    root: {kind: 'array', elem: union4('array'), structural: {maxItems: 2}},
    values: () => [[widestArm('array'), widestArm('array')]],
  },
];

describe('jsonMaxBytes covers the flat-union merged-property envelope', () => {
  for (const {title, root, values} of cases) {
    (hasBinary() ? it : it.skip)(`the encoder never passes the bound: ${title}`, () => {
      const gen: GeneratedType = {decls: [], root};
      expect(typecheckGeneratedType(gen), `${title} must be valid TypeScript`).toEqual([]);
      const client = openClient();
      return compileType(client, gen)
        .then((compiled) => {
          expect(compiled.resolverError, compiled.resolverError).toBeUndefined();
          expect(compiled.evalError, compiled.evalError).toBeUndefined();
          const reflectionId = compiled.sites.find((site) => !site.fnId)?.id;
          expect(reflectionId, 'the type compiled no reflection root').toBeDefined();
          const bound = getRunType(undefined, reflectionId as never).jsonMaxBytes;
          expect(bound, 'the type must be fully bounded').toBeTypeOf('number');
          for (const value of values()) {
            const encoded = compiled.wired.jsonEncode!(value);
            expect(typeof encoded).toBe('string');
            const emitted = Buffer.byteLength(encoded as string, 'utf8');
            expect(emitted, `${encoded} is ${emitted} bytes, over the bound ${bound}`).toBeLessThanOrEqual(bound!);
          }
        })
        .finally(() => client.close());
    });
  }
});
