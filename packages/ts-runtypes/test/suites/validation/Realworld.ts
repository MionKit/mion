import * as TF from '@ts-runtypes/core/formats';
import type {ValidationCase} from './types.ts';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createMockDataFn,
  createStandardSchema,
  type DataOnly,
} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

// Real-world DTO scenarios — the SAME relational / CMS / API / form shapes the
// realworld benchmark runs (container/benchmarks/shared/cases/realworld), so the suite table
// and the benchmark table line up case-for-case. The module interfaces below are the
// single source of truth; the `validate` thunk of each case redeclares its type INLINE
// (best-practice TS, and what the doc-gen extracts + renders in the hover), while the
// remaining thunks reference the module interfaces to keep these composed DTOs readable.

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
    title: 'User',
    description:
      'A relational user record with a numeric id, email, name, optional age, a roles union array, an active flag and a createdAt string.',
    validate: () => {
      interface User {
        id: number;
        email: string;
        name: string;
        age?: number;
        roles: ('admin' | 'editor' | 'user')[];
        active: boolean;
        createdAt: string;
      }
      return createValidateFn<User>();
    },
    standardSchema: () => createStandardSchema<User>(),
    // One hand-authored Standard Schema expectation per file. Every other case
    // derives its expected issues from getExpectedErrors via runTypeErrorsToIssues
    // (the same mapping the factory uses), so this single case pins the real
    // consumer-facing {message, path} output independently: it trips if error
    // generation or the issue mapping changes. One case per file covers this
    // file's shapes without the ~265x maintenance of authoring every case.
    getExpectedStandardErrors: () => [
      [{message: 'Expected union', path: ['roles', 0], expected: 'union'}],
      [{message: 'Expected number', path: ['id'], expected: 'number'}],
      [{message: 'Expected number', path: ['id'], expected: 'number'}],
      [{message: 'Expected objectLiteral', path: [], expected: 'objectLiteral'}],
      [{message: 'Expected objectLiteral', path: [], expected: 'objectLiteral'}],
      [{message: 'Expected objectLiteral', path: [], expected: 'objectLiteral'}],
    ],
    validateDataOnly: () => createValidateFn<DataOnly<User>>(),
    validateSchema: () =>
      createValidateFn(
        RT.object({
          id: TF.number(),
          email: TF.string(),
          name: TF.string(),
          age: RT.optional(TF.number()),
          roles: RT.array(RT.union([RT.literal('admin'), RT.literal('editor'), RT.literal('user')])),
          active: RT.boolean(),
          createdAt: TF.string(),
        })
      ),
    deserializeValidate: () => deserializeValidate<User>(),
    validateReflect: () => {
      const v: User = sampleUser();
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: User = sampleUser();
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<User>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<User>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.object({
          id: TF.number(),
          email: TF.string(),
          name: TF.string(),
          age: RT.optional(TF.number()),
          roles: RT.array(RT.union([RT.literal('admin'), RT.literal('editor'), RT.literal('user')])),
          active: RT.boolean(),
          createdAt: TF.string(),
        })
      ),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<User>(),
    getValidationErrorsReflect: () => {
      const v: User = sampleUser();
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: User = sampleUser();
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<User>(),
    mockTypeReflect: () => {
      const v: User = sampleUser();
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [sampleUser(), sampleUser({age: 30, roles: ['admin', 'editor']})],
      invalid: [
        sampleUser({roles: ['superuser'] as never}),
        sampleUser({id: '1' as never}),
        {email: 'x', name: 'x', roles: [], active: true, createdAt: 'x'},
        null,
        'not-an-object',
        42,
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['roles', 0], expected: 'union'}],
      [{path: ['id'], expected: 'number'}],
      [{path: ['id'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  order: {
    title: 'Order',
    description:
      'A nested order with an inline customer ref, an array of line items, a shipping address, a status union, a total, and an optional note.',
    validate: () => {
      interface OrderItem {
        sku: string;
        name: string;
        qty: number;
        price: number;
      }
      interface Address {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
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
      return createValidateFn<Order>();
    },
    standardSchema: () => createStandardSchema<Order>(),
    validateDataOnly: () => createValidateFn<DataOnly<Order>>(),
    validateSchema: () =>
      createValidateFn(
        RT.object({
          id: TF.string(),
          customer: RT.object({id: TF.number(), email: TF.string()}),
          items: RT.array(RT.object({sku: TF.string(), name: TF.string(), qty: TF.number(), price: TF.number()})),
          shipping: RT.object({
            street: TF.string(),
            city: TF.string(),
            state: TF.string(),
            zip: TF.string(),
            country: TF.string(),
          }),
          status: RT.union([
            RT.literal('pending'),
            RT.literal('paid'),
            RT.literal('shipped'),
            RT.literal('delivered'),
            RT.literal('cancelled'),
          ]),
          total: TF.number(),
          note: RT.optional(TF.string()),
        })
      ),
    deserializeValidate: () => deserializeValidate<Order>(),
    validateReflect: () => {
      const v: Order = makeOrder();
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: Order = makeOrder();
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<Order>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<Order>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.object({
          id: TF.string(),
          customer: RT.object({id: TF.number(), email: TF.string()}),
          items: RT.array(RT.object({sku: TF.string(), name: TF.string(), qty: TF.number(), price: TF.number()})),
          shipping: RT.object({
            street: TF.string(),
            city: TF.string(),
            state: TF.string(),
            zip: TF.string(),
            country: TF.string(),
          }),
          status: RT.union([
            RT.literal('pending'),
            RT.literal('paid'),
            RT.literal('shipped'),
            RT.literal('delivered'),
            RT.literal('cancelled'),
          ]),
          total: TF.number(),
          note: RT.optional(TF.string()),
        })
      ),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Order>(),
    getValidationErrorsReflect: () => {
      const v: Order = makeOrder();
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Order = makeOrder();
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<Order>(),
    mockTypeReflect: () => {
      const v: Order = makeOrder();
      return createMockDataFn(v);
    },
    getSamples: () => {
      const ok = makeOrder();
      return {
        valid: [ok, {...ok, note: 'gift', status: 'shipped' as const}],
        invalid: [
          {...ok, status: 'refunded'},
          {...ok, items: [{sku: 'A1', name: 'Widget', qty: 2}]},
          {...ok, customer: {id: 1}},
          {...ok, total: 'free'},
          null,
          'not-an-object',
          42,
        ],
      };
    },
    getExpectedErrors: () => [
      [{path: ['status'], expected: 'union'}],
      [{path: ['items', 0, 'price'], expected: 'number'}],
      [{path: ['customer', 'email'], expected: 'string'}],
      [{path: ['total'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  blogPost: {
    title: 'Blog post',
    description:
      'A CMS post with ids, slug, body, a tags array, an inline author, a published flag with optional publishedAt, and a nested meta counter object.',
    validate: () => {
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
      return createValidateFn<BlogPost>();
    },
    standardSchema: () => createStandardSchema<BlogPost>(),
    validateDataOnly: () => createValidateFn<DataOnly<BlogPost>>(),
    validateSchema: () =>
      createValidateFn(
        RT.object({
          id: TF.number(),
          title: TF.string(),
          slug: TF.string(),
          body: TF.string(),
          tags: RT.array(TF.string()),
          author: RT.object({name: TF.string(), email: TF.string()}),
          published: RT.boolean(),
          publishedAt: RT.optional(TF.string()),
          meta: RT.object({views: TF.number(), likes: TF.number()}),
        })
      ),
    deserializeValidate: () => deserializeValidate<BlogPost>(),
    validateReflect: () => {
      const v: BlogPost = makeBlogPost();
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: BlogPost = makeBlogPost();
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<BlogPost>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<BlogPost>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.object({
          id: TF.number(),
          title: TF.string(),
          slug: TF.string(),
          body: TF.string(),
          tags: RT.array(TF.string()),
          author: RT.object({name: TF.string(), email: TF.string()}),
          published: RT.boolean(),
          publishedAt: RT.optional(TF.string()),
          meta: RT.object({views: TF.number(), likes: TF.number()}),
        })
      ),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<BlogPost>(),
    getValidationErrorsReflect: () => {
      const v: BlogPost = makeBlogPost();
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: BlogPost = makeBlogPost();
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<BlogPost>(),
    mockTypeReflect: () => {
      const v: BlogPost = makeBlogPost();
      return createMockDataFn(v);
    },
    getSamples: () => {
      const ok = makeBlogPost();
      return {
        valid: [ok, {...ok, publishedAt: '2024-01-02'}],
        invalid: [{...ok, tags: [1, 2]}, {...ok, meta: {views: 10}}, {...ok, published: 'yes'}, null, 'not-an-object', 42],
      };
    },
    getExpectedErrors: () => [
      [
        {path: ['tags', 0], expected: 'string'},
        {path: ['tags', 1], expected: 'string'},
      ],
      [{path: ['meta', 'likes'], expected: 'number'}],
      [{path: ['published'], expected: 'boolean'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  product: {
    title: 'Product',
    description:
      'A catalog product with a currency union, an inStock flag, a categories array, and an optional nested dimensions object.',
    validate: () => {
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
      return createValidateFn<Product>();
    },
    standardSchema: () => createStandardSchema<Product>(),
    validateDataOnly: () => createValidateFn<DataOnly<Product>>(),
    validateSchema: () =>
      createValidateFn(
        RT.object({
          id: TF.string(),
          name: TF.string(),
          description: TF.string(),
          price: TF.number(),
          currency: RT.union([RT.literal('USD'), RT.literal('EUR'), RT.literal('GBP')]),
          inStock: RT.boolean(),
          categories: RT.array(TF.string()),
          dimensions: RT.optional(RT.object({width: TF.number(), height: TF.number(), depth: TF.number()})),
        })
      ),
    deserializeValidate: () => deserializeValidate<Product>(),
    validateReflect: () => {
      const v: Product = makeProduct();
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: Product = makeProduct();
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<Product>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<Product>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.object({
          id: TF.string(),
          name: TF.string(),
          description: TF.string(),
          price: TF.number(),
          currency: RT.union([RT.literal('USD'), RT.literal('EUR'), RT.literal('GBP')]),
          inStock: RT.boolean(),
          categories: RT.array(TF.string()),
          dimensions: RT.optional(RT.object({width: TF.number(), height: TF.number(), depth: TF.number()})),
        })
      ),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Product>(),
    getValidationErrorsReflect: () => {
      const v: Product = makeProduct();
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Product = makeProduct();
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<Product>(),
    mockTypeReflect: () => {
      const v: Product = makeProduct();
      return createMockDataFn(v);
    },
    getSamples: () => {
      const ok = makeProduct();
      return {
        valid: [ok, {...ok, dimensions: {width: 1, height: 2, depth: 3}}],
        invalid: [
          {...ok, currency: 'JPY'},
          {...ok, dimensions: {width: 1, height: 2}},
          {...ok, price: '9.99'},
          null,
          'not-an-object',
          42,
        ],
      };
    },
    getExpectedErrors: () => [
      [{path: ['currency'], expected: 'union'}],
      [{path: ['dimensions', 'depth'], expected: 'number'}],
      [{path: ['price'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  productPage: {
    title: 'Product page',
    description: 'A paginated API response with an array of products plus page / pageSize / total / hasMore metadata.',
    validate: () => {
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
      return createValidateFn<ProductPage>();
    },
    standardSchema: () => createStandardSchema<ProductPage>(),
    validateDataOnly: () => createValidateFn<DataOnly<ProductPage>>(),
    validateSchema: () =>
      createValidateFn(
        RT.object({
          data: RT.array(
            RT.object({
              id: TF.string(),
              name: TF.string(),
              description: TF.string(),
              price: TF.number(),
              currency: RT.union([RT.literal('USD'), RT.literal('EUR'), RT.literal('GBP')]),
              inStock: RT.boolean(),
              categories: RT.array(TF.string()),
              dimensions: RT.optional(RT.object({width: TF.number(), height: TF.number(), depth: TF.number()})),
            })
          ),
          page: TF.number(),
          pageSize: TF.number(),
          total: TF.number(),
          hasMore: RT.boolean(),
        })
      ),
    deserializeValidate: () => deserializeValidate<ProductPage>(),
    validateReflect: () => {
      const v: ProductPage = {data: [makeProduct()], page: 1, pageSize: 20, total: 1, hasMore: false};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: ProductPage = {data: [makeProduct()], page: 1, pageSize: 20, total: 1, hasMore: false};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<ProductPage>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<ProductPage>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.object({
          data: RT.array(
            RT.object({
              id: TF.string(),
              name: TF.string(),
              description: TF.string(),
              price: TF.number(),
              currency: RT.union([RT.literal('USD'), RT.literal('EUR'), RT.literal('GBP')]),
              inStock: RT.boolean(),
              categories: RT.array(TF.string()),
              dimensions: RT.optional(RT.object({width: TF.number(), height: TF.number(), depth: TF.number()})),
            })
          ),
          page: TF.number(),
          pageSize: TF.number(),
          total: TF.number(),
          hasMore: RT.boolean(),
        })
      ),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<ProductPage>(),
    getValidationErrorsReflect: () => {
      const v: ProductPage = {data: [makeProduct()], page: 1, pageSize: 20, total: 1, hasMore: false};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: ProductPage = {data: [makeProduct()], page: 1, pageSize: 20, total: 1, hasMore: false};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<ProductPage>(),
    mockTypeReflect: () => {
      const v: ProductPage = {data: [makeProduct()], page: 1, pageSize: 20, total: 1, hasMore: false};
      return createMockDataFn(v);
    },
    getSamples: () => {
      const p = makeProduct();
      const ok: ProductPage = {data: [p], page: 1, pageSize: 20, total: 1, hasMore: false};
      return {
        valid: [ok, {data: [], page: 2, pageSize: 20, total: 0, hasMore: false}],
        invalid: [
          {...ok, data: [{...p, currency: 'JPY'}]},
          {...ok, hasMore: 'no'},
          {...ok, page: '1'},
          null,
          'not-an-object',
          42,
        ],
      };
    },
    getExpectedErrors: () => [
      [{path: ['data', 0, 'currency'], expected: 'union'}],
      [{path: ['hasMore'], expected: 'boolean'}],
      [{path: ['page'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  registrationForm: {
    title: 'Registration form',
    description:
      'A signup form with email, password, an acceptedTerms literal that must be exactly true, and a nested profile with an optional age.',
    validate: () => {
      interface RegistrationForm {
        email: string;
        password: string;
        acceptedTerms: true;
        profile: {firstName: string; lastName: string; age?: number};
      }
      return createValidateFn<RegistrationForm>();
    },
    standardSchema: () => createStandardSchema<RegistrationForm>(),
    validateDataOnly: () => createValidateFn<DataOnly<RegistrationForm>>(),
    validateSchema: () =>
      createValidateFn(
        RT.object({
          email: TF.string(),
          password: TF.string(),
          acceptedTerms: RT.literal(true),
          profile: RT.object({firstName: TF.string(), lastName: TF.string(), age: RT.optional(TF.number())}),
        })
      ),
    deserializeValidate: () => deserializeValidate<RegistrationForm>(),
    validateReflect: () => {
      const v: RegistrationForm = makeRegistrationForm();
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: RegistrationForm = makeRegistrationForm();
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<RegistrationForm>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<RegistrationForm>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.object({
          email: TF.string(),
          password: TF.string(),
          acceptedTerms: RT.literal(true),
          profile: RT.object({firstName: TF.string(), lastName: TF.string(), age: RT.optional(TF.number())}),
        })
      ),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<RegistrationForm>(),
    getValidationErrorsReflect: () => {
      const v: RegistrationForm = makeRegistrationForm();
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: RegistrationForm = makeRegistrationForm();
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<RegistrationForm>(),
    mockTypeReflect: () => {
      const v: RegistrationForm = makeRegistrationForm();
      return createMockDataFn(v);
    },
    getSamples: () => {
      const ok = makeRegistrationForm();
      return {
        valid: [ok, {...ok, profile: {...ok.profile, age: 30}}],
        invalid: [
          {...ok, acceptedTerms: false},
          {...ok, profile: {firstName: 'Ann'}},
          {...ok, password: 123456},
          null,
          'not-an-object',
          42,
        ],
      };
    },
    getExpectedErrors: () => [
      [{path: ['acceptedTerms'], expected: 'literal'}],
      [{path: ['profile', 'lastName'], expected: 'string'}],
      [{path: ['password'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },
} as const satisfies Record<string, ValidationCase>;

// Sample builders for the composite cases — kept out of the thunks so the table's
// valid/invalid rows stay terse while the validators above reference the interfaces.
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
  return {
    id: 'p1',
    name: 'Widget',
    description: 'A widget',
    price: 9.99,
    currency: 'USD',
    inStock: true,
    categories: ['tools'],
  };
}
function makeRegistrationForm(): RegistrationForm {
  return {
    email: 'ann@example.com',
    password: 'hunter2hunter2',
    acceptedTerms: true,
    profile: {firstName: 'Ann', lastName: 'Smith'},
  };
}
