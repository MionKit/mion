import type {
    FriendlyErrors,
    StringErrorParams,
    EmailErrorParams,
    DateTimeErrorParams,
    NumberErrorParams,
    BigIntErrorParams,
} from '@mionkit/core';
import {RouteParamType} from '@mionkit/client';

import type {MyApi} from './friendly-errors-server';
export type User = RouteParamType<MyApi['setUser'], 0>;

export const userFriendlyErrors: FriendlyErrors<User> = {
    // Handler functions might be called multiple times with different parameters
    name: (failed: StringErrorParams) => {
        if (failed.minLength) return `Name must be at least ${failed.minLength.val} characters`;
        if (failed.maxLength) return `Name must be at most ${failed.maxLength.val} characters`;
        return 'Name must be a valid string';
    },
    age: (failed: NumberErrorParams) => {
        if (failed.min) return `Age must be at least ${failed.min.val} years`;
        if (failed.max) return `Age must be at most ${failed.max.val} years`;
        return 'Age must be a valid number';
    },
    balance: (failed: BigIntErrorParams) => {
        if (failed.min) return `Balance cannot be negative`;
        return 'Balance must be a valid number';
    },
    isActive: () => `isActive must be a boolean (true or false)`,
    tags: (failed) => {
        return `Tag ${failed.index} must be a valid string`;
    },
    createdAt: (failed: DateTimeErrorParams) => {
        if (failed.date) return `Created date format is invalid`;
        if (failed.time) return `Created time format is invalid`;
        if (failed.splitChar) return `DateTime separator is invalid`;
        return `Created at must be a valid date-time string`;
    },
    nested: {
        email: (failed: EmailErrorParams) => {
            if (failed.pattern) return `Please enter a valid email address`;
            if (failed.localPart) return `Email username is invalid`;
            if (failed.domain) return `Email domain is invalid`;
            return `Email must be a valid string`;
        },
        score: (failed: NumberErrorParams) => {
            if (failed.min) return `Score must be at least ${failed.min.val}`;
            if (failed.max) return `Score must be at most ${failed.max.val}`;
            return `Score must be a valid number`;
        },
    },
};
