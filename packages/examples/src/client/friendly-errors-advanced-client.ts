/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Advanced FriendlyErrors Client Examples
 *
 * This file demonstrates how to use getFriendlyErrors() with advanced types:
 * - Top-level arrays (primitives and complex objects)
 * - Top-level Maps with $key and $value handlers (including nested handlers)
 * - Top-level Sets with $item handler (including nested handlers)
 * - Objects containing arrays, Maps, and Sets as properties
 */

import {getFriendlyErrors} from '@mionjs/core';
import type {RunTypeError, FriendlyErrorsResult} from '@mionjs/core';
import {
    tagListErrors,
    userListErrors,
    userMapErrors,
    roleSetErrors,
    userSetErrors,
    userProfileErrors,
    organizationErrors,
    simpleUserErrors,
} from './friendly-errors-advanced-map.ts';

// ============================================================================
// Example 1: Top-Level Array Validation
// ============================================================================

/**
 * Demonstrates handling validation errors for a top-level array type.
 * The result is a Record<index, errorMessage> where only failed indices are present.
 */
function handleTagListErrors() {
    type TagList = string[];

    // Simulated validation errors from the server
    // In real usage, these come from error.errorData?.typeErrors
    const errors: RunTypeError[] = [
        {path: [0], expected: 'string', format: {name: 'stringFormat', val: 3, formatPath: ['minLength']}},
        {path: [2], expected: 'string', format: {name: 'stringFormat', val: 50, formatPath: ['maxLength']}},
        // Index 1 is valid, so no error for it
    ];

    const result = getFriendlyErrors<TagList>(errors, tagListErrors);

    // Result structure: Record<StrNumber, string>
    // Only indices with errors are present
    console.log(result[0]); // 'Tag at index 0 must be at least 3 characters'
    console.log(result[2]); // 'Tag at index 2 must be at most 50 characters'
    console.log(result[1]); // undefined - no error for index 1

    // Iterate over all errors
    for (const [index, message] of Object.entries(result)) {
        console.log(`Tag ${index}: ${message}`);
    }
}

// ============================================================================
// Example 1b: Top-Level Array of Complex Objects
// ============================================================================

/**
 * Demonstrates handling validation errors for an array of complex objects.
 * The error map mirrors the structure of the array item type.
 * The result is Record<index, { property: errorMessage }>.
 */
function handleUserListErrors() {
    interface User {
        name: string;
        email: string;
        age: number;
    }
    type UserList = User[];

    // Simulated validation errors for array of objects
    // Path structure: [index, propertyName]
    const errors: RunTypeError[] = [
        {path: [0, 'name'], expected: 'string', format: {name: 'stringFormat', val: 2, formatPath: ['minLength']}},
        {path: [0, 'email'], expected: 'string'},
        {path: [2, 'age'], expected: 'number', format: {name: 'numberFormat', val: 0, formatPath: ['min']}},
    ];

    const result = getFriendlyErrors<UserList>(errors, userListErrors);

    // Result structure: Record<StrNumber, { name?: string; email?: string; age?: string }>
    // Only indices with errors are present, and only properties with errors are present
    console.log(result[0]?.name); // 'Name must be at least 2 characters'
    console.log(result[0]?.email); // 'Email must be a valid email address'
    console.log(result[2]?.age); // 'Age must be at least 0'
    console.log(result[1]); // undefined - no error for index 1

    // Iterate over all errors
    for (const [index, userErrors] of Object.entries(result)) {
        console.log(`User ${index} errors:`);
        for (const [field, message] of Object.entries(userErrors as Record<string, string>)) {
            console.log(`  ${field}: ${message}`);
        }
    }
}

// ============================================================================
// Example 2: Top-Level Map Validation with Separate Key/Value Handlers
// ============================================================================

/**
 * Demonstrates handling validation errors for a Map type with separate
 * handlers for key and value errors.
 * The result has $keys and $values records.
 */
function handleUserMapErrors() {
    interface User {
        name: string;
        email: string;
        age: number;
    }
    type UserMap = Map<string, User>;

    // Simulated validation errors - key error at position 0, value error at position 1
    const errors: RunTypeError[] = [
        // Key validation error at position 0
        {
            path: [{key: 'ab', index: 0, failed: 'mapKey'}],
            expected: 'string',
            format: {name: 'stringFormat', val: 3, formatPath: ['minLength']},
        },
        // Value validation error at position 1 (nested path for User.name)
        {
            path: [{key: 'user123', index: 1, failed: 'mapVal'}, 'name'],
            expected: 'string',
            format: {name: 'stringFormat', val: 2, formatPath: ['minLength']},
        },
    ];

    const result = getFriendlyErrors<UserMap>(errors, userMapErrors);

    // Result structure: { $keys?: Record<StrNumber, string>, $values?: Record<StrNumber, nested> }
    console.log(result.$keys?.[0]); // 'User ID at position 0 must be at least 3 characters'
    console.log((result.$values?.[1] as {name?: string})?.name); // 'Name must be at least 2 characters'

    // Check for key errors
    if (result.$keys) {
        for (const [position, message] of Object.entries(result.$keys)) {
            console.log(`Key error at position ${position}: ${message}`);
        }
    }

    // Check for value errors
    if (result.$values) {
        for (const [position, valueErrors] of Object.entries(result.$values)) {
            console.log(`Value errors at position ${position}:`, valueErrors);
        }
    }
}

