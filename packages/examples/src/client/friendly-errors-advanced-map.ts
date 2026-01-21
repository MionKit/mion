/**
 * Advanced FriendlyErrors Examples
 *
 * This file demonstrates how to use FriendlyErrors with advanced types:
 * - Top-level arrays
 * - Top-level Maps with $key and $value handlers
 * - Top-level Sets with $item handler
 * - Objects containing arrays, Maps, and Sets as properties
 */

import type {FriendlyErrors, FriendlyErrorsResult, StringErrorParams, NumberErrorParams} from '@mionkit/core';

// ============================================================================
// Type Definitions
// ============================================================================

/** Simple user type for nested examples */
interface User {
    name: string;
    email: string;
    age: number;
}

/** Type with array, Map, and Set properties */
interface UserProfile {
    id: string;
    /** Array of tags */
    tags: string[];
    /** Map of setting name to value */
    settings: Map<string, boolean>;
    /** Set of role names */
    roles: Set<string>;
    /** Nested user data */
    user: User;
}

// ============================================================================
// Top-Level Array Examples
// ============================================================================

// start-top-level-array
/**
 * Example 1a: Top-level array of primitives with a single handler function
 * The handler is called for each array item that fails validation
 */
type TagList = string[];

export const tagListErrors: FriendlyErrors<TagList> = (params: StringErrorParams) => {
    // params.index contains the array index that failed
    const messages: string[] = [];
    if (params.minLength) messages.push(`at least ${params.minLength.val} characters`);
    if (params.maxLength) messages.push(`at most ${params.maxLength.val} characters`);
    if (messages.length > 0) {
        return `Tag at index ${params.index} must be ${messages.join(' and ')}`;
    }
    return `Tag at index ${params.index} must be a valid string`;
};
// end-top-level-array

// Result type for top-level array of primitives:
// Record<StrNumber, string> - e.g., { 0: 'error', 2: 'error' }
type TagListResult = FriendlyErrorsResult<TagList>;

// start-array-complex-objects
/**
 * Example 1b: Top-level array of complex objects with nested handlers
 * The error map mirrors the structure of the array item type
 */
type UserList = User[];

export const userListErrors: FriendlyErrors<UserList> = {
    // Each property of User gets its own handler
    name: (params: StringErrorParams) => {
        if (params.minLength) return `Name must be at least ${params.minLength.val} characters`;
        return 'Name is required';
    },
    email: (params: StringErrorParams) => {
        return 'Email must be a valid email address';
    },
    age: (params: NumberErrorParams) => {
        if (params.min) return `Age must be at least ${params.min.val}`;
        if (params.max) return `Age must be at most ${params.max.val}`;
        return 'Age must be a valid number';
    },
};
// end-array-complex-objects

// Result type for top-level array of complex objects:
// Record<StrNumber, { name?: string; email?: string; age?: string }>
// e.g., { 0: { name: 'error' }, 1: { email: 'error' } }
type UserListResult = FriendlyErrorsResult<UserList>;

// ============================================================================
// Top-Level Map Examples
// ============================================================================

// start-map-handlers
/**
 * Example 2: Top-level Map with separate $key and $value handlers
 * - $key handler is called for key validation errors
 * - $value handler is called for value validation errors
 */
type UserMap = Map<string, User>;

export const userMapErrors: FriendlyErrors<UserMap> = {
    // Handler for key validation errors
    $key: (params: StringErrorParams) => {
        // params.index contains the position in the Map
        if (params.minLength) {
            return `User ID at position ${params.index} must be at least ${params.minLength.val} characters`;
        }
        return `User ID at position ${params.index} is invalid`;
    },
    // Handler for value validation errors (can be nested for complex values)
    $value: {
        name: (params: StringErrorParams) => {
            if (params.minLength) return `Name must be at least ${params.minLength.val} characters`;
            return 'Name is required';
        },
        email: (params: StringErrorParams) => {
            return 'Email must be a valid email address';
        },
        age: (params: NumberErrorParams) => {
            if (params.min) return `Age must be at least ${params.min.val}`;
            if (params.max) return `Age must be at most ${params.max.val}`;
            return 'Age must be a valid number';
        },
    },
};
// end-map-handlers

