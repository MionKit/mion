// Predefined example types for the playground, each available in THREE forms:
//   - `ts`: a plain TypeScript type (resolved via `createX<MyType>()`). Where it
//     helps, fields use type formats via a namespace import from
//     `ts-runtypes/formats` (TF.Email, TF.UUIDv4, TF.Positive, …) so typing `TF.`
//     autocompletes every format; it drives format-aware validate / mock / codegen.
//   - `builder`: the ts-runtypes/builders + ts-runtypes/formats form (resolved
//     via `createX(MyType)`), with its RT / TF imports written out just like the
//     type form, so both read like real code. Each closes with
//     `type <Name> = InferType<typeof MyType>` to show recovering the plain TS type
//     from the run-type (the builder counterpart to the `ts` form's `MyType`).
//   - `jsonSchema`: a real draft 2020-12 document through
//     `runTypeFromJsonSchema({…} as const)`: the same run-type call shape.
//     Where a `ts` field uses a format with no exact 2020-12 spelling the
//     document writes the CLOSEST keyword twin (`format: 'uuid'` is
//     version-agnostic where TF.UUIDv4 pins v4; `format: 'uri'` accepts any
//     scheme where TF.Url is the narrow web form), so the document stays honest
//     spec 2020-12 rather than pretending an exact equivalence.
// The mode switch toggles which form the editor shows. The shapes mirror the
// real-world DTO scenarios in the validation suite
// (packages/ts-runtypes/test/suites/validation/Realworld.ts).

export interface Preset {
  name: string;
  ts: string;
  builder: string;
  jsonSchema: string;
  // A matching sample value (JSON) for the input pane.
  input: string;
}

