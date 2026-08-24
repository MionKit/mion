// cloning / LargeObjects — large shapes stressing the per-field rebuild
// cost: a 30-prop wide interface, five levels of nested arrays, and three
// union roots. The unions are object-bearing, which the clone pipeline
// rejects by design (CES001 alwaysThrow at factory creation — without
// runtime arm discrimination the emitter cannot know WHICH declared shape
// to rebuild). Supported cases keep values identical to the serialization
// suite and double as mild perf smoke tests.

import {createCloneExactShapeFn} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

interface WideRecord {
  id: number;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  score: number;
  rank: number;
  tag1: string;
  tag2: string;
  tag3: string;
  tag4: string;
  tag5: string;
  count1: number;
  count2: number;
  count3: number;
  flag1: boolean;
  flag2: boolean;
  flag3: boolean;
  big1: bigint;
  big2: bigint;
  alias: string;
  email: string;
  city: string;
  country: string;
  postal: string;
  width: number;
  height: number;
  weight: number;
  meta: {category: string; priority: number; lastSeen: Date};
}

interface ProductEvent {
  kind: 'product';
  id: string;
  sku: string;
  price: number;
  available: boolean;
  releasedAt: Date;
  stock: number;
}

interface UserEvent {
  kind: 'user';
  id: string;
  username: string;
  email: string;
  signedUpAt: Date;
  loginCount: number;
  isPremium: boolean;
}

interface OrderEvent {
  kind: 'order';
  id: string;
  total: number;
  itemCount: number;
  placedAt: Date;
  shipped: boolean;
  customerId: string;
}

interface PaymentEvent {
  kind: 'payment';
  id: string;
  amount: number;
  currency: string;
  processedAt: Date;
  refunded: boolean;
  txId: string;
}

interface SessionEvent {
  kind: 'session';
  id: string;
  userId: string;
  startedAt: Date;
  durationMs: number;
  ipHash: string;
  device: string;
}

type LargeObjectUnion = ProductEvent | UserEvent | OrderEvent | PaymentEvent | SessionEvent;

type MixedLargeUnion = string | number | ProductEvent | UserEvent;

interface DeepNestedLeaf {
  id: number;
  value: string;
  when: Date;
}

interface DeepNestedLevel5 {
  name: string;
  leaves: DeepNestedLeaf[];
}

interface DeepNestedLevel4 {
  label: string;
  children: DeepNestedLevel5[];
}

interface DeepNestedLevel3 {
  group: string;
  branches: DeepNestedLevel4[];
}

interface DeepNestedLevel2 {
  category: string;
  groups: DeepNestedLevel3[];
}

interface DeepNestedLevel1 {
  root: string;
  categories: DeepNestedLevel2[];
}

class LargeClassA {
  kind!: 'classA';
  alpha!: string;
  count!: number;
  flag!: boolean;
  when!: Date;
  total!: bigint;
  tags!: string[];
}

class LargeClassB {
  kind!: 'classB';
  beta!: string;
  ratio!: number;
  enabled!: boolean;
  releasedAt!: Date;
  score!: bigint;
  metadata!: {label: string; weight: number};
}

class LargeClassC {
  kind!: 'classC';
  gamma!: string;
  amount!: number;
  paid!: boolean;
  processedAt!: Date;
  txId!: string;
  steps!: number[];
}

type LargeClassUnion = LargeClassA | LargeClassB | LargeClassC;

