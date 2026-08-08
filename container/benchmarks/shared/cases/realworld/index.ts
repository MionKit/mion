// Real-world DTO scenarios — slim, marker-free copy. Only the named
// interfaces (imported by the ts-go / typia competitors) plus per-case
// samples remain; the createValidateFn / RT.* thunks are dropped so a
// competitor importing these never transitively pulls the marker package.

import type {SharedCase} from '../types.ts';

// ── Types (relational / CMS / API / form) ───────────────────────────────────

export interface User {
  id: number;
  email: string;
  name: string;
  age?: number;
  roles: ('admin' | 'editor' | 'user')[];
  active: boolean;
  createdAt: string;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface OrderItem {
  sku: string;
  name: string;
  qty: number;
  price: number;
}

export interface Order {
  id: string;
  customer: {id: number; email: string};
  items: OrderItem[];
  shipping: Address;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  total: number;
  note?: string;
}

export interface BlogPost {
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

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: 'USD' | 'EUR' | 'GBP';
  inStock: boolean;
  categories: string[];
  dimensions?: {width: number; height: number; depth: number};
}

export interface ProductPage {
  data: Product[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface RegistrationForm {
  email: string;
  password: string;
  acceptedTerms: true;
  profile: {firstName: string; lastName: string; age?: number};
}

// The DTO from moltar/typescript-runtime-type-benchmarks, verbatim. Carried here
// so our own suite covers the exact shape that published comparison measures,
// which is what makes its numbers reproducible against ours instead of only
// comparable in spirit. Deliberately unchanged: no formats, no optionals, no
// unions — a flat scalar record with one nested object.
export interface ToBeChecked {
  number: number;
  negNumber: number;
  maxNumber: number;
  string: string;
  longString: string;
  boolean: boolean;
  deeplyNested: {
    foo: string;
    num: number;
    bool: boolean;
  };
}

// ── Cases ────────────────────────────────────────────────────────────────────

const sampleUser = (over: Partial<User> = {}): User => ({
  id: 1,
  email: 'ann@example.com',
  name: 'Ann',
  roles: ['user'],
  active: true,
  createdAt: '2024-01-02',
  ...over,
});

export const REALWORLD = {
  user: {
    getSamples: () => ({
      valid: [sampleUser(), sampleUser({age: 30, roles: ['admin', 'editor']})],
      invalid: [
        sampleUser({roles: ['superuser'] as never}),
        sampleUser({id: '1' as never}),
        {email: 'x', name: 'x', roles: [], active: true, createdAt: 'x'},
        null,
        'not-an-object', // root type mismatch — a string where an object is expected (fails at root)
        42, // root type mismatch — a number where an object is expected (fails at root)
      ],
    }),
  },
  order: {
    getSamples: () => {
      const shipping: Address = {street: '1 Main', city: 'Springfield', state: 'IL', zip: '00001', country: 'US'};
      const ok: Order = {
        id: 'ord_1',
        customer: {id: 1, email: 'ann@example.com'},
        items: [{sku: 'A1', name: 'Widget', qty: 2, price: 9.99}],
        shipping,
        status: 'paid',
        total: 19.98,
      };
      return {
        valid: [ok, {...ok, note: 'gift', status: 'shipped' as const}],
        invalid: [
          {...ok, status: 'refunded'},
          {...ok, items: [{sku: 'A1', name: 'Widget', qty: 2}]},
          {...ok, customer: {id: 1}},
          {...ok, total: 'free'},
          null,
          'not-an-object', // root type mismatch — string where object expected (fails at root)
          42, // root type mismatch — number where object expected (fails at root)
        ],
      };
    },
  },
  blogPost: {
    getSamples: () => {
      const ok: BlogPost = {
        id: 1,
        title: 'Hello',
        slug: 'hello',
        body: '…',
        tags: ['intro'],
        author: {name: 'Ann', email: 'ann@example.com'},
        published: true,
        meta: {views: 10, likes: 2},
      };
      return {
        valid: [ok, {...ok, publishedAt: '2024-01-02'}],
        invalid: [{...ok, tags: [1, 2]}, {...ok, meta: {views: 10}}, {...ok, published: 'yes'}, null, 'not-an-object', 42], // last two: root type mismatch (fails at root)
      };
    },
  },
  product: {
    getSamples: () => {
      const ok: Product = {
        id: 'p1',
        name: 'Widget',
        description: 'A widget',
        price: 9.99,
        currency: 'USD',
        inStock: true,
        categories: ['tools'],
      };
      return {
        valid: [ok, {...ok, dimensions: {width: 1, height: 2, depth: 3}}],
        invalid: [{...ok, currency: 'JPY'}, {...ok, dimensions: {width: 1, height: 2}}, {...ok, price: '9.99'}, null, 'not-an-object', 42], // last two: root type mismatch (fails at root)
      };
    },
  },
  productPage: {
    getSamples: () => {
      const p: Product = {
        id: 'p1',
        name: 'Widget',
        description: 'A widget',
        price: 9.99,
        currency: 'USD',
        inStock: true,
        categories: ['tools'],
      };
      const ok: ProductPage = {data: [p], page: 1, pageSize: 20, total: 1, hasMore: false};
      return {
        valid: [ok, {data: [], page: 2, pageSize: 20, total: 0, hasMore: false}],
        invalid: [{...ok, data: [{...p, currency: 'JPY'}]}, {...ok, hasMore: 'no'}, {...ok, page: '1'}, null, 'not-an-object', 42], // last two: root type mismatch (fails at root)
      };
    },
  },
  registrationForm: {
    getSamples: () => {
      const ok: RegistrationForm = {
        email: 'ann@example.com',
        password: 'hunter2hunter2',
        acceptedTerms: true,
        profile: {firstName: 'Ann', lastName: 'Smith'},
      };
      return {
        valid: [ok, {...ok, profile: {...ok.profile, age: 30}}],
        invalid: [{...ok, acceptedTerms: false}, {...ok, profile: {firstName: 'Ann'}}, {...ok, password: 123456}, null, 'not-an-object', 42], // last two: root type mismatch (fails at root)
      };
    },
  },
  toBeChecked: {
    getSamples: () => {
      // The sample payload from moltar/typescript-runtime-type-benchmarks, kept
      // as-is (including the long string, which is what makes the string checks
      // non-trivial for validators that inspect content).
      const ok: ToBeChecked = {
        number: 1,
        negNumber: -1,
        maxNumber: Number.MAX_VALUE,
        string: 'string',
        longString:
          'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed vulputate elit, ' +
          'sed sagittis metus. Nullam consequat, ex ac dignissim commodo, eros nulla ' +
          'consequat lacus, nec facilisis nisi lorem sed ligula.',
        boolean: true,
        deeplyNested: {foo: 'bar', num: 1, bool: false},
      };
      return {
        valid: [ok, {...ok, number: 0, negNumber: -1e9, boolean: false, deeplyNested: {foo: '', num: -0.5, bool: true}}],
        invalid: [
          {...ok, number: '1'},
          {...ok, boolean: 'true'},
          {...ok, deeplyNested: {foo: 'bar', num: 1}},
          {...ok, deeplyNested: {foo: 'bar', num: 1, bool: 'false'}},
          {...ok, longString: 42},
          null,
          'not-an-object', // root type mismatch — string where object expected (fails at root)
          42, // root type mismatch — number where object expected (fails at root)
        ],
      };
    },
  },
  // Realworld cases carry samples only (no title/description) — mirror the old
  // src/suites/realworld plain-object typing; the runner reads getSamples alone.
} as const satisfies Record<string, Pick<SharedCase, 'getSamples'>>;
