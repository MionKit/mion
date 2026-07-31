import * as TF from '@ts-runtypes/core/formats';
import type {SerializationCase} from './types.ts';
import * as RT from '@ts-runtypes/core/schema';
import '@ts-runtypes/core/formats';
import {
  createBinaryDecoderFn,
  createBinaryEncoderFn,
  createJsonDecoderFn,
  createJsonEncoderFn,
  registerClassSerializer,
} from '@ts-runtypes/core';

// Real-world DTOs whose fields carry type-formats, taken to the wire. A format brand
// (uuid / email) constrains validation only — on the wire it is the plain underlying
// string — so the JSON and binary round-trips are symmetric. The order adds a `Date`
// (placedAt) that survives the JSON trip and packs into binary. Every thunk is
// SELF-DECLARING: the `interface` (with its branded format fields) is written inside
// the thunk body, so the doc-gen extracts a real, self-contained snippet.

export const REALWORLD = {
  user: {
    title: 'User',
    description:
      'A DTO whose id is a `TF.UUIDv4` and email a `TF.Email`, both serialising as their plain underlying string so the round-trip is symmetric on every strategy.',
    serializeNotes: 'Format brands are a validation-time constraint only — on the wire they are plain strings.',
    mutateEncoder: () => {
      interface User {
        id: TF.UUIDv4;
        name: string;
        email: TF.Email;
      }
      return createJsonEncoderFn<User>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface User {
        id: TF.UUIDv4;
        name: string;
        email: TF.Email;
      }
      return createJsonEncoderFn<User>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface User {
        id: TF.UUIDv4;
        name: string;
        email: TF.Email;
      }
      return createJsonEncoderFn<User>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      interface User {
        id: TF.UUIDv4;
        name: string;
        email: TF.Email;
      }
      return createJsonEncoderFn<User>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      interface User {
        id: TF.UUIDv4;
        name: string;
        email: TF.Email;
      }
      return createJsonDecoderFn<User>();
    },
    preserveDecoder: () => {
      interface User {
        id: TF.UUIDv4;
        name: string;
        email: TF.Email;
      }
      return createJsonDecoderFn<User>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      interface User {
        id: TF.UUIDv4;
        name: string;
        email: TF.Email;
      }
      return createJsonDecoderFn<User>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      interface User {
        id: TF.UUIDv4;
        name: string;
        email: TF.Email;
      }
      return createBinaryEncoderFn<User>();
    },
    binaryDecoder: () => {
      interface User {
        id: TF.UUIDv4;
        name: string;
        email: TF.Email;
      }
      return createBinaryDecoderFn<User>();
    },
    schemaEncoder: () => createJsonEncoderFn(RT.object({id: TF.uuidv4(), name: TF.string(), email: TF.email()})),
    schemaDecoder: () => createJsonDecoderFn(RT.object({id: TF.uuidv4(), name: TF.string(), email: TF.email()})),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.object({id: TF.uuidv4(), name: TF.string(), email: TF.email()})),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.object({id: TF.uuidv4(), name: TF.string(), email: TF.email()})),
    getTestData: () => ({
      values: [
        {id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f', name: 'Ada Lovelace', email: 'ada@example.com'},
        {id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff', name: 'Grace Hopper', email: 'grace@example.com'},
      ],
    }),
  },

  order: {
    title: 'Order',
    description:
      'A DTO mixing two formats, a `TF.UUIDv4` id and a `TF.Email` contact, with a numeric total, a `Date` placedAt and a string-literal status union.',
    serializeNotes: [
      '`placedAt` serialises to an ISO string and restores to a real `Date`.',
      'The uuid / email brands round-trip as plain strings through both JSON and binary.',
    ],
    mutateEncoder: () => {
      interface Order {
        id: TF.UUIDv4;
        email: TF.Email;
        total: number;
        placedAt: Date;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createJsonEncoderFn<Order>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface Order {
        id: TF.UUIDv4;
        email: TF.Email;
        total: number;
        placedAt: Date;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createJsonEncoderFn<Order>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface Order {
        id: TF.UUIDv4;
        email: TF.Email;
        total: number;
        placedAt: Date;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createJsonEncoderFn<Order>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      interface Order {
        id: TF.UUIDv4;
        email: TF.Email;
        total: number;
        placedAt: Date;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createJsonEncoderFn<Order>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      interface Order {
        id: TF.UUIDv4;
        email: TF.Email;
        total: number;
        placedAt: Date;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createJsonDecoderFn<Order>();
    },
    preserveDecoder: () => {
      interface Order {
        id: TF.UUIDv4;
        email: TF.Email;
        total: number;
        placedAt: Date;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createJsonDecoderFn<Order>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      interface Order {
        id: TF.UUIDv4;
        email: TF.Email;
        total: number;
        placedAt: Date;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createJsonDecoderFn<Order>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      interface Order {
        id: TF.UUIDv4;
        email: TF.Email;
        total: number;
        placedAt: Date;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createBinaryEncoderFn<Order>();
    },
    binaryDecoder: () => {
      interface Order {
        id: TF.UUIDv4;
        email: TF.Email;
        total: number;
        placedAt: Date;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createBinaryDecoderFn<Order>();
    },
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.object({
          id: TF.uuidv4(),
          email: TF.email(),
          total: TF.number(),
          placedAt: TF.date(),
          status: RT.union([RT.literal('pending'), RT.literal('paid'), RT.literal('shipped'), RT.literal('cancelled')]),
        })
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.object({
          id: TF.uuidv4(),
          email: TF.email(),
          total: TF.number(),
          placedAt: TF.date(),
          status: RT.union([RT.literal('pending'), RT.literal('paid'), RT.literal('shipped'), RT.literal('cancelled')]),
        })
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(
        RT.object({
          id: TF.uuidv4(),
          email: TF.email(),
          total: TF.number(),
          placedAt: TF.date(),
          status: RT.union([RT.literal('pending'), RT.literal('paid'), RT.literal('shipped'), RT.literal('cancelled')]),
        })
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(
        RT.object({
          id: TF.uuidv4(),
          email: TF.email(),
          total: TF.number(),
          placedAt: TF.date(),
          status: RT.union([RT.literal('pending'), RT.literal('paid'), RT.literal('shipped'), RT.literal('cancelled')]),
        })
      ),
    getTestData: () => ({
      values: [
        {
          id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff',
          email: 'ada@example.com',
          total: 78,
          placedAt: new Date('2024-01-02T03:04:05.000Z'),
          status: 'paid',
        },
        {
          id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f',
          email: 'grace@example.com',
          total: 0,
          placedAt: new Date('2024-06-15T00:00:00.000Z'),
          status: 'pending',
        },
      ],
    }),
  },
  // A registered user class whose fields carry type-formats — proving the class
  // serializer path composes with the format families (the currency field's uint16
  // bounds still pick the 2-byte binary width INSIDE the class body; the Date rides
  // its ISO arm) and reconstructs a real instance. Each thunk defines the class +
  // registerClassSerializer INLINE (self-declaring); value-first schema is
  // 'not-supported' (a class is not an `RT.*` model), so id-integrity skips it.
  invoice_currency_and_date: {
    title: 'Class with a currency-format field + Date',
    description:
      'A registered `Invoice` class carrying a `TF.Currency<{integer,min:0,max:65535}>` field and a Date. Reconstruction composes with the format families: the uint16 currency bounds pick the 2-byte binary width inside the class encode, the Date rides its ISO-string arm, and decode rebuilds a real Invoice.',
    serializeNotes:
      'Class serializer keyed by type id; the currency format still packs to 2 bytes on the binary wire inside the class body. Value-first schema is not-supported (a class is not an `RT.*` model).',
    mutateEncoder: () => {
      class Invoice {
        constructor(
          public ref: string,
          public cents: TF.Currency<{integer: true; min: 0; max: 65535}>,
          public issued: Date
        ) {}
        total(): number {
          return this.cents / 100;
        }
      }
      registerClassSerializer(Invoice, {deserialize: (d) => new Invoice(d.ref, d.cents, d.issued)});
      return createJsonEncoderFn<Invoice>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      class Invoice {
        constructor(
          public ref: string,
          public cents: TF.Currency<{integer: true; min: 0; max: 65535}>,
          public issued: Date
        ) {}
        total(): number {
          return this.cents / 100;
        }
      }
      registerClassSerializer(Invoice, {deserialize: (d) => new Invoice(d.ref, d.cents, d.issued)});
      return createJsonEncoderFn<Invoice>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      class Invoice {
        constructor(
          public ref: string,
          public cents: TF.Currency<{integer: true; min: 0; max: 65535}>,
          public issued: Date
        ) {}
        total(): number {
          return this.cents / 100;
        }
      }
      registerClassSerializer(Invoice, {deserialize: (d) => new Invoice(d.ref, d.cents, d.issued)});
      return createJsonEncoderFn<Invoice>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      class Invoice {
        constructor(
          public ref: string,
          public cents: TF.Currency<{integer: true; min: 0; max: 65535}>,
          public issued: Date
        ) {}
        total(): number {
          return this.cents / 100;
        }
      }
      registerClassSerializer(Invoice, {deserialize: (d) => new Invoice(d.ref, d.cents, d.issued)});
      return createJsonEncoderFn<Invoice>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      class Invoice {
        constructor(
          public ref: string,
          public cents: TF.Currency<{integer: true; min: 0; max: 65535}>,
          public issued: Date
        ) {}
        total(): number {
          return this.cents / 100;
        }
      }
      registerClassSerializer(Invoice, {deserialize: (d) => new Invoice(d.ref, d.cents, d.issued)});
      return createJsonDecoderFn<Invoice>();
    },
    preserveDecoder: () => {
      class Invoice {
        constructor(
          public ref: string,
          public cents: TF.Currency<{integer: true; min: 0; max: 65535}>,
          public issued: Date
        ) {}
        total(): number {
          return this.cents / 100;
        }
      }
      registerClassSerializer(Invoice, {deserialize: (d) => new Invoice(d.ref, d.cents, d.issued)});
      return createJsonDecoderFn<Invoice>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      class Invoice {
        constructor(
          public ref: string,
          public cents: TF.Currency<{integer: true; min: 0; max: 65535}>,
          public issued: Date
        ) {}
        total(): number {
          return this.cents / 100;
        }
      }
      registerClassSerializer(Invoice, {deserialize: (d) => new Invoice(d.ref, d.cents, d.issued)});
      return createJsonDecoderFn<Invoice>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      class Invoice {
        constructor(
          public ref: string,
          public cents: TF.Currency<{integer: true; min: 0; max: 65535}>,
          public issued: Date
        ) {}
        total(): number {
          return this.cents / 100;
        }
      }
      registerClassSerializer(Invoice, {deserialize: (d) => new Invoice(d.ref, d.cents, d.issued)});
      return createBinaryEncoderFn<Invoice>();
    },
    binaryDecoder: () => {
      class Invoice {
        constructor(
          public ref: string,
          public cents: TF.Currency<{integer: true; min: 0; max: 65535}>,
          public issued: Date
        ) {}
        total(): number {
          return this.cents / 100;
        }
      }
      registerClassSerializer(Invoice, {deserialize: (d) => new Invoice(d.ref, d.cents, d.issued)});
      return createBinaryDecoderFn<Invoice>();
    },
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    getTestData: () => {
      class Invoice {
        constructor(
          public ref: string,
          public cents: TF.Currency<{integer: true; min: 0; max: 65535}>,
          public issued: Date
        ) {}
        total(): number {
          return this.cents / 100;
        }
      }
      return {
        values: [
          new Invoice('A-1', 1999, new Date('2024-01-02T03:04:05.000Z')),
          new Invoice('B-2', 0, new Date('2020-12-31T00:00:00.000Z')),
        ],
      };
    },
  },
} as const satisfies Record<string, SerializationCase>;