// Result type for Map:
// { $keys?: Record<StrNumber, string>, $values?: Record<StrNumber, nested | string> }
type UserMapResult = FriendlyErrorsResult<UserMap>;

/**
 * Example 3: Top-level Map with a single handler for all errors
 * Useful when you want the same message for all Map errors
 */
type SettingsMap = Map<string, boolean>;

export const settingsMapSimpleErrors: FriendlyErrors<SettingsMap> = (params) => {
    // This handler is called for both key and value errors
    return `Setting at position ${params.index} is invalid`;
};

// ============================================================================
// Top-Level Set Examples
// ============================================================================

// start-set-handlers
/**
 * Example 4a: Top-level Set of primitives with $item handler
 * The $item handler is called for each Set item that fails validation
 */
type RoleSet = Set<string>;

export const roleSetErrors: FriendlyErrors<RoleSet> = {
    $item: (params: StringErrorParams) => {
        // params.index contains the position in the Set
        if (params.minLength) {
            return `Role at position ${params.index} must be at least ${params.minLength.val} characters`;
        }
        if (params.maxLength) {
            return `Role at position ${params.index} must be at most ${params.maxLength.val} characters`;
        }
        return `Role at position ${params.index} must be a valid string`;
    },
};
// end-set-handlers

// Result type for Set of primitives:
// Record<StrNumber, string> - e.g., { 0: 'error', 2: 'error' }
type RoleSetResult = FriendlyErrorsResult<RoleSet>;

/**
 * Example 4b: Top-level Set of complex objects with nested handlers
 * The $item contains nested handlers for each property of the object
 */
type UserSet = Set<User>;

export const userSetErrors: FriendlyErrors<UserSet> = {
    $item: {
        // Each property of User gets its own handler
        name: (params: StringErrorParams) => {
            if (params.minLength) return `Name must be at least ${params.minLength.val} characters`;
            return 'Name is required';
        },
        email: (params: StringErrorParams) => {
            return 'Email must be a valid email address';
        },
        age: (params: NumberErrorParams) => {
            if (params.min) return `Age must be at least ${params.min.val}`;
            return 'Age must be a valid number';
        },
    },
};

// Result type for Set of complex objects:
// Record<StrNumber, { name?: string; email?: string; age?: string }>
type UserSetResult = FriendlyErrorsResult<UserSet>;

/**
 * Example 5: Top-level Set with a single handler
 */
export const roleSetSimpleErrors: FriendlyErrors<RoleSet> = (params: StringErrorParams) => {
    return `Role at position ${params.index} is invalid`;
};

// ============================================================================
// Object with Array, Map, and Set Properties
// ============================================================================

/**
 * Example 6: Object containing arrays, Maps, and Sets as properties
 * This is the most common use case in real applications
 */
export const userProfileErrors: FriendlyErrors<UserProfile> = {
    // Simple string property
    id: (params: StringErrorParams) => {
        if (params.minLength) return `ID must be at least ${params.minLength.val} characters`;
        return 'ID is required';
    },

    // Array property - handler is called for each failed item
    tags: (params: StringErrorParams) => {
        if (params.minLength) {
            return `Tag at index ${params.index} must be at least ${params.minLength.val} characters`;
        }
        return `Tag at index ${params.index} must be a valid string`;
    },

    // Map property with separate key/value handlers
    settings: {
        $key: (params: StringErrorParams) => {
            return `Setting name at position ${params.index} is invalid`;
        },
        $value: (params) => {
            return `Setting value at position ${params.index} must be a boolean`;
        },
    },

    // Set property with $item handler
    roles: {
        $item: (params: StringErrorParams) => {
            if (params.minLength) {
                return `Role at position ${params.index} must be at least ${params.minLength.val} characters`;
            }
            return `Role at position ${params.index} must be a valid string`;
        },
    },

    // Nested object
    user: {
        name: (params: StringErrorParams) => {
            if (params.minLength) return `Name must be at least ${params.minLength.val} characters`;
            return 'Name is required';
        },
        email: () => 'Email must be a valid email address',
        age: (params: NumberErrorParams) => {
            if (params.min) return `Age must be at least ${params.min.val}`;
            return 'Age must be a valid number';
        },
    },
};

