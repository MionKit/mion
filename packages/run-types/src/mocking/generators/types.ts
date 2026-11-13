import type {StringParams} from '../../formats/string/stringFormats.ts';
import type {MockRandom} from '../mockRandom.ts';

/** A single object, so a later field never breaks a registered generator. **/
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

/** One slot of a composed value; `count`: how many values one length holds. **/
export interface Part {
  readonly lengths: readonly number[];
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
