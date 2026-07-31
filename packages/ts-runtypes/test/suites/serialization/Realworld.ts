import * as TF from '@ts-runtypes/core/formats';
import {createBinaryDecoderFn, createBinaryEncoderFn, createJsonDecoderFn, createJsonEncoderFn} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import type {SerializationCase} from './types.ts';

// Real-world DTO scenarios — the SAME relational / CMS / API / form shapes the
// realworld benchmark runs (container/benchmarks/shared/cases/realworld), so the serialization
// suite table lines up case-for-case with the benchmark. The module interfaces are the
// single source of truth; each case's `cloneEncoder` (the strategy the docs render)
// redeclares its type INLINE so the doc-gen extracts a real, self-contained snippet,
// while the rest reference the module interfaces. Every shape is fully JSON / binary
// serializable, so round-trips are symmetric (no `deserializedValues`).

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

const userSchema = () =>
  RT.object({
    id: TF.number(),
    email: TF.string(),
    name: TF.string(),
    age: RT.optional(TF.number()),
    roles: RT.array(RT.union([RT.literal('admin'), RT.literal('editor'), RT.literal('user')])),
    active: RT.boolean(),
    createdAt: TF.string(),
  });
const orderSchema = () =>
  RT.object({
    id: TF.string(),
    customer: RT.object({id: TF.number(), email: TF.string()}),
    items: RT.array(RT.object({sku: TF.string(), name: TF.string(), qty: TF.number(), price: TF.number()})),
    shipping: RT.object({street: TF.string(), city: TF.string(), state: TF.string(), zip: TF.string(), country: TF.string()}),
    status: RT.union([
      RT.literal('pending'),
      RT.literal('paid'),
      RT.literal('shipped'),
      RT.literal('delivered'),
      RT.literal('cancelled'),
    ]),
    total: TF.number(),
    note: RT.optional(TF.string()),
  });
const productModel = () =>
  RT.object({
    id: TF.string(),
    name: TF.string(),
    description: TF.string(),
    price: TF.number(),
    currency: RT.union([RT.literal('USD'), RT.literal('EUR'), RT.literal('GBP')]),
    inStock: RT.boolean(),
    categories: RT.array(TF.string()),
    dimensions: RT.optional(RT.object({width: TF.number(), height: TF.number(), depth: TF.number()})),
  });
const blogPostSchema = () =>
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
  });
const productPageSchema = () =>
  RT.object({
    data: RT.array(productModel()),
    page: TF.number(),
    pageSize: TF.number(),
    total: TF.number(),
    hasMore: RT.boolean(),
  });
const registrationFormSchema = () =>
  RT.object({
    email: TF.string(),
    password: TF.string(),
    acceptedTerms: RT.literal(true),
    profile: RT.object({firstName: TF.string(), lastName: TF.string(), age: RT.optional(TF.number())}),
  });