// ============================================================================
// Example 3: Top-Level Set Validation
// ============================================================================

/**
 * Demonstrates handling validation errors for a Set type.
 * The result is a Record<index, errorMessage> similar to arrays.
 */
function handleRoleSetErrors() {
    type RoleSet = Set<string>;

    // Simulated validation errors
    const errors: RunTypeError[] = [
        {path: [{key: 'a', index: 0}], expected: 'string', format: {name: 'stringFormat', val: 2, formatPath: ['minLength']}},
        {path: [{key: 'admin', index: 2}], expected: 'string', format: {name: 'stringFormat', val: 3, formatPath: ['maxLength']}},
    ];

    const result = getFriendlyErrors<RoleSet>(errors, roleSetErrors);

    // Result structure: Record<StrNumber, string>
    console.log(result[0]); // 'Role at position 0 must be at least 2 characters'
    console.log(result[2]); // 'Role at position 2 must be at most 3 characters'

    // Iterate over all errors
    for (const [index, message] of Object.entries(result)) {
        console.log(`Role ${index}: ${message}`);
    }
}

// ============================================================================
// Example 3b: Top-Level Set of Complex Objects
// ============================================================================

/**
 * Demonstrates handling validation errors for a Set of complex objects.
 * The $item handler contains nested handlers for each property.
 */
function handleUserSetErrors() {
    interface User {
        name: string;
        email: string;
        age: number;
    }
    type UserSet = Set<User>;

    // Simulated validation errors for Set of objects
    // Path structure: [{setItem segment}, propertyName]
    const errors: RunTypeError[] = [
        {
            path: [{key: {name: 'John'}, index: 0}, 'name'],
            expected: 'string',
            format: {name: 'stringFormat', val: 2, formatPath: ['minLength']},
        },
        {path: [{key: {name: 'Jane'}, index: 1}, 'email'], expected: 'string'},
    ];

    const result = getFriendlyErrors<UserSet>(errors, userSetErrors);

    // Result structure: Record<StrNumber, { name?: string; email?: string; age?: string }>
    console.log(result[0]?.name); // 'Name must be at least 2 characters'
    console.log(result[1]?.email); // 'Email must be a valid email address'

    // Iterate over all errors
    for (const [index, userErrors] of Object.entries(result)) {
        console.log(`User at position ${index} errors:`);
        for (const [field, message] of Object.entries(userErrors as Record<string, string>)) {
            console.log(`  ${field}: ${message}`);
        }
    }
}

// ============================================================================
// Example 4: Object with Array, Map, and Set Properties
// ============================================================================

/**
 * Demonstrates handling validation errors for an object containing
 * arrays, Maps, and Sets as properties.
 */
function handleUserProfileErrors() {
    interface User {
        name: string;
        email: string;
        age: number;
    }
    interface UserProfile {
        id: string;
        tags: string[];
        settings: Map<string, boolean>;
        roles: Set<string>;
        user: User;
    }

    // Simulated validation errors for various properties
    const errors: RunTypeError[] = [
        // ID error
        {path: ['id'], expected: 'string', format: {name: 'stringFormat', val: 5, formatPath: ['minLength']}},
        // Array item error at index 1
        {path: ['tags', 1], expected: 'string', format: {name: 'stringFormat', val: 2, formatPath: ['minLength']}},
        // Map key error at position 0
        {path: ['settings', {key: 'x', index: 0, failed: 'mapKey'}], expected: 'string'},
        // Map value error at position 1
        {path: ['settings', {key: 'darkMode', index: 1, failed: 'mapVal'}], expected: 'boolean'},
        // Set item error at position 2
        {
            path: ['roles', {key: 'a', index: 2}],
            expected: 'string',
            format: {name: 'stringFormat', val: 2, formatPath: ['minLength']},
        },
        // Nested user error
        {path: ['user', 'name'], expected: 'string', format: {name: 'stringFormat', val: 2, formatPath: ['minLength']}},
    ];

    const result = getFriendlyErrors<UserProfile>(errors, userProfileErrors);

    // Access different error types
    console.log(result.id); // 'ID must be at least 5 characters'
    console.log(result.tags?.[1]); // 'Tag at index 1 must be at least 2 characters'
    console.log(result.settings?.$keys?.[0]); // 'Setting name at position 0 is invalid'
    console.log(result.settings?.$values?.[1]); // 'Setting value at position 1 must be a boolean'
    console.log(result.roles?.[2]); // 'Role at position 2 must be at least 2 characters'
    console.log(result.user?.name); // 'Name must be at least 2 characters'

    // Display all errors in a form
    displayFormErrors(result);
}

