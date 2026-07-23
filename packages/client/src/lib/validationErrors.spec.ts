/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {initClient} from '../client.ts';
import {Email} from '@ts-runtypes/core/formats';
import {TEST_SERVER_BASE_URL} from '../../globalSetup.ts';
import {TestServerApi} from '@mionjs/test-server';
import {getStorage} from './storage.ts';

// Client-side validation errors. mion no longer ships a friendly-errors layer — human-readable
// rendering is @ts-runtypes' `createFriendlyText` (from a committed `FriendlyText<T>` map). These
// tests pin what mion IS responsible for: `.typeErrors()` returning the raw validation-error shape
// that any renderer (createFriendlyText or an app's own) consumes.

describe('client-side validation errors', () => {
    type MyApi = TestServerApi;

    const baseURL = TEST_SERVER_BASE_URL;

    beforeEach(() => {
        getStorage().clear();
    });

    describe('route validation errors with formats', () => {
        it('produces validation errors for format-constrained fields', async () => {
            const {routes} = initClient<MyApi>({baseURL});

            // Send invalid user - name too short (min 2), age too young (min 13)
            const invalidUser = {
                name: 'A', // too short
                age: 10, // too young
                email: 'test@test.com' as Email,
            };

            const validationErrors = await routes.createUserWithFormats(invalidUser).typeErrors();

            expect(Array.isArray(validationErrors)).toBe(true);
            expect(validationErrors.length).toBeGreaterThan(0);
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

        it('should get validation errors for email format (built-in Email)', async () => {
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
            // format.name should be 'email' for Email built-in format
            expect(emailError?.format?.name).toBe('email');
        });

        // Canary (R20): pins the EXACT raw ts-runtypes error shape (expected base type + format
        // {name, formatPath, val}) that a friendly-text renderer consumes. Runs the real engine, so
        // an upstream error-shape change fails here. Client param errors are relative to the
        // positional params tuple (paths like [0, 'name']).
        it('pins the raw engine error shape for the format matrix', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const invalidUser = {name: 'A', age: 10, email: 'invalid-email' as Email};
            const errors = await routes.createUserWithFormats(invalidUser).typeErrors();

            const nameErr = errors.find((e) => e.path.includes('name'));
            expect(nameErr?.expected).toBe('string');
            expect(nameErr?.format?.name).toBe('stringFormat');
            expect(nameErr?.format?.formatPath).toEqual(['minLength']);
            expect(nameErr?.format?.val).toBe(2);

            const ageErr = errors.find((e) => e.path.includes('age'));
            expect(ageErr?.expected).toBe('number');
            expect(ageErr?.format?.name).toBe('numberFormat');
            expect(ageErr?.format?.formatPath).toEqual(['min']);

            const emailErr = errors.find((e) => e.path.includes('email'));
            expect(emailErr?.format?.name).toBe('email');

            // paths are positional-params-relative: [0, 'name'] etc.
            expect(nameErr?.path).toContain(0);
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

    describe('middleFn validation errors', () => {
        it('should return middleFn errors when required auth header is missing', async () => {
            const {routes} = initClient<MyApi>({baseURL});

            // Call without required auth middleFn - should return error in the tuple
            const [, , , middleFnErrors] = await routes.sayHello({name: 'John', surname: 'Doe'}).call();

            // MiddleFn error should be present for the auth middleFn
            expect(middleFnErrors?.auth).toBeDefined();
            expect(middleFnErrors?.auth?.type).toBe('validation-error');
        });
    });
});
