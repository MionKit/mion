import type * as TF from '@mionjs/run-types/formats';
import {createValidateFn} from '@mionjs/run-types';

// TF.String / TF.Number / TF.BigInt are the escape hatches: pass
// your own params when no named format fits.
type Username = TF.String<{
  minLength: 3;
  maxLength: 20;
  pattern: {source: '^[a-z0-9_]+$'; mockSamples: ['ada_99', 'grace']};
}>;
type Percentage = TF.Number<{min: 0; max: 100}>;
type BigPositive = TF.BigInt<{min: 0n}>;

type Profile = {
  handle: Username;
  completion: Percentage;
  followers: BigPositive;
};

const isProfile = createValidateFn<Profile>();

isProfile({handle: 'ada_99', completion: 80, followers: 1200n}); // true
isProfile({handle: 'no', completion: 150, followers: -1n}); // false

export {isProfile};
export type {Profile};