/**
 * Helper function to display errors in a form-like structure
 */
function displayFormErrors(errors: Record<string, unknown>) {
    for (const [field, error] of Object.entries(errors)) {
        if (typeof error === 'string') {
            console.log(`${field}: ${error}`);
        } else if (error && typeof error === 'object') {
            // Handle nested errors (arrays, maps, sets, objects)
            if ('$keys' in error || '$values' in error) {
                // Map errors
                const mapError = error as {$keys?: Record<string, string>; $values?: Record<string, unknown>};
                if (mapError.$keys) {
                    for (const [pos, msg] of Object.entries(mapError.$keys)) {
                        console.log(`${field} key[${pos}]: ${msg}`);
                    }
                }
                if (mapError.$values) {
                    for (const [pos, val] of Object.entries(mapError.$values)) {
                        console.log(`${field} value[${pos}]:`, val);
                    }
                }
            } else {
                // Array, Set, or nested object errors
                for (const [key, val] of Object.entries(error)) {
                    if (typeof val === 'string') {
                        console.log(`${field}[${key}]: ${val}`);
                    } else {
                        console.log(`${field}.${key}:`, val);
                    }
                }
            }
        }
    }
}

// ============================================================================
// Example 5: Complex Nested Structure
// ============================================================================

/**
 * Demonstrates handling validation errors for a complex nested structure
 * with Maps containing arrays of complex objects.
 * Shows how reusable error maps (simpleUserErrors) are composed into larger maps.
 */
function handleOrganizationErrors() {
    interface User {
        name: string;
        email: string;
        age: number;
    }
    interface Organization {
        name: string;
        departments: Map<string, User[]>;
        adminIds: Set<string>;
    }

    // Simulated validation errors - now with nested User property errors
    const errors: RunTypeError[] = [
        // Organization name error
        {path: ['name'], expected: 'string', format: {name: 'stringFormat', val: 3, formatPath: ['minLength']}},
        // Department key error
        {
            path: ['departments', {key: 'x', index: 0, failed: 'mapKey'}],
            expected: 'string',
            format: {name: 'stringFormat', val: 2, formatPath: ['minLength']},
        },
        // Department value error - nested User.name error at array index 0
        {
            path: ['departments', {key: 'engineering', index: 1, failed: 'mapVal'}, 0, 'name'],
            expected: 'string',
            format: {name: 'stringFormat', val: 2, formatPath: ['minLength']},
        },
        // Department value error - nested User.email error at array index 1
        {path: ['departments', {key: 'engineering', index: 1, failed: 'mapVal'}, 1, 'email'], expected: 'string'},
        // Admin ID error
        {
            path: ['adminIds', {key: 'a', index: 0}],
            expected: 'string',
            format: {name: 'stringFormat', val: 5, formatPath: ['minLength']},
        },
    ];

    const result = getFriendlyErrors<Organization>(errors, organizationErrors);

    // Access organization-level errors
    console.log(result.name); // 'Organization name must be at least 3 characters'

    // Access Map key errors
    console.log(result.departments?.$keys?.[0]); // 'Department name at position 0 is invalid'

    // Access nested User errors within the Map value (User[])
    // The result structure is: $values -> mapIndex -> arrayIndex -> userProperty
    const engineeringDeptErrors = result.departments?.$values?.[1] as Record<number, {name?: string; email?: string}>;
    console.log(engineeringDeptErrors?.[0]?.name); // 'Name must be at least 2 characters' (from simpleUserErrors)
    console.log(engineeringDeptErrors?.[1]?.email); // 'Email must be a valid email address' (from simpleUserErrors)

    // Access Set item errors
    console.log(result.adminIds?.[0]); // 'Admin ID at position 0 must be at least 5 characters'
}

// ============================================================================
// Example 6: Using Default Error Printer (No Custom Handlers)
// ============================================================================

/**
 * Demonstrates using getFriendlyErrors without custom handlers.
 * The default error printer generates messages automatically.
 */
function handleErrorsWithoutCustomHandlers() {
    type TagList = string[];

    const errors: RunTypeError[] = [
        {path: [0], expected: 'string', format: {name: 'stringFormat', val: 3, formatPath: ['minLength']}},
        {path: [2], expected: 'string'},
    ];

    // No custom handlers - uses default error printer
    const result = getFriendlyErrors<TagList>(errors);

    console.log(result[0]); // '0: minLength validation failed (expected 3)'
    console.log(result[2]); // '2: expected string'
}

// ============================================================================
// Run Examples
// ============================================================================

// Uncomment to run examples:
// handleTagListErrors();
// handleUserListErrors();  // Array of complex objects
// handleUserMapErrors();
// handleRoleSetErrors();
// handleUserSetErrors();   // Set of complex objects
// handleUserProfileErrors();
// handleOrganizationErrors();
// handleErrorsWithoutCustomHandlers();