export const PRESETS: readonly Preset[] = [
  {
    name: 'Simple',
    ts: `type MyType = {
  id: number;
  name: string;
  tags: string[];
  active?: boolean;
};`,
    builder: `import * as RT from '@ts-runtypes/core/builders';
import * as TF from '@ts-runtypes/core/formats';
import { InferType } from '@ts-runtypes/core';

const MyType = RT.object({
  id: TF.number(),
  name: TF.string(),
  tags: RT.array(TF.string()),
  active: RT.optional(RT.boolean()),
});

type Simple = InferType<typeof MyType>;`,
    jsonSchema: `import { runTypeFromJsonSchema } from '@ts-runtypes/core/json-schema';
import { InferType } from '@ts-runtypes/core';

const MyType = runTypeFromJsonSchema({
  type: 'object',
  properties: {
    id: { type: 'number' },
    name: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    active: { type: 'boolean' },
  },
  required: ['id', 'name', 'tags'],
} as const);

type Simple = InferType<typeof MyType>;`,
    input: `{
  "id": 1,
  "name": "ada",
  "tags": ["math", "code"],
  "active": true
}`,
  },
  {
    name: 'User',
    ts: `import * as TF from '@ts-runtypes/core/formats';

type MyType = {
  id: TF.UUIDv4;
  email: TF.Email;
  name: string;
  age?: TF.PositiveInt;
  roles: ('admin' | 'editor' | 'user')[];
  active: boolean;
  createdAt: string;
};`,
    builder: `import * as RT from '@ts-runtypes/core/builders';
import * as TF from '@ts-runtypes/core/formats';
import { InferType } from '@ts-runtypes/core';

const MyType = RT.object({
  id: TF.uuidv4(),
  email: TF.email(),
  name: TF.string(),
  age: RT.optional(TF.positiveInt()),
  roles: RT.array(RT.union([RT.literal('admin'), RT.literal('editor'), RT.literal('user')])),
  active: RT.boolean(),
  createdAt: TF.string(),
});

type User = InferType<typeof MyType>;`,
    jsonSchema: `import { runTypeFromJsonSchema } from '@ts-runtypes/core/json-schema';
import { InferType } from '@ts-runtypes/core';

const MyType = runTypeFromJsonSchema({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    name: { type: 'string' },
    age: { type: 'integer', exclusiveMinimum: 0 },
    roles: { type: 'array', items: { enum: ['admin', 'editor', 'user'] } },
    active: { type: 'boolean' },
    createdAt: { type: 'string' },
  },
  required: ['id', 'email', 'name', 'roles', 'active', 'createdAt'],
} as const);

type User = InferType<typeof MyType>;`,
    input: `{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "email": "ann@example.com",
  "name": "Ann",
  "age": 30,
  "roles": ["user"],
  "active": true,
  "createdAt": "2024-01-02"
}`,
  },
  {
    name: 'Order',
    ts: `import * as TF from '@ts-runtypes/core/formats';

type MyType = {
  id: string;
  customer: { id: number; email: TF.Email };
  items: { sku: string; name: string; qty: number; price: TF.Positive }[];
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  total: TF.Positive;
  note?: string;
};`,
    builder: `import * as RT from '@ts-runtypes/core/builders';
import * as TF from '@ts-runtypes/core/formats';
import { InferType } from '@ts-runtypes/core';

const MyType = RT.object({
  id: TF.string(),
  customer: RT.object({ id: TF.number(), email: TF.email() }),
  items: RT.array(
    RT.object({ sku: TF.string(), name: TF.string(), qty: TF.number(), price: TF.positive() })
  ),
  status: RT.union([
    RT.literal('pending'),
    RT.literal('paid'),
    RT.literal('shipped'),
    RT.literal('delivered'),
    RT.literal('cancelled'),
  ]),
  total: TF.positive(),
  note: RT.optional(TF.string()),
});

type Order = InferType<typeof MyType>;`,
    jsonSchema: `import { runTypeFromJsonSchema } from '@ts-runtypes/core/json-schema';
import { InferType } from '@ts-runtypes/core';

const MyType = runTypeFromJsonSchema({
  type: 'object',
  properties: {
    id: { type: 'string' },
    customer: {
      type: 'object',
      properties: { id: { type: 'number' }, email: { type: 'string', format: 'email' } },
      required: ['id', 'email'],
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sku: { type: 'string' },
          name: { type: 'string' },
          qty: { type: 'number' },
          price: { type: 'number', exclusiveMinimum: 0 },
        },
        required: ['sku', 'name', 'qty', 'price'],
      },
    },
    status: { enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'] },
    total: { type: 'number', exclusiveMinimum: 0 },
    note: { type: 'string' },
  },
  required: ['id', 'customer', 'items', 'status', 'total'],
} as const);

type Order = InferType<typeof MyType>;`,
    input: `{
  "id": "ord_1001",
  "customer": { "id": 7, "email": "ann@example.com" },
  "items": [{ "sku": "SKU-1", "name": "Widget", "qty": 2, "price": 9.99 }],
  "status": "paid",
  "total": 19.98
}`,
  },
  {
    name: 'BlogPost',
    ts: `import * as TF from '@ts-runtypes/core/formats';

type MyType = {
  id: number;
  title: string;
  slug: string;
  tags: string[];
  author: { name: string; email: TF.Email };
  published: boolean;
  meta: { views: TF.Integer; likes: TF.Integer };
};`,
    builder: `import * as RT from '@ts-runtypes/core/builders';
import * as TF from '@ts-runtypes/core/formats';
import { InferType } from '@ts-runtypes/core';

const MyType = RT.object({
  id: TF.number(),
  title: TF.string(),
  slug: TF.string(),
  tags: RT.array(TF.string()),
  author: RT.object({ name: TF.string(), email: TF.email() }),
  published: RT.boolean(),
  meta: RT.object({ views: TF.integer(), likes: TF.integer() }),
});

type BlogPost = InferType<typeof MyType>;`,
    jsonSchema: `import { runTypeFromJsonSchema } from '@ts-runtypes/core/json-schema';
import { InferType } from '@ts-runtypes/core';

const MyType = runTypeFromJsonSchema({
  type: 'object',
  properties: {
    id: { type: 'number' },
    title: { type: 'string' },
    slug: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    author: {
      type: 'object',
      properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' } },
      required: ['name', 'email'],
    },
    published: { type: 'boolean' },
    meta: {
      type: 'object',
      properties: { views: { type: 'integer' }, likes: { type: 'integer' } },
      required: ['views', 'likes'],
    },
  },
  required: ['id', 'title', 'slug', 'tags', 'author', 'published', 'meta'],
} as const);

type BlogPost = InferType<typeof MyType>;`,
    input: `{
  "id": 42,
  "title": "Hello RunTypes",
  "slug": "hello-runtypes",
  "tags": ["typescript", "validation"],
  "author": { "name": "Ann", "email": "ann@example.com" },
  "published": true,
  "meta": { "views": 1200, "likes": 88 }
}`,
  },
  {
    name: 'Product',
    ts: `import * as TF from '@ts-runtypes/core/formats';

type MyType = {
  id: string;
  name: string;
  price: TF.Positive;
  url: TF.Url;
  currency: 'USD' | 'EUR' | 'GBP';
  inStock: boolean;
  categories: string[];
};`,
    builder: `import * as RT from '@ts-runtypes/core/builders';
import * as TF from '@ts-runtypes/core/formats';
import { InferType } from '@ts-runtypes/core';

const MyType = RT.object({
  id: TF.string(),
  name: TF.string(),
  price: TF.positive(),
  url: TF.url(),
  currency: RT.union([RT.literal('USD'), RT.literal('EUR'), RT.literal('GBP')]),
  inStock: RT.boolean(),
  categories: RT.array(TF.string()),
});

type Product = InferType<typeof MyType>;`,
    jsonSchema: `import { runTypeFromJsonSchema } from '@ts-runtypes/core/json-schema';
import { InferType } from '@ts-runtypes/core';

const MyType = runTypeFromJsonSchema({
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    price: { type: 'number', exclusiveMinimum: 0 },
    url: { type: 'string', format: 'uri' },
    currency: { enum: ['USD', 'EUR', 'GBP'] },
    inStock: { type: 'boolean' },
    categories: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'name', 'price', 'url', 'currency', 'inStock', 'categories'],
} as const);

type Product = InferType<typeof MyType>;`,
    input: `{
  "id": "prod_55",
  "name": "Mechanical Keyboard",
  "price": 129.95,
  "url": "https://shop.example.com/keyboard",
  "currency": "USD",
  "inStock": true,
  "categories": ["peripherals", "keyboards"]
}`,
  },
  {
    name: 'Tree',
    ts: `type MyType = {
  id: number;
  name: string;
  children: MyType[];
};`,
    // Value-first recursion: \`circular(…)\` with the \`self()\` marker marking the
    // back-edge (a const can't reference itself in its own initializer).
    builder: `import * as RT from '@ts-runtypes/core/builders';
import * as TF from '@ts-runtypes/core/formats';
import { InferType } from '@ts-runtypes/core';

const MyType = RT.circular(
  RT.object({
    id: TF.number(),
    name: TF.string(),
    children: RT.array(RT.self()),
  })
);

type Tree = InferType<typeof MyType>;`,
    jsonSchema: `import { runTypeFromJsonSchema } from '@ts-runtypes/core/json-schema';
import { InferType } from '@ts-runtypes/core';

const MyType = runTypeFromJsonSchema({
  type: 'object',
  properties: {
    id: { type: 'number' },
    name: { type: 'string' },
    children: { type: 'array', items: { $ref: '#' } },
  },
  required: ['id', 'name', 'children'],
} as const);

type Tree = InferType<typeof MyType>;`,
    input: `{
  id: 1,
  name: "root",
  children: [
    { id: 2, name: "docs", children: [] },
    {
      id: 3,
      name: "src",
      children: [{ id: 4, name: "index.ts", children: [] }],
    },
  ],
}`,
  },
];
