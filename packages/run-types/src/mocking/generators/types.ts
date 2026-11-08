// The one signature every mock generator has, built-in or registered with registerMockGenerator.

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
