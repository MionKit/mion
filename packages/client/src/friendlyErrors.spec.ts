/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initClient} from './client';
import {getFriendlyErrors} from '@mionkit/core';
import type {FriendlyErrors} from '@mionkit/core';
import {createTestServerLinkedFns, TEST_PORT_MAPPING, JEST_TIMEOUT_CONSTANTS} from '@mionkit/test-server';
import type {TestServerApi} from '../../test-server/src/test-server-json';
import type {RouteParamsType} from './types';
import {StrEmail} from '@mionkit/type-formats/FormatsString';

// Mock localStorage for method metadata storage
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const Storage = require('dom-storage');
global.localStorage = new Storage(null, {strict: true});
global.sessionStorage = new Storage(null, {strict: true});

describe('friendlyErrors with client validation', () => {
    type MyApi = TestServerApi;

    const port = TEST_PORT_MAPPING.friendlyErrors;
    const serverLinkedFns = createTestServerLinkedFns({port});
    const baseURL = serverLinkedFns.getBaseURL();

    // Derive UserWithFormats type from the route without importing it from server
    // This demonstrates how a client can get the type from the API definition
    type UserWithFormats = RouteParamsType<MyApi['createUserWithFormats']>;

    beforeAll(serverLinkedFns.beforeAll, JEST_TIMEOUT_CONSTANTS.BEFORE_ALL_TIMEOUT);
    afterAll(serverLinkedFns.afterAll, JEST_TIMEOUT_CONSTANTS.AFTER_ALL_TIMEOUT);

    beforeEach(() => {
        localStorage.clear();
    });

    describe('route validation errors with formats', () => {
        it('should get validation errors and convert to friendly errors for format validation', async () => {
            const {routes} = initClient<MyApi>({baseURL});

            // Send invalid user - name too short (min 2), age too young (min 13)
            const invalidUser = {
                name: 'A', // too short
                age: 10, // too young
                email: 'test@test.com' as StrEmail,
            };

            // Get validation errors using typeErrors (client-side validation)
            const validationErrors = await routes.createUserWithFormats(invalidUser).typeErrors();

            expect(Array.isArray(validationErrors)).toBe(true);

            // Convert to friendly errors
            const errorsMap: FriendlyErrors<UserWithFormats> = {
                name: (params) => {
                    if (params?.minLength) return `Name must be at least ${params.minLength.val} characters`;
                    if (params?.maxLength) return `Name must be at most ${params.maxLength.val} characters`;
                    return 'Invalid name';
                },
                age: (params) => {
                    if (params?.min) return `You must be at least ${params.min.val} years old`;
                    if (params?.max) return `Age cannot exceed ${params.max.val}`;
                    return 'Invalid age';
                },
            };

            const friendlyResult = getFriendlyErrors<UserWithFormats>(validationErrors, errorsMap);

            // Should have validation errors for invalid data
            expect(validationErrors.length).toBeGreaterThan(0);
            // Friendly result should have messages
            expect(Object.keys(friendlyResult).length).toBeGreaterThan(0);
        });

        it('should get validation errors for simple string format', async () => {
            const {routes} = initClient<MyApi>({baseURL});

            // Send invalid name - just 1 character (min is 2)
            const invalidName = 'X';

            const validationErrors = await routes.validateName(invalidName).typeErrors();

            expect(Array.isArray(validationErrors)).toBe(true);
            // Should have validation error for minLength violation
            expect(validationErrors.length).toBeGreaterThan(0);
        });

        it('should get validation errors for number format', async () => {
            const {routes} = initClient<MyApi>({baseURL});

            // Send invalid age - negative number (min is 0)
            const invalidAge = -5;

            const validationErrors = await routes.validateAge(invalidAge).typeErrors();

            expect(Array.isArray(validationErrors)).toBe(true);
            // Should have validation error for min violation
            expect(validationErrors.length).toBeGreaterThan(0);
        });

        it('should get validation errors for email format (built-in StrEmail)', async () => {
            const {routes} = initClient<MyApi>({baseURL});

            // Send invalid user with invalid email format
            const invalidUser = {
                name: 'John',
                age: 25,
                email: 'invalid-email', // not a valid email format
            };

            const validationErrors = await routes.createUserWithFormats(invalidUser).typeErrors();

            expect(Array.isArray(validationErrors)).toBe(true);
            // Should have validation error for email format violation
            expect(validationErrors.length).toBeGreaterThan(0);

            // Should contain an error for the email field with format info
            const emailError = validationErrors.find((e) => e.path.includes('email'));
            expect(emailError).toBeDefined();
            // format.name should be 'email' for StrEmail built-in format
            expect(emailError?.format?.name).toBe('email');
        });

        it('should return empty array for valid format data', async () => {
            const {routes} = initClient<MyApi>({baseURL});

            // Valid user with valid email
            const validUser = {
                name: 'John Doe',
                age: 25,
                email: 'john@example.com',
            };

            const validationErrors = await routes.createUserWithFormats(validUser).typeErrors();

            expect(Array.isArray(validationErrors)).toBe(true);
            expect(validationErrors.length).toBe(0);
        });
    });

    describe('linkedFn validation errors', () => {
        it('should return linkedFn errors when required auth header is missing', async () => {
            const {routes} = initClient<MyApi>({baseURL});

            // Call without required auth linkedFn - should return error in the tuple
            const [, , , linkedFnErrors] = await routes.sayHello({name: 'John', surname: 'Doe'}).call();

            // LinkedFn error should be present for the auth linkedFn
            expect(linkedFnErrors?.auth).toBeDefined();
            expect(linkedFnErrors?.auth?.type).toBe('validation-error');
        });
    });

    describe('default error printer with format errors', () => {
        it('should use defaultErrorPrinter when no errorsMap provided', async () => {
            const {routes} = initClient<MyApi>({baseURL});

            // Send invalid user
            const invalidUser = {
                name: 'A',
                age: 5,
                email: 'test@test.com',
            };

            const validationErrors = await routes.createUserWithFormats(invalidUser).typeErrors();

            // Use getFriendlyErrors without errorsMap - should use default printer
            const friendlyResult = getFriendlyErrors(validationErrors);

            // Should have validation errors for invalid data
            expect(validationErrors.length).toBeGreaterThan(0);
            // Should produce result object with error messages
            expect(typeof friendlyResult).toBe('object');
            expect(Object.keys(friendlyResult).length).toBeGreaterThan(0);
        });
    });
});
