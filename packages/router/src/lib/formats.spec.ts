/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {registerRoutes, resetRouter, initRouter, getRouteExecutable} from '../router';
import {dispatchRoute} from '../dispatch';
import {MionHeaders} from '../types/context';
import {Routes} from '../types/general';
import {MION_ROUTES, JitCompiledFnData, PureFunctionData, RunTypeError} from '@mionkit/core';
import {route} from './handlers';
import {headersFromRecord} from './headers';
import {getSerializableMethod, serializeMethodDeps} from './remoteMethods';
// Import format types (regular import to ensure JIT functions are created)
import {StrFormat} from '@mionkit/type-formats/FormatsString';
import {NumFormat} from '@mionkit/type-formats/FormatsNumber';

type RawRequest = {
    headers: MionHeaders;
    body: string;
};

// Types with format validation
type UserWithFormats = {
    name: StrFormat<{minLength: 2; maxLength: 50}>;
    age: NumFormat<{min: 13; max: 120; integer: true}>;
    email: string;
};

// Type for validation error data returned by routes
type ValidationErrorData = {
    typeErrors: RunTypeError[];
};

// Explicit routes type for refactoring support
type FormatTestRoutes = {
    createUser: ReturnType<typeof route<(ctx: unknown, user: UserWithFormats) => UserWithFormats>>;
} & Routes;

type ValidateNameRoutes = {
    validateName: ReturnType<typeof route<(ctx: unknown, name: StrFormat<{minLength: 2; maxLength: 20}>) => string>>;
} & Routes;

describe('Dispatch routes with format types', () => {
    const getDefaultRequest = (path: string, params?: unknown): RawRequest => ({
        headers: headersFromRecord({}),
        body: JSON.stringify({[path]: params}),
    });

    beforeEach(() => resetRouter());

    describe('format validation should', () => {
        it('pass validation with valid format data', async () => {
            const createUser = route((_ctx, user: UserWithFormats): UserWithFormats => user);
            const routes: FormatTestRoutes = {createUser};
            await initRouter();
            await registerRoutes(routes);

            const validUser = {name: 'John', age: 25, email: 'john@test.com'};
            const request = getDefaultRequest('createUser', [validUser]);

            const response = await dispatchRoute(
                '/createUser',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );

            expect(response.body.createUser).toEqual(validUser);
        });

        it('return format validation error for string too short', async () => {
            const createUser = route((_ctx, user: UserWithFormats): UserWithFormats => user);
            const routes: FormatTestRoutes = {createUser};
            await initRouter();
            await registerRoutes(routes);

            const invalidUser = {name: 'A', age: 25, email: 'test@test.com'}; // name too short
            const request = getDefaultRequest('createUser', [invalidUser]);

            const response = await dispatchRoute(
                '/createUser',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );

            const error = response.body[MION_ROUTES.thrownErrors]?.createUser;
            expect(error).toBeDefined();
            expect(error?.type).toBe('validation-error');
            expect(error?.errorData).toBeDefined();
            // errorData contains typeErrors array
            const errorData = error?.errorData as ValidationErrorData;
            const typeErrors: RunTypeError[] = errorData?.typeErrors || [];
            expect(typeErrors.length).toBeGreaterThan(0);
            // Should have format error info
            const nameError = typeErrors.find((e: RunTypeError) => e.path.includes('name'));
            expect(nameError).toBeDefined();
            expect(nameError?.format?.name).toBe('stringFormat');
        });

        it('return format validation error for number out of range', async () => {
            const createUser = route((_ctx, user: UserWithFormats): UserWithFormats => user);
            const routes: FormatTestRoutes = {createUser};
            await initRouter();
            await registerRoutes(routes);

            const invalidUser = {name: 'John', age: 10, email: 'test@test.com'}; // age < 13
            const request = getDefaultRequest('createUser', [invalidUser]);

            const response = await dispatchRoute(
                '/createUser',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );

            const error = response.body[MION_ROUTES.thrownErrors]?.createUser;
            expect(error).toBeDefined();
            expect(error?.type).toBe('validation-error');
            const errorData = error?.errorData as ValidationErrorData;
            const typeErrors: RunTypeError[] = errorData?.typeErrors || [];
            const ageError = typeErrors.find((e: RunTypeError) => e.path.includes('age'));
            expect(ageError).toBeDefined();
            expect(ageError?.format?.name).toBe('numberFormat');
        });

        it('return multiple format validation errors', async () => {
            const createUser = route((_ctx, user: UserWithFormats): UserWithFormats => user);
            const routes: FormatTestRoutes = {createUser};
            await initRouter();
            await registerRoutes(routes);

            const invalidUser = {name: 'A', age: 5, email: 'test@test.com'}; // both invalid
            const request = getDefaultRequest('createUser', [invalidUser]);

            const response = await dispatchRoute(
                '/createUser',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );

            const error = response.body[MION_ROUTES.thrownErrors]?.createUser;
            expect(error).toBeDefined();
            expect(error?.type).toBe('validation-error');
            const errorData = error?.errorData as ValidationErrorData;
            const typeErrors: RunTypeError[] = errorData?.typeErrors || [];
            expect(typeErrors.length).toBeGreaterThanOrEqual(2);
        });

        it('validate simple string format param', async () => {
            const validateName = route((_ctx, name: StrFormat<{minLength: 2; maxLength: 20}>): string => `Name: ${name}`);
            const routes: ValidateNameRoutes = {validateName};
            await initRouter();
            await registerRoutes(routes);

            // Valid name
            const validRequest = getDefaultRequest('validateName', ['John']);
            const validResponse = await dispatchRoute(
                '/validateName',
                validRequest.body,
                validRequest.headers,
                headersFromRecord({}),
                validRequest,
                {}
            );
            expect(validResponse.body.validateName).toBe('Name: John');

            // Invalid name (too short)
            const invalidRequest = getDefaultRequest('validateName', ['A']);
            const invalidResponse = await dispatchRoute(
                '/validateName',
                invalidRequest.body,
                invalidRequest.headers,
                headersFromRecord({}),
                invalidRequest,
                {}
            );
            const error = invalidResponse.body[MION_ROUTES.thrownErrors]?.validateName;
            expect(error).toBeDefined();
            expect(error?.type).toBe('validation-error');
        });
    });

    describe('format JIT serialization should', () => {
        it('serialize method deps for format routes without stack overflow', async () => {
            const createUser = route((_ctx, user: UserWithFormats): UserWithFormats => user);
            const routes: FormatTestRoutes = {createUser};
            await initRouter();
            await registerRoutes(routes);

            const executable = getRouteExecutable('createUser')!;
            expect(executable).toBeDefined();

            const method = getSerializableMethod(executable);
            expect(method).toBeDefined();

            const deps: Record<string, JitCompiledFnData> = {};
            const purFnDeps: Record<string, PureFunctionData> = {};

            // This should NOT throw "Maximum call stack size exceeded"
            expect(() => serializeMethodDeps(method, deps, purFnDeps)).not.toThrow();

            // Should have some dependencies serialized
            expect(Object.keys(deps).length).toBeGreaterThan(0);
        });
    });
});
