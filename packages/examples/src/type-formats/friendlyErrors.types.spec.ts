/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Type-level tests to verify FriendlyErrors handler params are correctly typed.
 * These tests use compile-time assertions - if types don't match, compilation fails.
 */

import type {
    FriendlyErrors,
    FriendlyStringErrorParams,
    FriendlyNumberErrorParams,
    FriendlyBigIntErrorParams,
    TypeErrorParam,
    // Specific string format error params for narrowing
    StringErrorParams,
    EmailErrorParams,
    DateTimeErrorParams,
} from '@mionkit/core';

import {StrFormat, NumFormat, BigNumFormat, StrEmail, StrDateTime} from '@mionkit/type-formats';

// ============================================================================
// Test Types - Objects with different property types using real format types
// ============================================================================

type UserWithFormats = {
    name: StrFormat<{maxLength: 100; minLength: 2}>;
    age: NumFormat<{min: 0; max: 150}>;
    balance: BigNumFormat<{min: 0n}>;
    isActive: boolean;
    tags: string[];
    createdAt: StrDateTime;
    nested: {
        email: StrEmail;
        score: NumFormat<{min: 0}>;
    };
};

// ============================================================================
// Test: Handler params have correct types for each property
// ============================================================================

// This object definition will fail to compile if handler params are incorrectly typed
const _testHandlers: FriendlyErrors<UserWithFormats> = {
    // String format property - using specific StringErrorParams for narrowing
    name: (params?: StringErrorParams) => {
        // params should have string format properties like maxLength, minLength, pattern
        if (params?.maxLength) return `Max length: ${params.maxLength.val}`;
        if (params?.minLength) return `Min length: ${params.minLength.val}`;
        if (params?.pattern) return `Pattern: ${params.pattern.val}`;
        return `Name error: ${params?.$type?.expected || 'invalid'}`;
    },

    // Number format property - should receive FriendlyNumberErrorParams
    age: (params) => {
        // params should have number format properties like min, max, multipleOf
        if (params?.min) return `Min: ${params.min.val}`;
        if (params?.max) return `Max: ${params.max.val}`;
        if (params?.multipleOf) return `MultipleOf: ${params.multipleOf.val}`;
        return `Age error: ${params?.$type?.expected || 'invalid'}`;
    },

    // BigInt format property - should receive FriendlyBigIntErrorParams
    balance: (params) => {
        // params should have bigint format properties like min, max, multipleOf
        if (params?.min) return `Min: ${params.min.val}`;
        if (params?.max) return `Max: ${params.max.val}`;
        if (params?.multipleOf) return `MultipleOf: ${params.multipleOf.val}`;
        return `Balance error: ${params?.$type?.expected || 'invalid'}`;
    },

    // Plain boolean - should receive TypeErrorParam only
    isActive: (params) => {
        return `isActive error: ${params?.$type?.expected || 'invalid'}`;
    },

    // Array of strings - handler receives string error params
    tags: (params) => {
        return `Tags error: ${params?.$type?.expected || 'invalid'}`;
    },

    // DateTime format - using specific DateTimeErrorParams for narrowing
    createdAt: (params?: DateTimeErrorParams) => {
        // DateTime has date, time, splitChar properties
        if (params?.date) return `Date: ${params.date.val}`;
        if (params?.time) return `Time: ${params.time.val}`;
        if (params?.splitChar) return `SplitChar: ${params.splitChar.val}`;
        return `DateTime error: ${params?.$type?.expected || 'invalid'}`;
    },

    // Nested object with format types
    nested: {
        // Email format - using specific EmailErrorParams for narrowing
        email: (params?: EmailErrorParams) => {
            // Email has pattern, localPart, domain properties
            if (params?.pattern) return `Pattern: ${params.pattern.val}`;
            if (params?.localPart) return `LocalPart: ${params.localPart.val}`;
            if (params?.domain) return `Domain: ${params.domain.val}`;
            return `Email error: ${params?.$type?.expected || 'invalid'}`;
        },
        score: (params) => {
            // Should be FriendlyNumberErrorParams
            if (params?.min) return `Min: ${params.min.val}`;
            return `Score error: ${params?.$type?.expected || 'invalid'}`;
        },
    },
};

// Suppress unused variable warning
void _testHandlers;

// ============================================================================
// Additional type assertions to verify param types are correct
// ============================================================================

// Extract the handler type for each property and verify params type
type NameHandler = NonNullable<FriendlyErrors<UserWithFormats>['name']>;
type AgeHandler = NonNullable<FriendlyErrors<UserWithFormats>['age']>;
type BalanceHandler = NonNullable<FriendlyErrors<UserWithFormats>['balance']>;
type IsActiveHandler = NonNullable<FriendlyErrors<UserWithFormats>['isActive']>;
type CreatedAtHandler = NonNullable<FriendlyErrors<UserWithFormats>['createdAt']>;

// These assertions verify the handler parameter types
type AssertNameParams = NameHandler extends (params?: FriendlyStringErrorParams) => string ? true : never;
type AssertAgeParams = AgeHandler extends (params?: FriendlyNumberErrorParams) => string ? true : never;
type AssertBalanceParams = BalanceHandler extends (params?: FriendlyBigIntErrorParams) => string ? true : never;
type AssertIsActiveParams = IsActiveHandler extends (params?: TypeErrorParam) => string ? true : never;
type AssertCreatedAtParams = CreatedAtHandler extends (params?: FriendlyStringErrorParams) => string ? true : never;

const _assertions: {
    nameParams: AssertNameParams;
    ageParams: AssertAgeParams;
    balanceParams: AssertBalanceParams;
    isActiveParams: AssertIsActiveParams;
    createdAtParams: AssertCreatedAtParams;
} = {
    nameParams: true,
    ageParams: true,
    balanceParams: true,
    isActiveParams: true,
    createdAtParams: true,
};

void _assertions;

// ============================================================================
// Runtime test to make Jest happy (type tests above are compile-time only)
// ============================================================================

describe('FriendlyErrors handler params types', () => {
    it('should have correct param types for each property type (compile-time verified)', () => {
        // This test exists to satisfy Jest's requirement for at least one test.
        // The actual type-level tests are the type assertions above.
        // If handler param types are wrong, TypeScript compilation fails before Jest runs.
        expect(_testHandlers).toBeDefined();
        expect(_assertions).toBeDefined();
    });
});
