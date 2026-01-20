/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getFriendlyErrors, defaultErrorPrinter} from './friendlyErrors';
import type {RunTypeError} from './types/general.types';
import type {FriendlyErrors} from './types/friendlyErrors.types';

describe('friendlyErrors', () => {
    describe('defaultErrorPrinter', () => {
        it('should generate message for basic type error', () => {
            const error: RunTypeError = {
                path: ['name'],
                expected: 'string',
            };
            expect(defaultErrorPrinter(error)).toBe('name: expected string');
        });

        it('should generate message for format error', () => {
            const error: RunTypeError = {
                path: ['name'],
                expected: 'string',
                format: {
                    name: 'stringFormat',
                    val: 2,
                    formatPath: ['minLength'],
                },
            };
            expect(defaultErrorPrinter(error)).toBe('name: minLength validation failed (expected 2)');
        });

        it('should handle nested paths (uses last item only)', () => {
            const error: RunTypeError = {
                path: ['users', 0, 'email'],
                expected: 'string',
            };
            expect(defaultErrorPrinter(error)).toBe('email: expected string');
        });

        it('should handle empty path', () => {
            const error: RunTypeError = {
                path: [],
                expected: 'object',
            };
            expect(defaultErrorPrinter(error)).toBe('value: expected object');
        });
    });

    describe('getFriendlyErrors', () => {
        it('should return empty object for empty errors array', () => {
            const result = getFriendlyErrors([]);
            expect(result).toEqual({});
        });

        it('should use default printer when no errorsMap provided', () => {
            const errors: RunTypeError[] = [
                {path: ['name'], expected: 'string'},
                {path: ['age'], expected: 'number'},
            ];
            const result = getFriendlyErrors(errors);
            expect(result).toEqual({
                name: ['name: expected string'],
                age: ['age: expected number'],
            });
        });

        it('should use custom handler when provided', () => {
            type User = {name: string; age: number};
            const errors: RunTypeError[] = [{path: ['name'], expected: 'string'}];
            const errorsMap: FriendlyErrors<User> = {
                name: () => 'Name is required',
            };
            const result = getFriendlyErrors<User>(errors, errorsMap);
            expect(result).toEqual({
                name: ['Name is required'],
            });
        });

        it('should pass error params to handler', () => {
            type User = {name: string};
            const errors: RunTypeError[] = [
                {
                    path: ['name'],
                    expected: 'string',
                    format: {
                        name: 'stringFormat',
                        val: 5,
                        formatPath: ['minLength'],
                    },
                },
            ];
            const errorsMap: FriendlyErrors<User> = {
                name: (params) => `Name must be at least ${params.minLength?.val} characters`,
            };
            const result = getFriendlyErrors<User>(errors, errorsMap);
            expect(result).toEqual({
                name: ['Name must be at least 5 characters'],
            });
        });

        it('should handle $type for basic type errors', () => {
            type User = {isActive: boolean};
            const errors: RunTypeError[] = [{path: ['isActive'], expected: 'boolean'}];
            const errorsMap: FriendlyErrors<User> = {
                isActive: (params) => `Expected ${params.rtError?.expected}`,
            };
            const result = getFriendlyErrors<User>(errors, errorsMap);
            expect(result).toEqual({
                isActive: ['Expected boolean'],
            });
        });

        it('should handle nested object errors', () => {
            type User = {address: {street: string; city: string}};
            const errors: RunTypeError[] = [
                {path: ['address', 'street'], expected: 'string'},
                {path: ['address', 'city'], expected: 'string'},
            ];
            const errorsMap: FriendlyErrors<User> = {
                address: {
                    street: () => 'Street is required',
                    city: () => 'City is required',
                },
            };
            const result = getFriendlyErrors<User>(errors, errorsMap);
            expect(result).toEqual({
                address: {
                    street: ['Street is required'],
                    city: ['City is required'],
                },
            });
        });

        it('should handle array errors with numeric indices', () => {
            type User = {tags: string[]};
            const errors: RunTypeError[] = [
                {path: ['tags', 0], expected: 'string'},
                {path: ['tags', 2], expected: 'string'},
            ];
            const result = getFriendlyErrors<User>(errors);
            expect(result).toEqual({
                tags: {
                    0: ['0: expected string'],
                    2: ['2: expected string'],
                },
            });
        });

        it('should collect unique errors for same property', () => {
            type User = {name: string};
            const errors: RunTypeError[] = [
                {path: ['name'], expected: 'string', format: {name: 'stringFormat', val: 2, formatPath: ['minLength']}},
                {path: ['name'], expected: 'string', format: {name: 'stringFormat', val: 50, formatPath: ['maxLength']}},
            ];
            const errorsMap: FriendlyErrors<User> = {
                name: (params) => {
                    if (params.minLength) return `Min ${params.minLength.val}`;
                    if (params.maxLength) return `Max ${params.maxLength.val}`;
                    return 'Invalid';
                },
            };
            const result = getFriendlyErrors<User>(errors, errorsMap);
            expect(result).toEqual({
                name: ['Min 2', 'Max 50'],
            });
        });

        it('should deduplicate identical error messages', () => {
            type User = {name: string};
            const errors: RunTypeError[] = [
                {path: ['name'], expected: 'string', format: {name: 'stringFormat', val: 2, formatPath: ['minLength']}},
                {path: ['name'], expected: 'string', format: {name: 'stringFormat', val: 2, formatPath: ['minLength']}},
            ];
            const errorsMap: FriendlyErrors<User> = {
                name: (params) => {
                    if (params.minLength) return `Min ${params.minLength.val}`;
                    return 'Invalid';
                },
            };
            const result = getFriendlyErrors<User>(errors, errorsMap);
            expect(result).toEqual({
                name: ['Min 2'], // Only one unique message due to Set deduplication
            });
        });
    });
});