export const LARGE_OBJECTS = {
  wide_interface: {
    title: 'Wide Interface',
    description:
      'A single interface with 30+ properties spanning scalars, Date, bigint, and a nested meta object rebuilds field by field, exercising the per-property walk cost without any union dispatch.',
    clone: () => createCloneExactShapeFn<WideRecord>(),
    getTestData: () => {
      const seed = 1;
      const record: WideRecord = {
        id: seed,
        name: `record-${seed}`,
        description: `Description for record ${seed} with extra body text`,
        createdAt: new Date('2024-01-15T12:00:00.000Z'),
        updatedAt: new Date('2024-06-15T12:00:00.000Z'),
        isActive: true,
        score: seed * 1.5,
        rank: seed % 100,
        tag1: `tag-a-${seed}`,
        tag2: `tag-b-${seed}`,
        tag3: `tag-c-${seed}`,
        tag4: `tag-d-${seed}`,
        tag5: `tag-e-${seed}`,
        count1: seed * 2,
        count2: seed * 3,
        count3: seed * 4,
        flag1: seed % 2 === 0,
        flag2: seed % 3 === 0,
        flag3: seed % 5 === 0,
        big1: BigInt(seed) * 1_000_000n,
        big2: BigInt(seed) * 9_999_999n,
        alias: `alias-${seed}`,
        email: `user${seed}@example.com`,
        city: 'Springfield',
        country: 'XX',
        postal: '00000',
        width: 1024,
        height: 768,
        weight: 12.5,
        meta: {category: 'default', priority: seed % 10, lastSeen: new Date('2024-12-01T00:00:00.000Z')},
      };
      return {values: [record]};
    },
  },
  object_union_5: {
    title: 'Object Union',
    description:
      'Five-member discriminated union of large event shapes — object-bearing unions are unsupported for cloning, so the factory throws CES001 at creation.',
    clone: () => createCloneExactShapeFn<LargeObjectUnion>(),
    getTestData: () => ({
      values: [
        {
          kind: 'product',
          id: 'p-1',
          sku: 'SKU-001',
          price: 19.99,
          available: true,
          releasedAt: new Date('2024-02-01T00:00:00.000Z'),
          stock: 42,
        } satisfies ProductEvent,
        {
          kind: 'user',
          id: 'u-1',
          username: 'alice',
          email: 'alice@example.com',
          signedUpAt: new Date('2024-03-01T00:00:00.000Z'),
          loginCount: 7,
          isPremium: true,
        } satisfies UserEvent,
        {
          kind: 'order',
          id: 'o-1',
          total: 99.5,
          itemCount: 3,
          placedAt: new Date('2024-04-01T00:00:00.000Z'),
          shipped: false,
          customerId: 'c-1',
        } satisfies OrderEvent,
        {
          kind: 'payment',
          id: 'pay-1',
          amount: 49.99,
          currency: 'USD',
          processedAt: new Date('2024-05-01T00:00:00.000Z'),
          refunded: false,
          txId: 'tx-1',
        } satisfies PaymentEvent,
        {
          kind: 'session',
          id: 's-1',
          userId: 'u-1',
          startedAt: new Date('2024-06-01T00:00:00.000Z'),
          durationMs: 12345,
          ipHash: 'abc123',
          device: 'mobile',
        } satisfies SessionEvent,
      ],
    }),
    factoryThrows: true,
  },
  mixed_union_atomic_and_large_objects: {
    title: 'Mixed Union',
    description:
      'A string | number | ProductEvent | UserEvent union mixes atomic members with two large object arms — still object-bearing, so the factory throws CES001 at creation.',
    clone: () => createCloneExactShapeFn<MixedLargeUnion>(),
    getTestData: () => ({
      values: [
        'just a string',
        42,
        {
          kind: 'product',
          id: 'p-9',
          sku: 'SKU-999',
          price: 49.5,
          available: false,
          releasedAt: new Date('2024-04-10T00:00:00.000Z'),
          stock: 0,
        } satisfies ProductEvent,
        {
          kind: 'user',
          id: 'u-9',
          username: 'bob',
          email: 'bob@example.com',
          signedUpAt: new Date('2024-04-11T00:00:00.000Z'),
          loginCount: 3,
          isPremium: false,
        } satisfies UserEvent,
      ],
    }),
    factoryThrows: true,
  },
  deep_nested: {
    title: 'Deep Nested',
    description:
      'Walks five levels of nested arrays of objects, rebuilding fresh objects and arrays at every level to amplify per-property overhead.',
    clone: () => createCloneExactShapeFn<DeepNestedLevel1>(),
    getTestData: () => {
      const leaf: DeepNestedLeaf = {id: 1, value: 'leaf', when: new Date('2024-01-01T00:00:00.000Z')};
      const level5: DeepNestedLevel5 = {name: 'l5', leaves: [leaf, leaf, leaf]};
      const level4: DeepNestedLevel4 = {label: 'l4', children: [level5, level5]};
      const level3: DeepNestedLevel3 = {group: 'l3', branches: [level4, level4]};
      const level2: DeepNestedLevel2 = {category: 'l2', groups: [level3, level3]};
      const level1: DeepNestedLevel1 = {root: 'l1', categories: [level2, level2]};
      return {values: [level1]};
    },
  },
  large_class_union: {
    title: 'Large Class Union',
    description:
      'Three-member union of large class instances — classes are object members too, so the clone factory throws CES001 at creation.',
    clone: () => createCloneExactShapeFn<LargeClassUnion>(),
    getTestData: () => {
      const a = new LargeClassA();
      a.kind = 'classA';
      a.alpha = 'alpha-value';
      a.count = 42;
      a.flag = true;
      a.when = new Date('2024-03-15T08:30:00.000Z');
      a.total = 10_000n;
      a.tags = ['x', 'y', 'z'];
      const b = new LargeClassB();
      b.kind = 'classB';
      b.beta = 'beta-value';
      b.ratio = 3.14;
      b.enabled = false;
      b.releasedAt = new Date('2024-07-20T10:00:00.000Z');
      b.score = 9_999_999_999n;
      b.metadata = {label: 'meta', weight: 1.5};
      const c = new LargeClassC();
      c.kind = 'classC';
      c.gamma = 'gamma-value';
      c.amount = 250;
      c.paid = true;
      c.processedAt = new Date('2024-08-25T12:30:00.000Z');
      c.txId = 'tx-abc';
      c.steps = [1, 2, 3];
      return {values: [a, b, c]};
    },
  },
} satisfies Record<string, CloningCase>;
