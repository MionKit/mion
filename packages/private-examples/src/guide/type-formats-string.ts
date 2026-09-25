import type * as TF from '@mionjs/run-types/formats';
import {createValidateFn} from '@mionjs/run-types';

// start-email
const isEmail = createValidateFn<TF.Email>();
const isEmailAddress = createValidateFn<TF.EmailAddress>();
const isIdnEmail = createValidateFn<TF.IdnEmail>();

isEmail('ada@example.com'); // true
isEmail('"ada lovelace"@example.com'); // false, quoted local part
isEmailAddress('"ada lovelace"@example.com'); // true
isEmailAddress('ada@[127.0.0.1]'); // true, address literal
isIdnEmail('δοκιμή@example.com'); // true, any script
isEmail('ada@localhost'); // false, the domain needs a dot
// end-email

// start-hosts
const isDomain = createValidateFn<TF.Domain>();
const isHostname = createValidateFn<TF.Hostname>();
const isIdnHostname = createValidateFn<TF.IdnHostname>();

isDomain('example.com'); // true
isDomain('localhost'); // false, needs a dot
isHostname('localhost'); // true
isIdnHostname('실례.테스트'); // true
// end-hosts

// start-ip
const isIPv4 = createValidateFn<TF.IPv4>();
const isLocalIPv4 = createValidateFn<TF.IPv4<{allowLocalHost: true}>>();
const isHostPort = createValidateFn<TF.IPv4WithPort>();

isIPv4('127.0.0.1'); // true
isIPv4('localhost'); // false
isLocalIPv4('localhost'); // true
isHostPort('10.0.0.1:8080'); // true
// end-ip

// start-pattern
type Sku = TF.String<{pattern: {source: '^[A-Z]{3}-[0-9]{4}$'}}>;
const isSku = createValidateFn<Sku>();

isSku('ABC-1234'); // true
isSku('abc-1234'); // false
// end-pattern

// start-mock-samples
// no samples: generated from the regex
type Code = TF.String<{pattern: {source: '^[A-Z]{2}[0-9]{3}$'}}>;
// your samples win
type Slug = TF.String<{
  pattern: {source: '^[a-z-]+$'; mockSamples: ['my-post', 'hello-world']};
}>;
// end-mock-samples

// start-unsafe-pattern
// a nested repeat
type Words = TF.String<{
  pattern: {source: '^(\\w+\\s?)*$'; unsafePattern: true};
}>;
// end-unsafe-pattern

export type {Sku, Code, Slug, Words};
export {
  isSku,
  isEmail,
  isEmailAddress,
  isIdnEmail,
  isDomain,
  isHostname,
  isIdnHostname,
  isIPv4,
  isLocalIPv4,
  isHostPort,
};
