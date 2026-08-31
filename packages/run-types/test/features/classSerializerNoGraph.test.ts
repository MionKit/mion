// registerClassSerializer must NOT force the class's reflection graph.
//
// The registration site carries `InjectTypeFnArgs<T, 'csr'>`: the plugin
// injects a tiny classSerializerReg NAME CARD (family tag 'csr', its typeName
// slot holding the build-time class name) instead of the runtype entry tuple.
// This file deliberately contains NO reflection site for the class — only the
// registration and the JSON codec sites — so the assertions prove:
//
//   1. the custom serializer still routes end-to-end (register → encode →
//      decode → real instance), keyed by the card's type id;
//   2. the card entry is registered under the 'csr' family and carries the
//      source class name (the name-fallback lane's minification-safe key);
//   3. the class's runtype GRAPH is absent from the registry — the old
//      InjectRunTypeId form used to force it just to read one string.
//
// Marker coverage rule (CLAUDE.md): the suite also pairs both getRunTypeId
// call shapes on a plain DTO (NOT the class — reflecting the class would
// register the very graph assertion 3 proves absent) and asserts their hash
// equivalence.

import {afterEach, describe, expect, it} from 'vitest';
import {
  createJsonEncoderFn,
  createJsonDecoderFn,
  registerClassSerializer,
  getRunTypeId,
  getRTUtils,
  getRTFnCaches,
} from '@mionjs/run-types';
import {clearClassSerializers} from '../../src/runtypes/classSerializerRegistry.ts';
import {FN_HASH_LEN} from '../../src/runtypes/entryTuple.ts';

class NoGraphProbe {
  constructor(
    public amount: number,
    public tag: string
  ) {}
  describe(): string {
    return `${this.amount} ${this.tag}`;
  }
}

interface Envelope {
  probe: NoGraphProbe;
}

afterEach(() => clearClassSerializers());

// Locate the registered csr name card for this file's class and return its
// cache key + type id. The card key is `<csrHash>_<typeId>`.
function findProbeCard(): {key: string; typeId: string; typeName: string | undefined} {
  const {rtFnsCache} = getRTFnCaches();
  for (const key of Object.keys(rtFnsCache)) {
    const entry = rtFnsCache[key];
    if (entry && entry.familyTag === 'csr' && entry.typeName === 'NoGraphProbe') {
      return {key, typeId: key.slice(FN_HASH_LEN + 1), typeName: entry.typeName};
    }
  }
  throw new Error('no csr name card registered for NoGraphProbe');
}

describe('registerClassSerializer without a reflection graph', () => {
  it('routes the custom serializer end-to-end with only the csr card', () => {
    registerClassSerializer(NoGraphProbe, {
      deserialize: (data) => new NoGraphProbe(data.amount, data.tag),
    });
    const encode = createJsonEncoderFn<Envelope>();
    const decode = createJsonDecoderFn<Envelope>();
    const wire = encode({probe: new NoGraphProbe(7, 'seven')});
    const back = decode(wire as string);
    expect(back.probe).toBeInstanceOf(NoGraphProbe);
    expect((back.probe as NoGraphProbe).describe()).toBe('7 seven');
  });

  it('registers the csr name card carrying the source class name', () => {
    registerClassSerializer(NoGraphProbe, {
      deserialize: (data) => new NoGraphProbe(data.amount, data.tag),
    });
    const card = findProbeCard();
    expect(card.typeName).toBe('NoGraphProbe');
    expect(card.typeId.length).toBeGreaterThan(0);
  });

  it('does NOT register the class runtype graph', () => {
    registerClassSerializer(NoGraphProbe, {
      deserialize: (data) => new NoGraphProbe(data.amount, data.tag),
    });
    const card = findProbeCard();
    // The old InjectRunTypeId form forced the class's full type graph into the
    // registry just to read node.typeName; the csr card replaces it entirely.
    expect(getRTUtils().getRunType(card.typeId)).toBeUndefined();
  });

  it('getRunTypeId static and reflect forms converge (marker coverage pair)', () => {
    interface PlainDto {
      name: string;
      count: number;
    }
    const staticId = getRunTypeId<PlainDto>();
    const value: PlainDto = {name: 'x', count: 1};
    const reflectId = getRunTypeId(value);
    expect(reflectId).toBe(staticId);
  });
});
