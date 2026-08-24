// End-to-end circular-type round-trip tests. Adapted from
// circularRefs.spec.ts
// (ref: packages/run-types/src/nodes/collection/circularRefs.spec.ts).
//
// The reference spec exercises RT validation; this suite only proves the
// structural pipeline — the emit footer wires each circular shape into a
// graph that closes by *referential equality* once the virtual cache
// module evaluates, just like the reference runtime graph does.
//
// Each scenario has paired static (getRunTypeId<T>()) and reflect
// (getRunTypeId(v)) tests per the marker test coverage rule
// (CLAUDE.md).

import {describe, expect} from 'vitest';
import {ReflectionKind, type RunType} from '../src/protocol.ts';
import {evalCacheFor, getTypeFor, runTest} from './helpers/inline.ts';

describe('@ts-runtypes/devtools / circular round-trip', () => {
  // ---- circular object with optional self-reference ------------------------
  //
  //   interface Circular {
  //     n: number;
  //     s: string;
  //     c?: Circular;
  //     d?: Date;
  //   }

  runTest(
    'circular object static',
    {
      'circ.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface Circular {
  n: number;
  s: string;
  c?: Circular;
  d?: Date;
}
getRunTypeId<Circular>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertCircularObject(cache);
    }
  );

  runTest(
    'circular object reflect',
    {
      'circ.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface Circular {
  n: number;
  s: string;
  c?: Circular;
  d?: Date;
}
declare const value: Circular;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertCircularObject(cache);
    }
  );

  function assertCircularObject(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'circ.ts');
    expect(root.kind).toBe(ReflectionKind.objectLiteral);
    const cProp = root.children?.find((m) => m.name === 'c');
    expect(cProp).toBeDefined();
    expect(cProp!.optional).toBe(true);
    // The footer wired c.child to the same const reference as root.
    expect(cProp!.child as RunType).toBe(root);
    const dProp = root.children?.find((m) => m.name === 'd');
    expect(dProp).toBeDefined();
    expect(dProp!.optional).toBe(true);
    expect((dProp!.child as RunType).kind).toBe(ReflectionKind.class);
  }

  // ---- circular array + union ----------------------------------------------
  //
  //   type CuArray = (CuArray | Date | number | string)[];

  runTest(
    'circular array+union static',
    {
      'cuarr.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type CuArray = (CuArray | Date | number | string)[];
getRunTypeId<CuArray>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertCircularArrayUnion(cache);
    }
  );

  runTest(
    'circular array+union reflect',
    {
      'cuarr.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type CuArray = (CuArray | Date | number | string)[];
declare const value: CuArray;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertCircularArrayUnion(cache);
    }
  );

  function assertCircularArrayUnion(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'cuarr.ts');
    expect(root.kind).toBe(ReflectionKind.array);
    const union = root.child as RunType;
    expect(union.kind).toBe(ReflectionKind.union);
    // One union constituent must be the array itself (back-edge).
    const backEdges = union.children?.filter((m) => m === root) ?? [];
    expect(backEdges.length).toBe(1);
    // The other constituents must include Date, number, and string.
    expect(union.children?.some((m) => m.kind === ReflectionKind.class)).toBe(true);
    expect(union.children?.some((m) => m.kind === ReflectionKind.number)).toBe(true);
    expect(union.children?.some((m) => m.kind === ReflectionKind.string)).toBe(true);
  }

  // ---- circular object with tuple ------------------------------------------
  //
  //   interface CircularTuple {
  //     tuple: [bigint, CircularTuple?];
  //   }

  runTest(
    'circular tuple static',
    {
      'ctuple.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface CircularTuple {
  tuple: [bigint, CircularTuple?];
}
getRunTypeId<CircularTuple>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertCircularTuple(cache);
    }
  );

  runTest(
    'circular tuple reflect',
    {
      'ctuple.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface CircularTuple {
  tuple: [bigint, CircularTuple?];
}
declare const value: CircularTuple;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertCircularTuple(cache);
    }
  );

  function assertCircularTuple(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'ctuple.ts');
    expect(root.kind).toBe(ReflectionKind.objectLiteral);
    const tupleProp = root.children?.find((m) => m.name === 'tuple');
    expect(tupleProp).toBeDefined();
    const tuple = tupleProp!.child as RunType;
    expect(tuple.kind).toBe(ReflectionKind.tuple);
    expect(tuple.children?.length).toBe(2);
    const first = tuple.children![0];
    expect(first.kind).toBe(ReflectionKind.tupleMember);
    expect(first.position).toBe(0);
    expect((first.child as RunType).kind).toBe(ReflectionKind.bigint);
    const second = tuple.children![1];
    expect(second.kind).toBe(ReflectionKind.tupleMember);
    expect(second.optional).toBe(true);
    expect(second.position).toBe(1);
    // Back-edge through the optional tuple slot.
    expect(second.child as RunType).toBe(root);
  }

  // ---- circular object with index signature --------------------------------
  //
  //   interface CircularIndex {
  //     index: {[key: string]: CircularIndex};
  //   }

  runTest(
    'circular index signature static',
    {
      'cidx.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface CircularIndex {
  index: {[key: string]: CircularIndex};
}
getRunTypeId<CircularIndex>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertCircularIndex(cache);
    }
  );

  runTest(
    'circular index signature reflect',
    {
      'cidx.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface CircularIndex {
  index: {[key: string]: CircularIndex};
}
declare const value: CircularIndex;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertCircularIndex(cache);
    }
  );

  function assertCircularIndex(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'cidx.ts');
    expect(root.kind).toBe(ReflectionKind.objectLiteral);
    const indexProp = root.children?.find((m) => m.name === 'index');
    expect(indexProp).toBeDefined();
    const indexObj = indexProp!.child as RunType;
    expect(indexObj.kind).toBe(ReflectionKind.objectLiteral);
    const indexSig = indexObj.children?.find((m) => m.kind === ReflectionKind.indexSignature);
    expect(indexSig).toBeDefined();
    expect((indexSig!.index as RunType).kind).toBe(ReflectionKind.string);
    // Back-edge through the index-signature value slot.
    expect(indexSig!.child as RunType).toBe(root);
  }

  // ---- circular object with deep nested anonymous objects ------------------
  //
  //   interface CircularDeep {
  //     deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
  //   }

  runTest(
    'circular deep nested static',
    {
      'cdeep.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface CircularDeep {
  deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
}
getRunTypeId<CircularDeep>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertCircularDeep(cache);
    }
  );

  runTest(
    'circular deep nested reflect',
    {
      'cdeep.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface CircularDeep {
  deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
}
declare const value: CircularDeep;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertCircularDeep(cache);
    }
  );

  function assertCircularDeep(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'cdeep.ts');
    expect(root.kind).toBe(ReflectionKind.objectLiteral);
    const deep1 = walkProp(root, 'deep1');
    const deep2 = walkProp(deep1, 'deep2');
    const deep3 = walkProp(deep2, 'deep3');
    const deep4Prop = deep3.children?.find((m) => m.name === 'deep4');
    expect(deep4Prop).toBeDefined();
    expect(deep4Prop!.optional).toBe(true);
    // Back-edge through the optional deep4 slot.
    expect(deep4Prop!.child as RunType).toBe(root);
  }

  function walkProp(parent: RunType, name: string): RunType {
    const prop = parent.children?.find((m) => m.name === name);
    expect(prop).toBeDefined();
    const child = prop!.child as RunType;
    expect(child.kind).toBe(ReflectionKind.objectLiteral);
    return child;
  }

  // ---- nested + multiple circular ------------------------------------------
  //
  // Adapted from the `Interface with nested circular + multiple circular`
  // describe in interface.spec.ts:763. Three interleaved recursive shapes:
  //
  //   interface ICircularDeep {
  //     name: string;
  //     big: bigint;
  //     embedded: { hello: string; child?: ICircularDeep };
  //   }
  //   interface ICircularDate {
  //     date: Date;
  //     month: number;
  //     year: number;
  //     embedded?: ICircularDate;
  //     deep?: ICircularDeep;
  //   }
  //   interface RootCircular {
  //     isRoot: true;
  //     ciChild: ICircularDeep;
  //     ciRoort?: RootCircular;
  //     ciDate: ICircularDate;
  //   }
  //
  // Asserts every back-edge closes by `===` (no infinite expansion) and
  // that cross-references between the three shapes resolve to the same
  // canonical const each time.

  runTest(
    'nested + multiple circular static',
    {
      'nested.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface ICircularDeep {
  name: string;
  big: bigint;
  embedded: {
    hello: string;
    child?: ICircularDeep;
  };
}
interface ICircularDate {
  date: Date;
  month: number;
  year: number;
  embedded?: ICircularDate;
  deep?: ICircularDeep;
}
interface RootCircular {
  isRoot: true;
  ciChild: ICircularDeep;
  ciRoort?: RootCircular;
  ciDate: ICircularDate;
}
getRunTypeId<RootCircular>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertNestedAndMultipleCircular(cache);
    }
  );

  runTest(
    'nested + multiple circular reflect',
    {
      'nested.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface ICircularDeep {
  name: string;
  big: bigint;
  embedded: {
    hello: string;
    child?: ICircularDeep;
  };
}
interface ICircularDate {
  date: Date;
  month: number;
  year: number;
  embedded?: ICircularDate;
  deep?: ICircularDeep;
}
interface RootCircular {
  isRoot: true;
  ciChild: ICircularDeep;
  ciRoort?: RootCircular;
  ciDate: ICircularDate;
}
declare const value: RootCircular;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertNestedAndMultipleCircular(cache);
    }
  );

  function assertNestedAndMultipleCircular(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'nested.ts');
    expect(root.kind).toBe(ReflectionKind.objectLiteral);

    // isRoot: true literal
    const isRoot = root.children?.find((m) => m.name === 'isRoot');
    expect(isRoot).toBeDefined();
    const isRootChild = isRoot!.child as RunType;
    expect(isRootChild.kind).toBe(ReflectionKind.literal);
    expect(isRootChild.literal).toBe(true);

    // ciChild → ICircularDeep
    const ciChild = root.children?.find((m) => m.name === 'ciChild');
    expect(ciChild).toBeDefined();
    const icDeep = ciChild!.child as RunType;
    expect(icDeep.kind).toBe(ReflectionKind.objectLiteral);

    // ciRoort? → back-edge to root
    const ciRoort = root.children?.find((m) => m.name === 'ciRoort');
    expect(ciRoort).toBeDefined();
    expect(ciRoort!.optional).toBe(true);
    expect(ciRoort!.child as RunType).toBe(root);

    // ciDate → ICircularDate
    const ciDate = root.children?.find((m) => m.name === 'ciDate');
    expect(ciDate).toBeDefined();
    const icDate = ciDate!.child as RunType;
    expect(icDate.kind).toBe(ReflectionKind.objectLiteral);

    // Three distinct canonical objects.
    expect(icDeep).not.toBe(root);
    expect(icDate).not.toBe(root);
    expect(icDeep).not.toBe(icDate);

    // ICircularDeep internals: name, big, embedded.{hello, child? → icDeep}
    expect((icDeep.children?.find((m) => m.name === 'name')?.child as RunType).kind).toBe(ReflectionKind.string);
    expect((icDeep.children?.find((m) => m.name === 'big')?.child as RunType).kind).toBe(ReflectionKind.bigint);
    const embedded = icDeep.children?.find((m) => m.name === 'embedded');
    expect(embedded).toBeDefined();
    const embeddedObj = embedded!.child as RunType;
    expect(embeddedObj.kind).toBe(ReflectionKind.objectLiteral);
    expect((embeddedObj.children?.find((m) => m.name === 'hello')?.child as RunType).kind).toBe(ReflectionKind.string);
    const innerChild = embeddedObj.children?.find((m) => m.name === 'child');
    expect(innerChild).toBeDefined();
    expect(innerChild!.optional).toBe(true);
    expect(innerChild!.child as RunType).toBe(icDeep);

    // ICircularDate internals: date/Date, month, year, embedded? → icDate, deep? → icDeep
    expect((icDate.children?.find((m) => m.name === 'date')?.child as RunType).kind).toBe(ReflectionKind.class);
    expect((icDate.children?.find((m) => m.name === 'month')?.child as RunType).kind).toBe(ReflectionKind.number);
    expect((icDate.children?.find((m) => m.name === 'year')?.child as RunType).kind).toBe(ReflectionKind.number);
    const dateEmbedded = icDate.children?.find((m) => m.name === 'embedded');
    expect(dateEmbedded).toBeDefined();
    expect(dateEmbedded!.optional).toBe(true);
    expect(dateEmbedded!.child as RunType).toBe(icDate);
    const deep = icDate.children?.find((m) => m.name === 'deep');
    expect(deep).toBeDefined();
    expect(deep!.optional).toBe(true);
    expect(deep!.child as RunType).toBe(icDeep);
  }
});