// Result type for object with collections:
// {
//   id?: string;
//   tags?: Record<StrNumber, string>;
//   settings?: { $keys?: Record<StrNumber, string>, $values?: Record<StrNumber, string> };
//   roles?: Record<StrNumber, string>;
//   user?: { name?: string; email?: string; age?: string };
//   $root?: string;
// }
type UserProfileResult = FriendlyErrorsResult<UserProfile>;

// ============================================================================
// Alternative: Using Single Handlers for Collections in Objects
// ============================================================================

/**
 * Example 7: Object with single handlers for Map and Set properties
 * Simpler approach when you don't need separate key/value handlers
 */
export const userProfileSimpleErrors: FriendlyErrors<UserProfile> = {
    id: () => 'ID is required',

    // Single handler for array items
    tags: (params) => `Tag ${params.index} is invalid`,

    // Single handler for all Map errors (both key and value)
    settings: (params) => `Setting at position ${params.index} is invalid`,

    // Single handler for all Set items
    roles: (params) => `Role at position ${params.index} is invalid`,

    user: {
        name: () => 'Name is required',
        email: () => 'Email is invalid',
        age: () => 'Age is invalid',
    },
};

// ============================================================================
// Reusable Error Maps
// ============================================================================

// start-reusable-error-maps
/**
 * Example 8: Reusable error map for User type
 * This can be used in multiple places where User validation is needed
 */
export const simpleUserErrors: FriendlyErrors<User> = {
    name: (params: StringErrorParams) => {
        if (params.minLength) return `Name must be at least ${params.minLength.val} characters`;
        return 'Name is required';
    },
    email: (params: StringErrorParams) => {
        return 'Email must be a valid email address';
    },
    age: (params: NumberErrorParams) => {
        if (params.min) return `Age must be at least ${params.min.val}`;
        if (params.max) return `Age must be at most ${params.max.val}`;
        return 'Age must be a valid number';
    },
};

// ============================================================================
// Complex Nested Example with Reusable Maps
// ============================================================================

/** Type with deeply nested collections */
interface Organization {
    name: string;
    /** Map of department name to list of users */
    departments: Map<string, User[]>;
    /** Set of admin user IDs */
    adminIds: Set<string>;
}

/**
 * Example 9: Complex nested structure with Map containing arrays of complex objects
 * Demonstrates reusing an existing error map (simpleUserErrors) inside another map
 */
export const organizationErrors: FriendlyErrors<Organization> = {
    name: (params: StringErrorParams) => {
        if (params.minLength) return `Organization name must be at least ${params.minLength.val} characters`;
        return 'Organization name is required';
    },

    departments: {
        $key: (params: StringErrorParams) => {
            return `Department name at position ${params.index} is invalid`;
        },
        // $value is an array of Users (User[]), so we reuse the simpleUserErrors map
        // This demonstrates composing error maps - the nested User properties get their own handlers
        $value: simpleUserErrors,
    },

    adminIds: {
        $item: (params: StringErrorParams) => {
            if (params.minLength) {
                return `Admin ID at position ${params.index} must be at least ${params.minLength.val} characters`;
            }
            return `Admin ID at position ${params.index} is invalid`;
        },
    },
};
// end-reusable-error-maps

type OrganizationResult = FriendlyErrorsResult<Organization>;

// ============================================================================
// Export types for documentation
// ============================================================================

export type {TagListResult, UserListResult, UserMapResult, RoleSetResult, UserSetResult, UserProfileResult, OrganizationResult};
