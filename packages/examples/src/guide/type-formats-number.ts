import type * as TF from '@mionjs/run-types/formats';
import {createValidateFn} from '@mionjs/run-types';

// start-named
const isInt8 = createValidateFn<TF.Int8>();
const isUInt8 = createValidateFn<TF.UInt8>();
const isPositive = createValidateFn<TF.Positive>();

isInt8(-128); // true
isInt8(1.5); // false, not a whole number
isUInt8(256); // false, over 255
isPositive(0); // true
// end-named

// start-custom
type PackSize = TF.Number<{gt: 0; multipleOf: 6}>;
type Percent = TF.Number<{min: 0; max: 100; integer: true}>;

const isPackSize = createValidateFn<PackSize>();
const isPercent = createValidateFn<Percent>();

isPackSize(12); // true
isPackSize(0); // false, must be over 0
isPackSize(10); // false, not a multiple of 6
isPercent(101); // false, over 100
// end-custom

// start-currency
type Balance = TF.Currency<{min: 0}>;
const isBalance = createValidateFn<Balance>();

isBalance(120.5); // true, checked like any number
// end-currency

// start-bigint-named
const isBigInt64 = createValidateFn<TF.BigInt64>();
const isBigUInt64 = createValidateFn<TF.BigUInt64>();
const isBigPositive = createValidateFn<TF.BigPositive>();

isBigInt64(-9223372036854775808n); // true
isBigInt64(9223372036854775808n); // false, one over the limit
isBigUInt64(-1n); // false
isBigPositive(0n); // true, zero is included
// end-bigint-named

// start-bigint-custom
type AccountId = TF.BigInt<{min: 1n; max: 999_999_999_999n}>;
const isAccountId = createValidateFn<AccountId>();

isAccountId(42n); // true
isAccountId(0n); // false, under 1n
// end-bigint-custom

export {
  isInt8,
  isUInt8,
  isPositive,
  isPackSize,
  isPercent,
  isBalance,
  isBigInt64,
  isBigUInt64,
  isBigPositive,
  isAccountId,
};
