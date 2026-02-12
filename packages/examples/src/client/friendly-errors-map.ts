import type {FriendlyErrors} from '@mionkit/core';
import {RouteParamType} from '@mionkit/client';

import type {MyApi} from './friendly-errors-server.ts';
export type User = RouteParamType<MyApi['setUser'], 0>;

export const userFriendlyErrors: FriendlyErrors<User> = {
    // Handler is called ONCE per field with ALL aggregated error params
    name: (failed) => {
        // All failed constraints are available at once
        const messages: string[] = [];
        if (failed.minLength) messages.push(`at least ${failed.minLength.val} characters`);
        if (failed.maxLength) messages.push(`at most ${failed.maxLength.val} characters`);
        if (messages.length > 0) return `Name must be ${messages.join(' and ')}`;
        return 'Name must be a valid string';
    },
    age: (failed) => {
        const messages: string[] = [];
        if (failed.min) messages.push(`at least ${failed.min.val}`);
        if (failed.max) messages.push(`at most ${failed.max.val}`);
        if (messages.length > 0) return `Age must be ${messages.join(' and ')} years`;
        return 'Age must be a valid number';
    },
    balance: (failed) => {
        if (failed.min) return `Balance cannot be negative`;
        return 'Balance must be a valid number';
    },
    isActive: () => `isActive must be a boolean (true or false)`,
    tags: (failed) => {
        return `Tag ${failed.index} must be a valid string`;
    },
    createdAt: (failed) => {
        const messages: string[] = [];
        if (failed.date) messages.push('date format is invalid');
        if (failed.time) messages.push('time format is invalid');
        if (failed.splitChar) messages.push('separator is invalid');
        if (messages.length > 0) return `Created at: ${messages.join(', ')}`;
        return `Created at must be a valid date-time string`;
    },
    nested: {
        email: (failed) => {
            const messages: string[] = [];
            if (failed.pattern) messages.push('invalid format');
            if (failed.localPart) messages.push('invalid username');
            if (failed.domain) messages.push('invalid domain');
            if (messages.length > 0) return `Email: ${messages.join(', ')}`;
            return `Email must be a valid string`;
        },
        score: (failed) => {
            const messages: string[] = [];
            if (failed.min) messages.push(`at least ${failed.min.val}`);
            if (failed.max) messages.push(`at most ${failed.max.val}`);
            if (messages.length > 0) return `Score must be ${messages.join(' and ')}`;
            return `Score must be a valid number`;
        },
    },
};
