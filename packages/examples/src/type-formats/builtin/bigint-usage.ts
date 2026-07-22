import {BigInt, BigPositive, BigNegative, BigPositiveInt, BigNegativeInt, BigInt64, BigUInt64} from '@ts-runtypes/core/formats';

// Predefined bigint formats
type AccountBalance = BigPositive; // bigint >= 0n
type DebtAmount = BigNegative; // bigint <= 0n
type ItemCount = BigPositiveInt; // positive integer bigint
type Adjustment = BigNegativeInt; // negative integer bigint
type DbBigInt = BigInt64; // signed 64-bit, 8-byte binary
type DbUBigInt = BigUInt64; // unsigned 64-bit, 8-byte binary

// Custom bigint format with all parameters
type Score = BigInt<{
    min: 0n;
    max: 1000000n;
    multipleOf: 10n;
}>;

type Wallet = {
    balance: AccountBalance;
    debt: DebtAmount;
    items: ItemCount;
    adjustment: Adjustment;
    dbId: DbBigInt;
    dbUid: DbUBigInt;
    score: Score;
};
