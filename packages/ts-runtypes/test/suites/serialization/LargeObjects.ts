import * as TF from '@ts-runtypes/core/formats';
import {createBinaryDecoderFn, createBinaryEncoderFn, createJsonDecoderFn, createJsonEncoderFn} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import type {SerializationCase} from './types.ts';

export const LARGE_OBJECTS = {
  wide_interface: {
    title: 'Wide Interface',
    description:
      'Single interface with 30+ properties spanning scalars, Date, bigint, and a nested object, exercising the per-field walk cost without any union dispatch.',
    serializeNotes:
      'The Date fields (`createdAt`/`updatedAt` and nested `meta.lastSeen`) JSON-encode to ISO strings and revive to Dates; the `big1`/`big2` bigints encode to decimal strings (rebuilt via `BigInt(...)`) on the JSON wire and take the binary string-fallback path.',
    mutateEncoder: () => {
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
      return createJsonEncoderFn<WideRecord>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
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
      return createJsonEncoderFn<WideRecord>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
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
      return createJsonEncoderFn<WideRecord>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
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
      return createJsonEncoderFn<WideRecord>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
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
      return createJsonDecoderFn<WideRecord>();
    },
    preserveDecoder: () => {
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
      return createJsonDecoderFn<WideRecord>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
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
      return createJsonDecoderFn<WideRecord>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
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
      return createBinaryEncoderFn<WideRecord>();
    },
    binaryDecoder: () => {
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
      return createBinaryDecoderFn<WideRecord>();
    },
    // WideRecord — 30 mixed-type props incl. Date, bigint, and a nested meta object.
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.object({
          id: TF.number(),
          name: TF.string(),
          description: TF.string(),
          createdAt: TF.date(),
          updatedAt: TF.date(),
          isActive: RT.boolean(),
          score: TF.number(),
          rank: TF.number(),
          tag1: TF.string(),
          tag2: TF.string(),
          tag3: TF.string(),
          tag4: TF.string(),
          tag5: TF.string(),
          count1: TF.number(),
          count2: TF.number(),
          count3: TF.number(),
          flag1: RT.boolean(),
          flag2: RT.boolean(),
          flag3: RT.boolean(),
          big1: TF.bigInt(),
          big2: TF.bigInt(),
          alias: TF.string(),
          email: TF.string(),
          city: TF.string(),
          country: TF.string(),
          postal: TF.string(),
          width: TF.number(),
          height: TF.number(),
          weight: TF.number(),
          meta: RT.object({category: TF.string(), priority: TF.number(), lastSeen: TF.date()}),
        })
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.object({
          id: TF.number(),
          name: TF.string(),
          description: TF.string(),
          createdAt: TF.date(),
          updatedAt: TF.date(),
          isActive: RT.boolean(),
          score: TF.number(),
          rank: TF.number(),
          tag1: TF.string(),
          tag2: TF.string(),
          tag3: TF.string(),
          tag4: TF.string(),
          tag5: TF.string(),
          count1: TF.number(),
          count2: TF.number(),
          count3: TF.number(),
          flag1: RT.boolean(),
          flag2: RT.boolean(),
          flag3: RT.boolean(),
          big1: TF.bigInt(),
          big2: TF.bigInt(),
          alias: TF.string(),
          email: TF.string(),
          city: TF.string(),
          country: TF.string(),
          postal: TF.string(),
          width: TF.number(),
          height: TF.number(),
          weight: TF.number(),
          meta: RT.object({category: TF.string(), priority: TF.number(), lastSeen: TF.date()}),
        })
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(
        RT.object({
          id: TF.number(),
          name: TF.string(),
          description: TF.string(),
          createdAt: TF.date(),
          updatedAt: TF.date(),
          isActive: RT.boolean(),
          score: TF.number(),
          rank: TF.number(),
          tag1: TF.string(),
          tag2: TF.string(),
          tag3: TF.string(),
          tag4: TF.string(),
          tag5: TF.string(),
          count1: TF.number(),
          count2: TF.number(),
          count3: TF.number(),
          flag1: RT.boolean(),
          flag2: RT.boolean(),
          flag3: RT.boolean(),
          big1: TF.bigInt(),
          big2: TF.bigInt(),
          alias: TF.string(),
          email: TF.string(),
          city: TF.string(),
          country: TF.string(),
          postal: TF.string(),
          width: TF.number(),
          height: TF.number(),
          weight: TF.number(),
          meta: RT.object({category: TF.string(), priority: TF.number(), lastSeen: TF.date()}),
        })
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(
        RT.object({
          id: TF.number(),
          name: TF.string(),
          description: TF.string(),
          createdAt: TF.date(),
          updatedAt: TF.date(),
          isActive: RT.boolean(),
          score: TF.number(),
          rank: TF.number(),
          tag1: TF.string(),
          tag2: TF.string(),
          tag3: TF.string(),
          tag4: TF.string(),
          tag5: TF.string(),
          count1: TF.number(),
          count2: TF.number(),
          count3: TF.number(),
          flag1: RT.boolean(),
          flag2: RT.boolean(),
          flag3: RT.boolean(),
          big1: TF.bigInt(),
          big2: TF.bigInt(),
          alias: TF.string(),
          email: TF.string(),
          city: TF.string(),
          country: TF.string(),
          postal: TF.string(),
          width: TF.number(),
          height: TF.number(),
          weight: TF.number(),
          meta: RT.object({category: TF.string(), priority: TF.number(), lastSeen: TF.date()}),
        })
      ),
    getTestData: () => {
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
      'Five-member discriminated union of distinct large event shapes where the flat encoder should win clearly, since non-flat runs a validate walk per candidate member.',
    mutateEncoder: () => {
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
      return createJsonEncoderFn<LargeObjectUnion>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
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
      return createJsonEncoderFn<LargeObjectUnion>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
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
      return createJsonEncoderFn<LargeObjectUnion>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
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
      return createJsonEncoderFn<LargeObjectUnion>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
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
      return createJsonDecoderFn<LargeObjectUnion>();
    },
    preserveDecoder: () => {
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
      return createJsonDecoderFn<LargeObjectUnion>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
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
      return createJsonDecoderFn<LargeObjectUnion>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
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
      return createBinaryEncoderFn<LargeObjectUnion>();
    },
    binaryDecoder: () => {
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
      return createBinaryDecoderFn<LargeObjectUnion>();
    },
    // Five-member discriminated union, each arm keyed by its `kind` literal.
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.union([
          RT.object({
            kind: RT.literal('product'),
            id: TF.string(),
            sku: TF.string(),
            price: TF.number(),
            available: RT.boolean(),
            releasedAt: TF.date(),
            stock: TF.number(),
          }),
          RT.object({
            kind: RT.literal('user'),
            id: TF.string(),
            username: TF.string(),
            email: TF.string(),
            signedUpAt: TF.date(),
            loginCount: TF.number(),
            isPremium: RT.boolean(),
          }),
          RT.object({
            kind: RT.literal('order'),
            id: TF.string(),
            total: TF.number(),
            itemCount: TF.number(),
            placedAt: TF.date(),
            shipped: RT.boolean(),
            customerId: TF.string(),
          }),
          RT.object({
            kind: RT.literal('payment'),
            id: TF.string(),
            amount: TF.number(),
            currency: TF.string(),
            processedAt: TF.date(),
            refunded: RT.boolean(),
            txId: TF.string(),
          }),
          RT.object({
            kind: RT.literal('session'),
            id: TF.string(),
            userId: TF.string(),
            startedAt: TF.date(),
            durationMs: TF.number(),
            ipHash: TF.string(),
            device: TF.string(),
          }),
        ])
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.union([
          RT.object({
            kind: RT.literal('product'),
            id: TF.string(),
            sku: TF.string(),
            price: TF.number(),
            available: RT.boolean(),
            releasedAt: TF.date(),
            stock: TF.number(),
          }),
          RT.object({
            kind: RT.literal('user'),
            id: TF.string(),
            username: TF.string(),
            email: TF.string(),
            signedUpAt: TF.date(),
            loginCount: TF.number(),
            isPremium: RT.boolean(),
          }),
          RT.object({
            kind: RT.literal('order'),
            id: TF.string(),
            total: TF.number(),
            itemCount: TF.number(),
            placedAt: TF.date(),
            shipped: RT.boolean(),
            customerId: TF.string(),
          }),
          RT.object({
            kind: RT.literal('payment'),
            id: TF.string(),
            amount: TF.number(),
            currency: TF.string(),
            processedAt: TF.date(),
            refunded: RT.boolean(),
            txId: TF.string(),
          }),
          RT.object({
            kind: RT.literal('session'),
            id: TF.string(),
            userId: TF.string(),
            startedAt: TF.date(),
            durationMs: TF.number(),
            ipHash: TF.string(),
            device: TF.string(),
          }),
        ])
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(
        RT.union([
          RT.object({
            kind: RT.literal('product'),
            id: TF.string(),
            sku: TF.string(),
            price: TF.number(),
            available: RT.boolean(),
            releasedAt: TF.date(),
            stock: TF.number(),
          }),
          RT.object({
            kind: RT.literal('user'),
            id: TF.string(),
            username: TF.string(),
            email: TF.string(),
            signedUpAt: TF.date(),
            loginCount: TF.number(),
            isPremium: RT.boolean(),
          }),
          RT.object({
            kind: RT.literal('order'),
            id: TF.string(),
            total: TF.number(),
            itemCount: TF.number(),
            placedAt: TF.date(),
            shipped: RT.boolean(),
            customerId: TF.string(),
          }),
          RT.object({
            kind: RT.literal('payment'),
            id: TF.string(),
            amount: TF.number(),
            currency: TF.string(),
            processedAt: TF.date(),
            refunded: RT.boolean(),
            txId: TF.string(),
          }),
          RT.object({
            kind: RT.literal('session'),
            id: TF.string(),
            userId: TF.string(),
            startedAt: TF.date(),
            durationMs: TF.number(),
            ipHash: TF.string(),
            device: TF.string(),
          }),
        ])
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(
        RT.union([
          RT.object({
            kind: RT.literal('product'),
            id: TF.string(),
            sku: TF.string(),
            price: TF.number(),
            available: RT.boolean(),
            releasedAt: TF.date(),
            stock: TF.number(),
          }),
          RT.object({
            kind: RT.literal('user'),
            id: TF.string(),
            username: TF.string(),
            email: TF.string(),
            signedUpAt: TF.date(),
            loginCount: TF.number(),
            isPremium: RT.boolean(),
          }),
          RT.object({
            kind: RT.literal('order'),
            id: TF.string(),
            total: TF.number(),
            itemCount: TF.number(),
            placedAt: TF.date(),
            shipped: RT.boolean(),
            customerId: TF.string(),
          }),
          RT.object({
            kind: RT.literal('payment'),
            id: TF.string(),
            amount: TF.number(),
            currency: TF.string(),
            processedAt: TF.date(),
            refunded: RT.boolean(),
            txId: TF.string(),
          }),
          RT.object({
            kind: RT.literal('session'),
            id: TF.string(),
            userId: TF.string(),
            startedAt: TF.date(),
            durationMs: TF.number(),
            ipHash: TF.string(),
            device: TF.string(),
          }),
        ])
      ),
    getTestData: () => {
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
      return {
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
      };
    },
  },
  mixed_union_atomic_and_large_objects: {
    title: 'Mixed Union',
    description:
      'A string | number | ProductEvent | UserEvent union that exercises the flat encoder atomic short-circuit alongside the merged-object envelope.',
    mutateEncoder: () => {
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
      type MixedLargeUnion = string | number | ProductEvent | UserEvent;
      return createJsonEncoderFn<MixedLargeUnion>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
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
      type MixedLargeUnion = string | number | ProductEvent | UserEvent;
      return createJsonEncoderFn<MixedLargeUnion>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
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
      type MixedLargeUnion = string | number | ProductEvent | UserEvent;
      return createJsonEncoderFn<MixedLargeUnion>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
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
      type MixedLargeUnion = string | number | ProductEvent | UserEvent;
      return createJsonEncoderFn<MixedLargeUnion>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
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
      type MixedLargeUnion = string | number | ProductEvent | UserEvent;
      return createJsonDecoderFn<MixedLargeUnion>();
    },
    preserveDecoder: () => {
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
      type MixedLargeUnion = string | number | ProductEvent | UserEvent;
      return createJsonDecoderFn<MixedLargeUnion>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
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
      type MixedLargeUnion = string | number | ProductEvent | UserEvent;
      return createJsonDecoderFn<MixedLargeUnion>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
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
      type MixedLargeUnion = string | number | ProductEvent | UserEvent;
      return createBinaryEncoderFn<MixedLargeUnion>();
    },
    binaryDecoder: () => {
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
      type MixedLargeUnion = string | number | ProductEvent | UserEvent;
      return createBinaryDecoderFn<MixedLargeUnion>();
    },
    // Mixed union — two atomic members alongside two large object arms.
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.union([
          TF.string(),
          TF.number(),
          RT.object({
            kind: RT.literal('product'),
            id: TF.string(),
            sku: TF.string(),
            price: TF.number(),
            available: RT.boolean(),
            releasedAt: TF.date(),
            stock: TF.number(),
          }),
          RT.object({
            kind: RT.literal('user'),
            id: TF.string(),
            username: TF.string(),
            email: TF.string(),
            signedUpAt: TF.date(),
            loginCount: TF.number(),
            isPremium: RT.boolean(),
          }),
        ])
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.union([
          TF.string(),
          TF.number(),
          RT.object({
            kind: RT.literal('product'),
            id: TF.string(),
            sku: TF.string(),
            price: TF.number(),
            available: RT.boolean(),
            releasedAt: TF.date(),
            stock: TF.number(),
          }),
          RT.object({
            kind: RT.literal('user'),
            id: TF.string(),
            username: TF.string(),
            email: TF.string(),
            signedUpAt: TF.date(),
            loginCount: TF.number(),
            isPremium: RT.boolean(),
          }),
        ])
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(
        RT.union([
          TF.string(),
          TF.number(),
          RT.object({
            kind: RT.literal('product'),
            id: TF.string(),
            sku: TF.string(),
            price: TF.number(),
            available: RT.boolean(),
            releasedAt: TF.date(),
            stock: TF.number(),
          }),
          RT.object({
            kind: RT.literal('user'),
            id: TF.string(),
            username: TF.string(),
            email: TF.string(),
            signedUpAt: TF.date(),
            loginCount: TF.number(),
            isPremium: RT.boolean(),
          }),
        ])
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(
        RT.union([
          TF.string(),
          TF.number(),
          RT.object({
            kind: RT.literal('product'),
            id: TF.string(),
            sku: TF.string(),
            price: TF.number(),
            available: RT.boolean(),
            releasedAt: TF.date(),
            stock: TF.number(),
          }),
          RT.object({
            kind: RT.literal('user'),
            id: TF.string(),
            username: TF.string(),
            email: TF.string(),
            signedUpAt: TF.date(),
            loginCount: TF.number(),
            isPremium: RT.boolean(),
          }),
        ])
      ),
    getTestData: () => {
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
      return {
        values: [
          // Atomic short-circuit arms.
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
      };
    },
  },
  deep_nested: {
    title: 'Deep Nested',
    description: 'Walks five levels of nested arrays of objects to amplify per-property overhead.',
    mutateEncoder: () => {
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
      return createJsonEncoderFn<DeepNestedLevel1>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
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
      return createJsonEncoderFn<DeepNestedLevel1>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
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
      return createJsonEncoderFn<DeepNestedLevel1>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
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
      return createJsonEncoderFn<DeepNestedLevel1>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
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
      return createJsonDecoderFn<DeepNestedLevel1>();
    },
    preserveDecoder: () => {
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
      return createJsonDecoderFn<DeepNestedLevel1>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
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
      return createJsonDecoderFn<DeepNestedLevel1>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
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
      return createBinaryEncoderFn<DeepNestedLevel1>();
    },
    binaryDecoder: () => {
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
      return createBinaryDecoderFn<DeepNestedLevel1>();
    },
    // Five levels of nested objects, each level holding an array of the next.
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.object({
          root: TF.string(),
          categories: RT.array(
            RT.object({
              category: TF.string(),
              groups: RT.array(
                RT.object({
                  group: TF.string(),
                  branches: RT.array(
                    RT.object({
                      label: TF.string(),
                      children: RT.array(
                        RT.object({
                          name: TF.string(),
                          leaves: RT.array(RT.object({id: TF.number(), value: TF.string(), when: TF.date()})),
                        })
                      ),
                    })
                  ),
                })
              ),
            })
          ),
        })
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.object({
          root: TF.string(),
          categories: RT.array(
            RT.object({
              category: TF.string(),
              groups: RT.array(
                RT.object({
                  group: TF.string(),
                  branches: RT.array(
                    RT.object({
                      label: TF.string(),
                      children: RT.array(
                        RT.object({
                          name: TF.string(),
                          leaves: RT.array(RT.object({id: TF.number(), value: TF.string(), when: TF.date()})),
                        })
                      ),
                    })
                  ),
                })
              ),
            })
          ),
        })
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(
        RT.object({
          root: TF.string(),
          categories: RT.array(
            RT.object({
              category: TF.string(),
              groups: RT.array(
                RT.object({
                  group: TF.string(),
                  branches: RT.array(
                    RT.object({
                      label: TF.string(),
                      children: RT.array(
                        RT.object({
                          name: TF.string(),
                          leaves: RT.array(RT.object({id: TF.number(), value: TF.string(), when: TF.date()})),
                        })
                      ),
                    })
                  ),
                })
              ),
            })
          ),
        })
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(
        RT.object({
          root: TF.string(),
          categories: RT.array(
            RT.object({
              category: TF.string(),
              groups: RT.array(
                RT.object({
                  group: TF.string(),
                  branches: RT.array(
                    RT.object({
                      label: TF.string(),
                      children: RT.array(
                        RT.object({
                          name: TF.string(),
                          leaves: RT.array(RT.object({id: TF.number(), value: TF.string(), when: TF.date()})),
                        })
                      ),
                    })
                  ),
                })
              ),
            })
          ),
        })
      ),
    getTestData: () => {
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
      'Three-member discriminated union of large class instances. These classes are UNREGISTERED, so decode returns plain objects; a registered class serializer would rebuild the instance.',
    serializeNotes:
      'Named class union members route through the flat union per-member INDEX dispatch (`[idx, value]`), not the merged `[-1, …]` object branch — so a registered class could reconstruct per member. Each carries Date (`when`/`releasedAt`/`processedAt`, ISO-string on the wire) and bigint (`total`/`score`, decimal-string on the wire) members; unregistered here, decode returns plain objects.',
    // The value-first schema builder models these as `RT.object(...)` (object
    // literals, which stay in the merged `[-1, …]` branch), while the type-first
    // side is a CLASS union that now routes per-member for potential
    // reconstruction. The two therefore diverge on the wire by design — the
    // schema surface cannot express a class — so skip the schema-equivalence
    // driver (round-trip + binary coverage still run).
    idDivergent: true,
    mutateEncoder: () => {
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
      return createJsonEncoderFn<LargeClassUnion>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
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
      return createJsonEncoderFn<LargeClassUnion>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
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
      return createJsonEncoderFn<LargeClassUnion>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
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
      return createJsonEncoderFn<LargeClassUnion>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
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
      return createJsonDecoderFn<LargeClassUnion>();
    },
    preserveDecoder: () => {
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
      return createJsonDecoderFn<LargeClassUnion>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
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
      return createJsonDecoderFn<LargeClassUnion>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
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
      return createBinaryEncoderFn<LargeClassUnion>();
    },
    binaryDecoder: () => {
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
      return createBinaryDecoderFn<LargeClassUnion>();
    },
    // Three-member class union modelled by its serialisable data shape
    // (class instances decode to plain objects), keyed by the `kind` literal.
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.union([
          RT.object({
            kind: RT.literal('classA'),
            alpha: TF.string(),
            count: TF.number(),
            flag: RT.boolean(),
            when: TF.date(),
            total: TF.bigInt(),
            tags: RT.array(TF.string()),
          }),
          RT.object({
            kind: RT.literal('classB'),
            beta: TF.string(),
            ratio: TF.number(),
            enabled: RT.boolean(),
            releasedAt: TF.date(),
            score: TF.bigInt(),
            metadata: RT.object({label: TF.string(), weight: TF.number()}),
          }),
          RT.object({
            kind: RT.literal('classC'),
            gamma: TF.string(),
            amount: TF.number(),
            paid: RT.boolean(),
            processedAt: TF.date(),
            txId: TF.string(),
            steps: RT.array(TF.number()),
          }),
        ])
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.union([
          RT.object({
            kind: RT.literal('classA'),
            alpha: TF.string(),
            count: TF.number(),
            flag: RT.boolean(),
            when: TF.date(),
            total: TF.bigInt(),
            tags: RT.array(TF.string()),
          }),
          RT.object({
            kind: RT.literal('classB'),
            beta: TF.string(),
            ratio: TF.number(),
            enabled: RT.boolean(),
            releasedAt: TF.date(),
            score: TF.bigInt(),
            metadata: RT.object({label: TF.string(), weight: TF.number()}),
          }),
          RT.object({
            kind: RT.literal('classC'),
            gamma: TF.string(),
            amount: TF.number(),
            paid: RT.boolean(),
            processedAt: TF.date(),
            txId: TF.string(),
            steps: RT.array(TF.number()),
          }),
        ])
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(
        RT.union([
          RT.object({
            kind: RT.literal('classA'),
            alpha: TF.string(),
            count: TF.number(),
            flag: RT.boolean(),
            when: TF.date(),
            total: TF.bigInt(),
            tags: RT.array(TF.string()),
          }),
          RT.object({
            kind: RT.literal('classB'),
            beta: TF.string(),
            ratio: TF.number(),
            enabled: RT.boolean(),
            releasedAt: TF.date(),
            score: TF.bigInt(),
            metadata: RT.object({label: TF.string(), weight: TF.number()}),
          }),
          RT.object({
            kind: RT.literal('classC'),
            gamma: TF.string(),
            amount: TF.number(),
            paid: RT.boolean(),
            processedAt: TF.date(),
            txId: TF.string(),
            steps: RT.array(TF.number()),
          }),
        ])
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(
        RT.union([
          RT.object({
            kind: RT.literal('classA'),
            alpha: TF.string(),
            count: TF.number(),
            flag: RT.boolean(),
            when: TF.date(),
            total: TF.bigInt(),
            tags: RT.array(TF.string()),
          }),
          RT.object({
            kind: RT.literal('classB'),
            beta: TF.string(),
            ratio: TF.number(),
            enabled: RT.boolean(),
            releasedAt: TF.date(),
            score: TF.bigInt(),
            metadata: RT.object({label: TF.string(), weight: TF.number()}),
          }),
          RT.object({
            kind: RT.literal('classC'),
            gamma: TF.string(),
            amount: TF.number(),
            paid: RT.boolean(),
            processedAt: TF.date(),
            txId: TF.string(),
            steps: RT.array(TF.number()),
          }),
        ])
      ),
    getTestData: () => {
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
      return {
        // Class instances decode to plain objects, so the expected references
        // are spreads (own enumerable props only, no prototype/class identity).
        values: [a, b, c],
        deserializedValues: [{...a}, {...b}, {...c}],
      };
    },
  },
} as const satisfies Record<string, SerializationCase>;
