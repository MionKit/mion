import type * as TF from '@mionjs/run-types/formats';
import {transform, email} from '@mionjs/run-types/formats';
import {createValidateFn, createFormatTransformFn} from '@mionjs/run-types';

// A format checks a value. A transform REWRITES it. The two live apart so a
// reader can tell at a glance which part of a type changes their data.

// Spelling one: the `transform` key inside the format's params.
type Email = TF.Email<{transform: {trim: true; lowercase: true}}>;
type Name = TF.String<{
  maxLength: 32;
  transform: {trim: true; capitalize: true};
}>;

// Spelling two: the Transform wrapper. Same type, same compiled functions.
type SameEmail = TF.Transform<TF.Email, {trim: true; lowercase: true}>;
type Tag = TF.Transform<string, {lowercase: true}>; // a plain string can carry one too

// Value-first builders have the same wrapper.
const emailRt = transform(email(), {trim: true, lowercase: true});

// Validation never applies a transform: a value is accepted exactly as sent.
const isEmail = createValidateFn<Email>();
isEmail('John@Example.COM'); // true, and not lowercased

// Only the transform function rewrites. It walks the whole type, so nested
// objects and arrays are covered.
const clean = createFormatTransformFn<{email: Email; tags: Tag[]}>();
clean({email: ' John@Example.COM ', tags: ['News', 'SPORT']});
// {email: 'john@example.com', tags: ['news', 'sport']}

// Email, Domain, IP and Url do not lowercase unless asked. A URL path is
// case-sensitive, and so is the local part of an email by the letter of the RFC.
const asIs = createFormatTransformFn<TF.Url>();
asIs('https://Example.com/Path'); // 'https://Example.com/Path'

export {isEmail, clean, asIs, emailRt};
export type {Name, SameEmail};
