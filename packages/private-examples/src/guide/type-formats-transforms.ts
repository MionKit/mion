import type * as TF from '@mionjs/run-types/formats';
import {transform, email} from '@mionjs/run-types/formats';
import {createValidateFn, createFormatTransformFn} from '@mionjs/run-types';

// start-sanitize
type SignUp = {
  email: TF.Email<{transform: {trim: true; lowercase: true}}>;
  name: TF.String<{maxLength: 32; transform: {trim: true; capitalize: true}}>;
  tags: TF.Transform<string, {lowercase: true}>[]; // the wrapper works on any string
};

const sanitize = createFormatTransformFn<SignUp>();
sanitize({email: ' Ada@Example.COM ', name: ' ada ', tags: ['News']});
// {email: 'ada@example.com', name: 'Ada', tags: ['news']}
// end-sanitize

// the Transform wrapper is the same type as the `transform` key
type Email = TF.Email<{transform: {trim: true; lowercase: true}}>;
type SameEmail = TF.Transform<TF.Email, {trim: true; lowercase: true}>;

// value-first builders have the same wrapper
const emailRt = transform(email(), {trim: true, lowercase: true});

// validation never applies a transform
const isEmail = createValidateFn<Email>();
isEmail('John@Example.COM'); // true, and not lowercased

// Email, Domain, IP and Url keep their case unless asked: a URL path and, per the RFC, an email local part are case-sensitive
const asIs = createFormatTransformFn<TF.Url>();
asIs('https://Example.com/Path'); // 'https://Example.com/Path'

export {isEmail, sanitize, asIs, emailRt};
export type {SignUp, SameEmail};
