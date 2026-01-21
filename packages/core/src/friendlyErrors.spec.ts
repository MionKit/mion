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
                name: 'name: expected string',
                age: 'age: expected number',
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
                name: 'Name is required',
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
                name: 'Name must be at least 5 characters',
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
                isActive: 'Expected boolean',
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
                    street: 'Street is required',
                    city: 'City is required',
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
                    0: '0: expected string',
                    2: '2: expected string',
                },
            });
            // Verify only failed indices are present
            expect(result.tags).not.toHaveProperty('1');
        });

        it('should handle array errors with custom handler', () => {
            type User = {tags: string[]};
            const errors: RunTypeError[] = [
                {path: ['tags', 2], expected: 'string', format: {name: 'stringFormat', val: 2, formatPath: ['minLength']}},
                {path: ['tags', 5], expected: 'string', format: {name: 'stringFormat', val: 2, formatPath: ['minLength']}},
            ];
            const errorsMap: FriendlyErrors<User> = {
                tags: (params) => `Tag at index ${params.index} must be at least ${params.minLength?.val} characters`,
            };
            const result = getFriendlyErrors<User>(errors, errorsMap);
            expect(result).toEqual({
                tags: {
                    2: 'Tag at index 2 must be at least 2 characters',
                    5: 'Tag at index 5 must be at least 2 characters',
                },
            });
        });

        it('should handle top-level array type (string[])', () => {
            type Tags = string[];
            const errors: RunTypeError[] = [
                {path: [3], expected: 'string', format: {name: 'stringFormat', val: 2, formatPath: ['minLength']}},
            ];
            const errorsMap: FriendlyErrors<Tags> = (params) => `Item ${params.index} is invalid`;
            const result = getFriendlyErrors<Tags>(errors, errorsMap);
            expect(result).toEqual({
                3: 'Item 3 is invalid',
            });
        });

        it('should aggregate all errors for same property and call handler once', () => {
            type User = {name: string};
            const errors: RunTypeError[] = [
                {path: ['name'], expected: 'string', format: {name: 'stringFormat', val: 2, formatPath: ['minLength']}},
                {path: ['name'], expected: 'string', format: {name: 'stringFormat', val: 50, formatPath: ['maxLength']}},
            ];
            let handlerCallCount = 0;
            const errorsMap: FriendlyErrors<User> = {
                name: (params) => {
                    handlerCallCount++;
                    // Handler receives ALL aggregated params at once
                    const messages: string[] = [];
                    if (params.minLength) messages.push(`Min ${params.minLength.val}`);
                    if (params.maxLength) messages.push(`Max ${params.maxLength.val}`);
                    return messages.join(', ') || 'Invalid';
                },
            };
            const result = getFriendlyErrors<User>(errors, errorsMap);
            expect(handlerCallCount).toBe(1); // Handler called only once with all params
            expect(result).toEqual({
                name: 'Min 2, Max 50', // Single message with all errors
            });
        });

        it('should provide rtErrors array with all errors for the field', () => {
            type User = {name: string};
            const errors: RunTypeError[] = [
                {path: ['name'], expected: 'string', format: {name: 'stringFormat', val: 2, formatPath: ['minLength']}},
                {path: ['name'], expected: 'string', format: {name: 'stringFormat', val: 50, formatPath: ['maxLength']}},
            ];
            let receivedParams: unknown;
            const errorsMap: FriendlyErrors<User> = {
                name: (params) => {
                    receivedParams = params;
                    return 'Error';
                },
            };
            getFriendlyErrors<User>(errors, errorsMap);
            expect((receivedParams as {rtErrors: RunTypeError[]}).rtErrors).toHaveLength(2);
            expect((receivedParams as {rtErrors: RunTypeError[]}).rtErrors[0].format?.formatPath[0]).toBe('minLength');
            expect((receivedParams as {rtErrors: RunTypeError[]}).rtErrors[1].format?.formatPath[0]).toBe('maxLength');
        });

        it('should deduplicate identical error messages', () => {
            type User = {name: string};
            const errors: RunTypeError[] = [
                {path: ['name'], expected: 'string', format: {name: 'stringFormat', val: 2, formatPath: ['minLength']}},
                {path: ['name'], expected: 'string', format: {name: 'stringFormat', val: 2, formatPath: ['minLength']}},
            ];
            const errorsMap: FriendlyErrors<User> = {
                name: (params) => {
                    // With aggregation, duplicate errors are merged, so minLength appears once
                    if (params.minLength) return `Min ${params.minLength.val}`;
                    return 'Invalid';
                },
            };
            const result = getFriendlyErrors<User>(errors, errorsMap);
            expect(result).toEqual({
                name: 'Min 2', // Single message from single handler call
            });
        });

        it('should use defaultErrorPrinter for each error when no handler provided', () => {
            type User = {name: string};
            const errors: RunTypeError[] = [
                {path: ['name'], expected: 'string', format: {name: 'stringFormat', val: 2, formatPath: ['minLength']}},
                {path: ['name'], expected: 'string', format: {name: 'stringFormat', val: 50, formatPath: ['maxLength']}},
            ];
            const result = getFriendlyErrors<User>(errors);
            // Without handler, defaultErrorPrinter is called for each error and joined with '; '
            expect(result).toEqual({
                name: 'name: minLength validation failed (expected 2); name: maxLength validation failed (expected 50)',
            });
        });

        it('should handle root level errors', () => {
            const errors: RunTypeError[] = [{path: [], expected: 'object'}];
            const result = getFriendlyErrors(errors);
            expect(result).toEqual({
                $root: 'value: expected object',
            });
        });

        // ============================================================================
        // Map Tests
        // ============================================================================

        it('should handle Map key errors with $key handler', () => {
            type UserMap = Map<string, number>;
            // Map key error path structure: {key: actualKey, index: position, failed: 'mapKey'}
            const errors: RunTypeError[] = [{path: [{key: 123, index: 0, failed: 'mapKey'}], expected: 'string'}];
            const errorsMap: FriendlyErrors<UserMap> = {
                $key: (params) => `Invalid key at position ${params.index}`,
            };
            const result = getFriendlyErrors<UserMap>(errors, errorsMap);
            expect(result).toEqual({
                $keys: {
                    0: 'Invalid key at position 0',
                },
            });
        });

        it('should handle Map value errors with $value handler', () => {
            type UserMap = Map<string, number>;
            // Map value error path structure: {key: actualKey, index: position, failed: 'mapVal'}
            const errors: RunTypeError[] = [{path: [{key: 'user1', index: 0, failed: 'mapVal'}], expected: 'number'}];
            const errorsMap: FriendlyErrors<UserMap> = {
                $value: (params) => `Invalid value at position ${params.index}`,
            };
            const result = getFriendlyErrors<UserMap>(errors, errorsMap);
            expect(result).toEqual({
                $values: {
                    0: 'Invalid value at position 0',
                },
            });
        });

        it('should handle Map with both key and value errors', () => {
            type UserMap = Map<string, number>;
            const errors: RunTypeError[] = [
                {path: [{key: 123, index: 0, failed: 'mapKey'}], expected: 'string'},
                {path: [{key: 'user1', index: 1, failed: 'mapVal'}], expected: 'number'},
            ];
            const errorsMap: FriendlyErrors<UserMap> = {
                $key: (params) => `Invalid key at ${params.index}`,
                $value: (params) => `Invalid value at ${params.index}`,
            };
            const result = getFriendlyErrors<UserMap>(errors, errorsMap);
            expect(result).toEqual({
                $keys: {
                    0: 'Invalid key at 0',
                },
                $values: {
                    1: 'Invalid value at 1',
                },
            });
        });

        it('should handle top-level Map with single handler', () => {
            type UserMap = Map<string, number>;
            const errors: RunTypeError[] = [{path: [{key: 'user1', index: 0, failed: 'mapVal'}], expected: 'number'}];
            const errorsMap: FriendlyErrors<UserMap> = (params) => `Map error at ${params.index}`;
            const result = getFriendlyErrors<UserMap>(errors, errorsMap);
            expect(result).toEqual({
                $values: {
                    0: 'Map error at 0',
                },
            });
        });

        it('should handle Map property in object', () => {
            type User = {settings: Map<string, boolean>};
            const errors: RunTypeError[] = [
                {path: ['settings', {key: 'darkMode', index: 0, failed: 'mapVal'}], expected: 'boolean'},
            ];
            const errorsMap: FriendlyErrors<User> = {
                settings: {
                    $value: (params) => `Setting value must be boolean`,
                },
            };
            const result = getFriendlyErrors<User>(errors, errorsMap);
            expect(result).toEqual({
                settings: {
                    $values: {
                        0: 'Setting value must be boolean',
                    },
                },
            });
        });

        // ============================================================================
        // Set Tests
        // ============================================================================

        it('should handle Set item errors with $item handler', () => {
            type TagSet = Set<string>;
            // Set item error path structure: {key: actualValue, index: position}
            const errors: RunTypeError[] = [{path: [{key: 123, index: 0}], expected: 'string'}];
            const errorsMap: FriendlyErrors<TagSet> = {
                $item: (params) => `Invalid item at position ${params.index}`,
            };
            const result = getFriendlyErrors<TagSet>(errors, errorsMap);
            expect(result).toEqual({
                0: 'Invalid item at position 0',
            });
        });

        it('should handle top-level Set with single handler', () => {
            type TagSet = Set<string>;
            const errors: RunTypeError[] = [{path: [{key: 123, index: 2}], expected: 'string'}];
            const errorsMap: FriendlyErrors<TagSet> = (params) => `Set item error at ${params.index}`;
            const result = getFriendlyErrors<TagSet>(errors, errorsMap);
            expect(result).toEqual({
                2: 'Set item error at 2',
            });
        });

        it('should handle Set property in object', () => {
            type User = {tags: Set<string>};
            const errors: RunTypeError[] = [{path: ['tags', {key: 123, index: 1}], expected: 'string'}];
            const errorsMap: FriendlyErrors<User> = {
                tags: {
                    $item: (params) => `Tag must be a string`,
                },
            };
            const result = getFriendlyErrors<User>(errors, errorsMap);
            expect(result).toEqual({
                tags: {
                    1: 'Tag must be a string',
                },
            });
        });

        it('should handle multiple Set item errors', () => {
            type TagSet = Set<string>;
            const errors: RunTypeError[] = [
                {path: [{key: 123, index: 0}], expected: 'string'},
                {path: [{key: 456, index: 2}], expected: 'string'},
            ];
            const errorsMap: FriendlyErrors<TagSet> = {
                $item: (params) => `Item ${params.index} is invalid`,
            };
            const result = getFriendlyErrors<TagSet>(errors, errorsMap);
            expect(result).toEqual({
                0: 'Item 0 is invalid',
                2: 'Item 2 is invalid',
            });
        });

        // ============================================================================
        // Default Error Printer for Map/Set
        // ============================================================================

        it('should use defaultErrorPrinter for Map errors without handler', () => {
            type UserMap = Map<string, number>;
            const errors: RunTypeError[] = [
                {path: [{key: 123, index: 0, failed: 'mapKey'}], expected: 'string'},
                {path: [{key: 'user1', index: 1, failed: 'mapVal'}], expected: 'number'},
            ];
            const result = getFriendlyErrors<UserMap>(errors);
            expect(result).toEqual({
                $keys: {
                    0: 'mapKey[0]: expected string',
                },
                $values: {
                    1: 'mapValue[1]: expected number',
                },
            });
        });

        it('should use defaultErrorPrinter for Set errors without handler', () => {
            type TagSet = Set<string>;
            const errors: RunTypeError[] = [{path: [{key: 123, index: 0}], expected: 'string'}];
            const result = getFriendlyErrors<TagSet>(errors);
            expect(result).toEqual({
                0: 'setItem[0]: expected string',
            });
        });

        // ============================================================================
        // Top-level Object Tests
        // ============================================================================

        it('should handle top-level object type', () => {
            type User = {name: string; age: number};
            const errors: RunTypeError[] = [
                {path: ['name'], expected: 'string'},
                {path: ['age'], expected: 'number'},
            ];
            const errorsMap: FriendlyErrors<User> = {
                name: () => 'Name is required',
                age: () => 'Age must be a number',
            };
            const result = getFriendlyErrors<User>(errors, errorsMap);
            expect(result).toEqual({
                name: 'Name is required',
                age: 'Age must be a number',
            });
        });

        // ============================================================================
        // Complex Objects in Collections Tests
        // ============================================================================

        it('should handle array of complex objects with nested handlers', () => {
            type User = {name: string; email: string};
            type Users = User[];
            // Error path for array of objects: [index, propertyName]
            const errors: RunTypeError[] = [
                {path: [0, 'name'], expected: 'string', format: {name: 'stringFormat', val: 2, formatPath: ['minLength']}},
                {path: [1, 'email'], expected: 'string'},
            ];
            const errorsMap: FriendlyErrors<Users> = {
                name: (params) => `User name must be at least ${params.minLength?.val} characters`,
                email: () => 'User email is required',
            };
            const result = getFriendlyErrors<Users>(errors, errorsMap);
            expect(result).toEqual({
                0: {
                    name: 'User name must be at least 2 characters',
                },
                1: {
                    email: 'User email is required',
                },
            });
        });

        it('should handle Map with complex object values and nested handlers', () => {
            type User = {name: string; age: number};
            type UserMap = Map<string, User>;
            // Error path for Map with object values: [{mapVal segment}, propertyName]
            const errors: RunTypeError[] = [
                {path: [{key: 'user1', index: 0, failed: 'mapVal'}, 'name'], expected: 'string'},
                {path: [{key: 'user2', index: 1, failed: 'mapVal'}, 'age'], expected: 'number'},
            ];
            const errorsMap: FriendlyErrors<UserMap> = {
                $value: {
                    name: () => 'Name is required',
                    age: () => 'Age must be a number',
                },
            };
            const result = getFriendlyErrors<UserMap>(errors, errorsMap);
            expect(result).toEqual({
                $values: {
                    0: {
                        name: 'Name is required',
                    },
                    1: {
                        age: 'Age must be a number',
                    },
                },
            });
        });

        it('should handle Set of complex objects with nested handlers', () => {
            type User = {name: string; email: string};
            type UserSet = Set<User>;
            // Error path for Set with object items: [{setItem segment}, propertyName]
            const errors: RunTypeError[] = [
                {path: [{key: {name: 'John'}, index: 0}, 'name'], expected: 'string'},
                {path: [{key: {name: 'Jane'}, index: 1}, 'email'], expected: 'string'},
            ];
            const errorsMap: FriendlyErrors<UserSet> = {
                $item: {
                    name: () => 'Name is required',
                    email: () => 'Email is required',
                },
            };
            const result = getFriendlyErrors<UserSet>(errors, errorsMap);
            expect(result).toEqual({
                0: {
                    name: 'Name is required',
                },
                1: {
                    email: 'Email is required',
                },
            });
        });

        it('should handle deeply nested complex objects in array', () => {
            type Address = {street: string; city: string};
            type User = {name: string; address: Address};
            type Users = User[];
            // Error path for deeply nested: [index, 'address', 'street']
            const errors: RunTypeError[] = [
                {path: [0, 'address', 'street'], expected: 'string'},
                {path: [0, 'address', 'city'], expected: 'string'},
            ];
            const errorsMap: FriendlyErrors<Users> = {
                name: () => 'Name is required',
                address: {
                    street: () => 'Street is required',
                    city: () => 'City is required',
                },
            };
            const result = getFriendlyErrors<Users>(errors, errorsMap);
            expect(result).toEqual({
                0: {
                    address: {
                        street: 'Street is required',
                        city: 'City is required',
                    },
                },
            });
        });

        it('should handle Map with complex key objects (using $key handler)', () => {
            type KeyObj = {id: string; type: string};
            type DataMap = Map<KeyObj, number>;
            // For complex keys, we still use a single $key handler since keys are typically validated as a whole
            const errors: RunTypeError[] = [
                {path: [{key: {id: '', type: 'user'}, index: 0, failed: 'mapKey'}], expected: 'object'},
            ];
            const errorsMap: FriendlyErrors<DataMap> = {
                $key: (params) => `Invalid key at position ${params.index}`,
            };
            const result = getFriendlyErrors<DataMap>(errors, errorsMap);
            expect(result).toEqual({
                $keys: {
                    0: 'Invalid key at position 0',
                },
            });
        });

        it('should handle object property with array of complex objects', () => {
            type User = {name: string};
            type Team = {members: User[]};
            const errors: RunTypeError[] = [
                {path: ['members', 0, 'name'], expected: 'string'},
                {path: ['members', 2, 'name'], expected: 'string'},
            ];
            const errorsMap: FriendlyErrors<Team> = {
                members: {
                    name: () => 'Member name is required',
                },
            };
            const result = getFriendlyErrors<Team>(errors, errorsMap);
            expect(result).toEqual({
                members: {
                    0: {
                        name: 'Member name is required',
                    },
                    2: {
                        name: 'Member name is required',
                    },
                },
            });
        });

        it('should handle object property with Map of complex objects', () => {
            type User = {name: string};
            type Team = {userMap: Map<string, User>};
            const errors: RunTypeError[] = [
                {path: ['userMap', {key: 'user1', index: 0, failed: 'mapVal'}, 'name'], expected: 'string'},
            ];
            const errorsMap: FriendlyErrors<Team> = {
                userMap: {
                    $value: {
                        name: () => 'User name is required',
                    },
                },
            };
            const result = getFriendlyErrors<Team>(errors, errorsMap);
            expect(result).toEqual({
                userMap: {
                    $values: {
                        0: {
                            name: 'User name is required',
                        },
                    },
                },
            });
        });

        it('should handle object property with Set of complex objects', () => {
            type User = {name: string};
            type Team = {userSet: Set<User>};
            const errors: RunTypeError[] = [{path: ['userSet', {key: {name: 'John'}, index: 0}, 'name'], expected: 'string'}];
            const errorsMap: FriendlyErrors<Team> = {
                userSet: {
                    $item: {
                        name: () => 'User name is required',
                    },
                },
            };
            const result = getFriendlyErrors<Team>(errors, errorsMap);
            expect(result).toEqual({
                userSet: {
                    0: {
                        name: 'User name is required',
                    },
                },
            });
        });

        // ============================================================================
        // Reusable Error Maps Tests
        // ============================================================================

        it('should allow reusing an existing error map inside another map', () => {
            type User = {name: string; email: string};
            type Organization = {departments: Map<string, User[]>};

            // Define a reusable error map for User
            const userErrorsMap: FriendlyErrors<User> = {
                name: () => 'Name is required',
                email: () => 'Email is invalid',
            };

            // Reuse the userErrorsMap inside organizationErrorsMap
            const organizationErrorsMap: FriendlyErrors<Organization> = {
                departments: {
                    $key: (params) => `Department name at position ${params.index} is invalid`,
                    // Reuse the userErrorsMap for the array of Users
                    $value: userErrorsMap,
                },
            };

            // Error path: ['departments', {mapVal segment}, arrayIndex, 'name']
            const errors: RunTypeError[] = [
                {path: ['departments', {key: 'engineering', index: 0, failed: 'mapVal'}, 0, 'name'], expected: 'string'},
                {path: ['departments', {key: 'engineering', index: 0, failed: 'mapVal'}, 1, 'email'], expected: 'string'},
                {path: ['departments', {key: 'sales', index: 1, failed: 'mapVal'}, 0, 'name'], expected: 'string'},
            ];

            const result = getFriendlyErrors<Organization>(errors, organizationErrorsMap);
            expect(result).toEqual({
                departments: {
                    $values: {
                        0: {
                            0: {name: 'Name is required'},
                            1: {email: 'Email is invalid'},
                        },
                        1: {
                            0: {name: 'Name is required'},
                        },
                    },
                },
            });
        });

        it('should allow reusing error map for Set items', () => {
            type User = {name: string; age: number};
            type Team = {members: Set<User>};

            // Define a reusable error map for User
            const userErrorsMap: FriendlyErrors<User> = {
                name: () => 'Name is required',
                age: () => 'Age must be a number',
            };

            // Reuse the userErrorsMap for Set items
            const teamErrorsMap: FriendlyErrors<Team> = {
                members: {
                    $item: userErrorsMap,
                },
            };

            const errors: RunTypeError[] = [
                {path: ['members', {key: {name: 'John'}, index: 0}, 'name'], expected: 'string'},
                {path: ['members', {key: {name: 'Jane'}, index: 1}, 'age'], expected: 'number'},
            ];

            const result = getFriendlyErrors<Team>(errors, teamErrorsMap);
            expect(result).toEqual({
                members: {
                    0: {name: 'Name is required'},
                    1: {age: 'Age must be a number'},
                },
            });
        });

        it('should allow reusing error map for top-level array', () => {
            type User = {name: string; email: string};
            type UserList = User[];

            // Define a reusable error map for User
            const userErrorsMap: FriendlyErrors<User> = {
                name: () => 'Name is required',
                email: () => 'Email is invalid',
            };

            // Use the userErrorsMap directly for the array (since FriendlyErrors<User[]> = FriendlyErrors<User>)
            const errors: RunTypeError[] = [
                {path: [0, 'name'], expected: 'string'},
                {path: [1, 'email'], expected: 'string'},
            ];

            const result = getFriendlyErrors<UserList>(errors, userErrorsMap);
            expect(result).toEqual({
                0: {name: 'Name is required'},
                1: {email: 'Email is invalid'},
            });
        });
    });
});
