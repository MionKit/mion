// Reflecting the class would invalidate the absent-graph assertion; pair marker forms on a DTO instead (AGENTS.md).
// Registration needs a minification-safe class name card, never the reflection graph.

import {afterEach, describe, expect, it} from 'vitest';
import {createJsonEncoderFn, createJsonDecoderFn, getRunTypeId} from '@mionjs/run-types';
import {registerClassSerializer, getRTUtils, getRTFnCaches} from '@mionjs/run-types/runtime';
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
