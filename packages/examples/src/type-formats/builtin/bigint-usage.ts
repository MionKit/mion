import {
    FormatBigInt,
    FormatBigPositive,
    FormatBigNegative,
    FormatBigPositiveInt,
    FormatBigNegativeInt,
    FormatBigInt64,
    FormatBigUInt64,
} from '@mionjs/type-formats/BigintFormats';

// Predefined bigint formats
type AccountBalance = FormatBigPositive; // bigint >= 0n
type DebtAmount = FormatBigNegative; // bigint <= 0n
type ItemCount = FormatBigPositiveInt; // positive integer bigint
type Adjustment = FormatBigNegativeInt; // negative integer bigint
type DbBigInt = FormatBigInt64; // signed 64-bit, 8-byte binary
type DbUBigInt = FormatBigUInt64; // unsigned 64-bit, 8-byte binary

// Custom bigint format with all parameters
type Score = FormatBigInt<{
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
