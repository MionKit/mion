// cloning / Realworld — real-world shapes through the deep-clone contract.
// `payload` is a payload-shaped composition exercising every arm at once
// (nested object, array, Map, Date), the intended validate-then-clone
// pipeline shape; the generic asserts prove the clone shares no mutable
// reference with the input at ANY depth — which is exactly the guarantee
// that makes mutating the clone safe. The remaining cases mirror the
// serialization suite's realworld DTOs (the SAME relational / CMS / API /
// form shapes the realworld benchmark runs) case-for-case, so the cloning
// table lines up with serialization and the benchmark; their samples carry
// no undeclared keys, so only `payload` needs `expected`.

import {createCloneExactShapeFn} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

export interface Payload {
  id: number;
  nested: {tag: string; when: Date};
  tags: string[];
  index: Map<string, number>;
}

export function makePayload(extras: boolean): Payload {
  const payload: Payload = {
    id: 1,
    nested: {tag: 't', when: new Date('2021-05-06T07:08:09.000Z')},
    tags: ['a'],
    index: new Map([['k', 1]]),
  };
  if (extras) {
    (payload.nested as unknown as Record<string, unknown>).extra = 1;
    (payload as unknown as Record<string, unknown>).evil = true;
  }
  return payload;
}

interface User {
  id: number;
  email: string;
  name: string;
  age?: number;
  roles: ('admin' | 'editor' | 'user')[];
  active: boolean;
  createdAt: string;
}
interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}
interface OrderItem {
  sku: string;
  name: string;
  qty: number;
  price: number;
}
interface Order {
  id: string;
  customer: {id: number; email: string};
  items: OrderItem[];
  shipping: Address;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  total: number;
  note?: string;
}
interface BlogPost {
  id: number;
  title: string;
  slug: string;
  body: string;
  tags: string[];
  author: {name: string; email: string};
  published: boolean;
  publishedAt?: string;
  meta: {views: number; likes: number};
}
interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: 'USD' | 'EUR' | 'GBP';
  inStock: boolean;
  categories: string[];
  dimensions?: {width: number; height: number; depth: number};
}
interface ProductPage {
  data: Product[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}
interface RegistrationForm {
  email: string;
  password: string;
  acceptedTerms: true;
  profile: {firstName: string; lastName: string; age?: number};
}

export const REALWORLD = {
  payload: {
    title: 'API payload',
    description:
      'A realistic parse-output shape: nested object, tags array, Map index, Date stamp. Every mutable position of the clone is a fresh identity, so downstream code can mutate freely.',
    clone: () => createCloneExactShapeFn<Payload>(),
    getTestData: () => ({
      values: [makePayload(false), makePayload(true)],
      expected: [makePayload(false), makePayload(false)],
    }),
  },
  user: {
    title: 'User',
    description:
      'A relational user record — roles array and scalar fields rebuild onto a fresh object sharing nothing with the input.',
    clone: () => createCloneExactShapeFn<User>(),
    getTestData: () => ({values: [sampleUser(), sampleUser({age: 30, roles: ['admin', 'editor']})]}),
  },
  order: {
    title: 'Order',
    description:
      'A nested order — customer ref, line-item array, shipping address and optional note all clone with fresh identities at every depth.',
    clone: () => createCloneExactShapeFn<Order>(),
    getTestData: () => {
      const ok = makeOrder();
      return {values: [ok, {...ok, note: 'gift', status: 'shipped' as const}]};
    },
  },
  blogPost: {
    title: 'Blog post',
    description:
      'A CMS post — tags array, inline author and nested meta counters rebuild fresh, so mutating the clone never touches the input.',
    clone: () => createCloneExactShapeFn<BlogPost>(),
    getTestData: () => {
      const ok = makeBlogPost();
      return {values: [ok, {...ok, publishedAt: '2024-01-02'}]};
    },
  },
  product: {
    title: 'Product',
    description:
      'A catalog product — the categories array clones fresh and the optional nested dimensions object rebuilds when present, stays absent when absent.',
    clone: () => createCloneExactShapeFn<Product>(),
    getTestData: () => {
      const ok = makeProduct();
      return {values: [ok, {...ok, dimensions: {width: 1, height: 2, depth: 3}}]};
    },
  },
  productPage: {
    title: 'Product page',
    description: 'A paginated API response — every product in `data` rebuilds element-by-element alongside fresh page metadata.',
    clone: () => createCloneExactShapeFn<ProductPage>(),
    getTestData: () => {
      const ok: ProductPage = {data: [makeProduct()], page: 1, pageSize: 20, total: 1, hasMore: false};
      return {values: [ok, {data: [], page: 2, pageSize: 20, total: 0, hasMore: false}]};
    },
  },
  registrationForm: {
    title: 'Registration form',
    description:
      'A signup form — the nested profile (with its optional age) rebuilds fresh and the `acceptedTerms: true` literal carries through by value.',
    clone: () => createCloneExactShapeFn<RegistrationForm>(),
    getTestData: () => {
      const ok = makeRegistrationForm();
      return {values: [ok, {...ok, profile: {...ok.profile, age: 30}}]};
    },
  },
} satisfies Record<string, CloningCase>;

const sampleUser = (over: Partial<User> = {}): User => ({
  id: 1,
  email: 'ann@example.com',
  name: 'Ann',
  roles: ['user'],
  active: true,
  createdAt: '2024-01-02',
  ...over,
});
function makeOrder(): Order {
  return {
    id: 'ord_1',
    customer: {id: 1, email: 'ann@example.com'},
    items: [{sku: 'A1', name: 'Widget', qty: 2, price: 9.99}],
    shipping: {street: '1 Main', city: 'Springfield', state: 'IL', zip: '00001', country: 'US'},
    status: 'paid',
    total: 19.98,
  };
}
function makeBlogPost(): BlogPost {
  return {
    id: 1,
    title: 'Hello',
    slug: 'hello',
    body: '…',
    tags: ['intro'],
    author: {name: 'Ann', email: 'ann@example.com'},
    published: true,
    meta: {views: 10, likes: 2},
  };
}
function makeProduct(): Product {
  return {id: 'p1', name: 'Widget', description: 'A widget', price: 9.99, currency: 'USD', inStock: true, categories: ['tools']};
}
function makeRegistrationForm(): RegistrationForm {
  return {
    email: 'ann@example.com',
    password: 'hunter2hunter2',
    acceptedTerms: true,
    profile: {firstName: 'Ann', lastName: 'Smith'},
  };
}
