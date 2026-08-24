import type * as TF from '@ts-runtypes/core/formats';
import {createValidateFn, registerFormatPattern} from '@ts-runtypes/core';

// Register a reusable string pattern once. `mockSamples` are optional:
// declare them for curated values the mock generator draws from, and each
// is checked against the regex at registration (a bad sample throws loudly).
const slug = registerFormatPattern({
  source: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  mockSamples: ['my-post', 'hello-world-2'],
  message: 'must be a kebab-case slug',
});

// Or skip the samples entirely: the build generates a pool of matching
// values from the regex (deterministic, same values on every rebuild).
const sku = registerFormatPattern({source: '^[A-Z]{3}-[0-9]{4}$'});

// Reference either by `typeof` in a TF.String. Build-time validation +
// mocks both pick them up.
type Slug = TF.String<{pattern: typeof slug}>;
type Sku = TF.String<{pattern: typeof sku}>;

type Post = {slug: Slug; sku: Sku; title: string};

const isPost = createValidateFn<Post>();
isPost({slug: 'my-first-post', sku: 'ABC-1234', title: 'Hi'}); // true
isPost({slug: 'Not A Slug!', sku: 'ABC-1234', title: 'Hi'}); // false

export {slug, sku, isPost};
export type {Slug, Sku, Post};
