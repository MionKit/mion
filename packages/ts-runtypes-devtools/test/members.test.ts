// End-to-end member-type round-trip tests. Mirrors atomic.test.ts's
// `evalCacheFor` + `getTypeFor` setup. Each scenario has paired static
// (getRunTypeId<T>()) and reflect (getRunTypeId(v)) tests per the
// marker test coverage rule (CLAUDE.md). The recursive fixture is the
// critical cycle-safety proof — child slots must close on the root via
// referential equality after the virtual cache evaluates.

import {describe, expect} from 'vitest';
import {KIND_REF, ReflectionKind, type RunType} from '../src/protocol.ts';
import {evalCacheFor, getTypeFor, runTest} from './helpers/inline.ts';

describe('@ts-runtypes/devtools / member round-trip', () => {
  runTest(
    'array of string static',
    {
      'array.ts': `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<string[]>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertArrayOfString(cache);
    }
  );

  runTest(
    'array of string reflect',
    {
      'array.ts': `import {getRunTypeId} from '@ts-runtypes/core';
declare const xs: string[];
getRunTypeId(xs);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertArrayOfString(cache);
    }
  );

  function assertArrayOfString(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'array.ts');
    expect(root.kind).toBe(ReflectionKind.array);
    const elem = root.child as RunType;
    expect(elem).toBeDefined();
    expect(elem.kind).toBe(ReflectionKind.string);
  }

  runTest(
    'array of object literal static',
    {
      'arrobj.ts': `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<{x: number}[]>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertArrayOfObject(cache);
    }
  );

  runTest(
    'array of object literal reflect',
    {
      'arrobj.ts': `import {getRunTypeId} from '@ts-runtypes/core';
declare const xs: {x: number}[];
getRunTypeId(xs);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertArrayOfObject(cache);
    }
  );

  function assertArrayOfObject(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'arrobj.ts');
    expect(root.kind).toBe(ReflectionKind.array);
    const elem = root.child as RunType;
    expect(elem.kind).toBe(ReflectionKind.objectLiteral);
    const xProp = elem.children?.find((m) => m.name === 'x');
    expect(xProp).toBeDefined();
    expect(xProp!.kind).toBe(ReflectionKind.propertySignature);
    expect((xProp!.child as RunType).kind).toBe(ReflectionKind.number);
  }

  runTest(
    'array of array of string static',
    {
      'arrarr.ts': `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<string[][]>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertArrayOfArray(cache);
    }
  );

  runTest(
    'array of array of string reflect',
    {
      'arrarr.ts': `import {getRunTypeId} from '@ts-runtypes/core';
declare const xs: string[][];
getRunTypeId(xs);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertArrayOfArray(cache);
    }
  );

  function assertArrayOfArray(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'arrarr.ts');
    expect(root.kind).toBe(ReflectionKind.array);
    const inner = root.child as RunType;
    expect(inner.kind).toBe(ReflectionKind.array);
    expect((inner.child as RunType).kind).toBe(ReflectionKind.string);
  }

  // Cycle-safety proof for both forms. The footer emits
  // `t_<arrayId>.child = t_<treeId>;` so walking root → children → array →
  // element returns the SAME object as the root by reference.
  runTest(
    'recursive self type static closes cycle by reference',
    {
      'tree.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface Tree {
  children: Tree[];
}
getRunTypeId<Tree>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertRecursiveTreeCycle(cache);
    }
  );

  runTest(
    'recursive self type reflect closes cycle by reference',
    {
      'tree.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface Tree {
  children: Tree[];
}
declare const t: Tree;
getRunTypeId(t);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertRecursiveTreeCycle(cache);
    }
  );

  function assertRecursiveTreeCycle(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'tree.ts');
    expect(root.kind).toBe(ReflectionKind.objectLiteral);
    const childrenProp = root.children?.find((m) => m.name === 'children');
    expect(childrenProp).toBeDefined();
    const arr = childrenProp!.child as RunType;
    expect(arr.kind).toBe(ReflectionKind.array);
    const back = arr.child as RunType;
    expect(back).toBeDefined();
    expect(back.kind).not.toBe(KIND_REF);
    // Referential equality — the cache footer wired the same const reference
    // into both the root slot and the back-edge.
    expect(back).toBe(root);
  }
});
