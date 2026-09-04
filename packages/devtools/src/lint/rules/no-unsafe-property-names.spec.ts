/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RuleTester} from '@typescript-eslint/rule-tester';
import rule from './no-unsafe-property-names.ts';

const ruleTester = new RuleTester();

ruleTester.run('no-unsafe-property-names', rule, {
  valid: [
    {code: `interface User { name: string; builder: string }`},
    {code: `type Settings = { proto: string; construct: number }`},
    // a class constructor is a method, and the one legitimate use of the name
    {code: `class Box { size: number; constructor(size: number) { this.size = size } }`},
    // a computed key is not a declared name
    {code: `const k = '__proto__'; interface Weird { [k]: string }`},
    // object VALUES are not types: the decoders never see a literal written in code
    {code: `const o = { constructor: 1 }`},
    {code: `interface Api { getPrototype(): string }`},
  ],
  invalid: [
    {
      code: `interface Settings { constructor: string }`,
      errors: [{messageId: 'unsafePropertyName', data: {name: 'constructor'}}],
    },
    {
      code: `type Poison = { __proto__: { admin: boolean } }`,
      errors: [{messageId: 'unsafePropertyName', data: {name: '__proto__'}}],
    },
    {
      code: `interface Model { prototype?: number }`,
      errors: [{messageId: 'unsafePropertyName', data: {name: 'prototype'}}],
    },
    {
      code: `interface Model { '__proto__': string }`,
      errors: [{messageId: 'unsafePropertyName', data: {name: '__proto__'}}],
    },
    {
      code: `interface Api { constructor(): void }`,
      errors: [{messageId: 'unsafePropertyName', data: {name: 'constructor'}}],
    },
    {
      code: `class Entity { __proto__!: string }`,
      errors: [{messageId: 'unsafePropertyName', data: {name: '__proto__'}}],
    },
    {
      code: `abstract class Base { abstract prototype: string }`,
      errors: [{messageId: 'unsafePropertyName', data: {name: 'prototype'}}],
    },
    {
      code: `type Nested = { inner: { constructor: number }[] }`,
      errors: [{messageId: 'unsafePropertyName', data: {name: 'constructor'}}],
    },
  ],
});
