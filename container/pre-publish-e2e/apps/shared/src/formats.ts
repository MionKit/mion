// Family 8 — Type formats. Mirrors guide/type-formats-*.ts +
// custom-format-pattern.ts. Named formats, the custom-param escape hatch, a
// registered reusable pattern, and the format builders.
//
// ⚠️ This ONE import deliberately stays on the deprecated `/schema` alias
// (every other site in the repo moved to `/builders`): it is what proves the
// alias still resolves to the same module against the PUBLISHED package, and
// it is removed when the alias goes at 1.0.
import * as TF from '@mionjs/run-types/formats';
import {createValidateFn, registerFormatPattern, type InferType} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/schema';
import {type CheckResult, ok} from './check';

// Type-first named formats + branded custom params.
type Username = TF.String<{minLength: 3; maxLength: 20}>;
type Percentage = TF.Number<{min: 0; max: 100}>;

export interface Profile {
  id: TF.UUIDv4;
  email: TF.Email;
  handle: Username;
  completion: Percentage;
}
export const isProfile = createValidateFn<Profile>();

// A reusable registered pattern (mockSamples double as canonical mock values).
export const slug = registerFormatPattern({
  source: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  mockSamples: ['my-post', 'hello-world-2'],
  message: 'must be a kebab-case slug',
});
type Slug = TF.String<{pattern: typeof slug}>;
export interface Post {
  slug: Slug;
  title: string;
}
export const isPost = createValidateFn<Post>();

// Schema-first format builders.
export const accountSchema = RT.object({id: TF.uuidv4(), email: TF.email(), age: TF.int32(), credits: TF.positive()});
export type FormatAccount = InferType<typeof accountSchema>;
export const isFormatAccount = createValidateFn(accountSchema);

export function checkFormats(): CheckResult[] {
  const goodProfile = {id: '109156be-c4fb-41ea-b1b4-efe1671c5836', email: 'ada@example.com', handle: 'ada_99', completion: 80};
  const badProfile = {id: 'not-a-uuid', email: 'nope', handle: 'no', completion: 150};
  return [
    ok('formats: branded/named formats accept a good value', isProfile(goodProfile as Profile)),
    ok('formats: branded/named formats reject a bad value', !isProfile(badProfile as Profile)),
    ok('formats: registered pattern accepts a valid slug', isPost({slug: 'my-first-post' as Slug, title: 'Hi'})),
    ok('formats: registered pattern rejects an invalid slug', !isPost({slug: 'Not A Slug!' as Slug, title: 'Hi'})),
    ok('formats: schema-first format builders validate', isFormatAccount({id: '109156be-c4fb-41ea-b1b4-efe1671c5836', email: 'ada@example.com', age: 20, credits: 5})),
  ];
}
