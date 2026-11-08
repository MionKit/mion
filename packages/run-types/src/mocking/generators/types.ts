// The types the mock generators share: the one signature every generator has (built-in or registered with
// registerMockGenerator), the parts a built-in value is composed of, and the country rows they read.

import type {StringParams} from '../../formats/string/stringFormats.ts';
import type {MockRandom} from '../mockRandom.ts';

/** What a generator gets for one draw. A single object so a later field never breaks a registered generator. **/
export interface GeneratorContext {
  /** Every draw goes through it, so a seeded mock repeats. **/
  random: MockRandom;
  /** Length bounds in code points, from the format's `length` / `minLength` / `maxLength`. **/
  lo?: number;
  hi?: number;
  /** The format's params, for a generator that wants more than the length bounds. **/
  params: StringParams;
}

export type GeneratorFn = (ctx: GeneratorContext) => string;

/** One slot of a composed value: its achievable lengths, how many values each length has, and a draw of one.
 *  `chars` holds every character a value can contain, `common` the ones every value contains and `leading` the ones
 *  a value can start with. **/
export interface Part {
  readonly lengths: readonly number[];
  readonly chars: string;
  readonly common: string;
  readonly leading: string;
  count(length: number): number;
  draw(random: MockRandom, length: number): string;
}

/** Every shape a generator can produce, each a row of parts. **/
export type Shapes = readonly (readonly Part[])[];

export interface CountryRow {
  name: string;
  /** Calling code digits, without the `+`. **/
  callingCode: string;
  /** Digits in a national number, the part after the calling code. **/
  nationalDigits: number;
  /** Present only where the generators know the subdivisions (`state`). **/
  states?: readonly string[];
  /** `#` is a digit. Present only where the generators know the format (`postcode`). **/
  postcodeTemplates?: readonly string[];
}