export const REALWORLD = {
  user: {
    title: 'User',
    description:
      'A relational user record with a numeric id, email, name, optional age, a roles union array, an active flag and a createdAt string.',
    cloneEncoder: () => {
      interface User {
        id: number;
        email: string;
        name: string;
        age?: number;
        roles: ('admin' | 'editor' | 'user')[];
        active: boolean;
        createdAt: string;
      }
      return createJsonEncoderFn<User>(undefined, {strategy: 'clone'});
    },
    mutateEncoder: () => createJsonEncoderFn<User>(undefined, {strategy: 'mutate'}),
    directEncoder: () => createJsonEncoderFn<User>(undefined, {strategy: 'direct'}),
    compactEncoder: () => {
      interface User {
        id: number;
        email: string;
        name: string;
        age?: number;
        roles: ('admin' | 'editor' | 'user')[];
        active: boolean;
        createdAt: string;
      }
      return createJsonEncoderFn<User>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => createJsonDecoderFn<User>(),
    preserveDecoder: () => createJsonDecoderFn<User>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<User>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<User>(),
    binaryDecoder: () => createBinaryDecoderFn<User>(),
    schemaEncoder: () => createJsonEncoderFn(userSchema()),
    schemaDecoder: () => createJsonDecoderFn(userSchema()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(userSchema()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(userSchema()),
    getTestData: () => ({values: [sampleUser(), sampleUser({age: 30, roles: ['admin', 'editor']})]}),
  },

  order: {
    title: 'Order',
    description:
      'A nested order with an inline customer ref, an array of line items, a shipping address, a status union, a total, and an optional note.',
    cloneEncoder: () => {
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
      return createJsonEncoderFn<Order>(undefined, {strategy: 'clone'});
    },
    mutateEncoder: () => createJsonEncoderFn<Order>(undefined, {strategy: 'mutate'}),
    directEncoder: () => createJsonEncoderFn<Order>(undefined, {strategy: 'direct'}),
    compactEncoder: () => {
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
      return createJsonEncoderFn<Order>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => createJsonDecoderFn<Order>(),
    preserveDecoder: () => createJsonDecoderFn<Order>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<Order>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Order>(),
    binaryDecoder: () => createBinaryDecoderFn<Order>(),
    schemaEncoder: () => createJsonEncoderFn(orderSchema()),
    schemaDecoder: () => createJsonDecoderFn(orderSchema()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(orderSchema()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(orderSchema()),
    getTestData: () => {
      const ok = makeOrder();
      return {values: [ok, {...ok, note: 'gift', status: 'shipped' as const}]};
    },
  },

  blogPost: {
    title: 'Blog post',
    description:
      'A CMS post with ids, slug, body, a tags array, an inline author, a published flag with optional publishedAt, and a nested meta counter object.',
    cloneEncoder: () => {
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
      return createJsonEncoderFn<BlogPost>(undefined, {strategy: 'clone'});
    },
    mutateEncoder: () => createJsonEncoderFn<BlogPost>(undefined, {strategy: 'mutate'}),
    directEncoder: () => createJsonEncoderFn<BlogPost>(undefined, {strategy: 'direct'}),
    compactEncoder: () => {
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
      return createJsonEncoderFn<BlogPost>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => createJsonDecoderFn<BlogPost>(),
    preserveDecoder: () => createJsonDecoderFn<BlogPost>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<BlogPost>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<BlogPost>(),
    binaryDecoder: () => createBinaryDecoderFn<BlogPost>(),
    schemaEncoder: () => createJsonEncoderFn(blogPostSchema()),
    schemaDecoder: () => createJsonDecoderFn(blogPostSchema()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(blogPostSchema()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(blogPostSchema()),
    getTestData: () => {
      const ok = makeBlogPost();
      return {values: [ok, {...ok, publishedAt: '2024-01-02'}]};
    },
  },

  product: {
    title: 'Product',
    description:
      'A catalog product with a currency union, an inStock flag, a categories array, and an optional nested dimensions object.',
    cloneEncoder: () => {
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
      return createJsonEncoderFn<Product>(undefined, {strategy: 'clone'});
    },
    mutateEncoder: () => createJsonEncoderFn<Product>(undefined, {strategy: 'mutate'}),
    directEncoder: () => createJsonEncoderFn<Product>(undefined, {strategy: 'direct'}),
    compactEncoder: () => {
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
      return createJsonEncoderFn<Product>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => createJsonDecoderFn<Product>(),
    preserveDecoder: () => createJsonDecoderFn<Product>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<Product>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Product>(),
    binaryDecoder: () => createBinaryDecoderFn<Product>(),
    schemaEncoder: () => createJsonEncoderFn(productModel()),
    schemaDecoder: () => createJsonDecoderFn(productModel()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(productModel()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(productModel()),
    getTestData: () => {
      const ok = makeProduct();
      return {values: [ok, {...ok, dimensions: {width: 1, height: 2, depth: 3}}]};
    },
  },

  productPage: {
    title: 'Product page',
    description: 'A paginated API response with an array of products plus page, pageSize, total and hasMore metadata.',
    cloneEncoder: () => {
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
      return createJsonEncoderFn<ProductPage>(undefined, {strategy: 'clone'});
    },
    mutateEncoder: () => createJsonEncoderFn<ProductPage>(undefined, {strategy: 'mutate'}),
    directEncoder: () => createJsonEncoderFn<ProductPage>(undefined, {strategy: 'direct'}),
    compactEncoder: () => {
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
      return createJsonEncoderFn<ProductPage>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => createJsonDecoderFn<ProductPage>(),
    preserveDecoder: () => createJsonDecoderFn<ProductPage>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<ProductPage>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<ProductPage>(),
    binaryDecoder: () => createBinaryDecoderFn<ProductPage>(),
    schemaEncoder: () => createJsonEncoderFn(productPageSchema()),
    schemaDecoder: () => createJsonDecoderFn(productPageSchema()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(productPageSchema()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(productPageSchema()),
    getTestData: () => {
      const ok: ProductPage = {data: [makeProduct()], page: 1, pageSize: 20, total: 1, hasMore: false};
      return {values: [ok, {data: [], page: 2, pageSize: 20, total: 0, hasMore: false}]};
    },
  },

  registrationForm: {
    title: 'Registration form',
    description:
      'A signup form with email, password, an `acceptedTerms: true` literal, and a nested profile with an optional age.',
    cloneEncoder: () => {
      interface RegistrationForm {
        email: string;
        password: string;
        acceptedTerms: true;
        profile: {firstName: string; lastName: string; age?: number};
      }
      return createJsonEncoderFn<RegistrationForm>(undefined, {strategy: 'clone'});
    },
    mutateEncoder: () => createJsonEncoderFn<RegistrationForm>(undefined, {strategy: 'mutate'}),
    directEncoder: () => createJsonEncoderFn<RegistrationForm>(undefined, {strategy: 'direct'}),
    compactEncoder: () => {
      interface RegistrationForm {
        email: string;
        password: string;
        acceptedTerms: true;
        profile: {firstName: string; lastName: string; age?: number};
      }
      return createJsonEncoderFn<RegistrationForm>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => createJsonDecoderFn<RegistrationForm>(),
    preserveDecoder: () => createJsonDecoderFn<RegistrationForm>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<RegistrationForm>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<RegistrationForm>(),
    binaryDecoder: () => createBinaryDecoderFn<RegistrationForm>(),
    schemaEncoder: () => createJsonEncoderFn(registrationFormSchema()),
    schemaDecoder: () => createJsonDecoderFn(registrationFormSchema()),
    schemaBinaryEncoder: () => createBinaryEncoderFn(registrationFormSchema()),
    schemaBinaryDecoder: () => createBinaryDecoderFn(registrationFormSchema()),
    getTestData: () => {
      const ok = makeRegistrationForm();
      return {values: [ok, {...ok, profile: {...ok.profile, age: 30}}]};
    },
  },
} as const satisfies Record<string, SerializationCase>;

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
