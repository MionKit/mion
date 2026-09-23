import * as TF from '@mionjs/run-types/formats';
import * as RT from '@mionjs/run-types/builders';
import {createValidateFn, registerFormatPattern} from '@mionjs/run-types';

// a sample that does not match the regex throws at registration
const slug = registerFormatPattern({
  source: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  mockSamples: ['my-post', 'hello-world-2'],
  message: 'must be a kebab-case slug',
});

// no samples: each build draws new ones from the regex, unless a literal createMockDataFn seed pins them
const sku = registerFormatPattern({source: '^[A-Z]{3}-[0-9]{4}$'});

// `(\w+\s?)*` fails the freeze check; unsafePattern says you checked it yourself
const wordRun = registerFormatPattern({
  source: '^(\\w+\\s?)*$',
  mockSamples: ['one two'],
  unsafePattern: true,
});

// validation and mocks both use the pattern
type Slug = TF.String<{pattern: typeof slug}>;
type Sku = TF.String<{pattern: typeof sku}>;
type WordRun = TF.String<{pattern: typeof wordRun}>;

// a builder schema takes the pattern value itself, no typeof
const Product = RT.object({sku: TF.string({pattern: sku})});

type Post = {slug: Slug; sku: Sku; title: string};

const isPost = createValidateFn<Post>();
isPost({slug: 'my-first-post', sku: 'ABC-1234', title: 'Hi'}); // true
isPost({slug: 'Not A Slug!', sku: 'ABC-1234', title: 'Hi'}); // false

export {slug, sku, wordRun, isPost, Product};
export type {Slug, Sku, WordRun, Post};
