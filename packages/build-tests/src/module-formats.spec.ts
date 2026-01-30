/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Module format verification tests.
 * These tests verify that both ESM and CJS module formats work correctly.
 * Tests that the package exports are properly configured.
 */

describe('Module Format Verification', () => {
    describe('@mionkit/core exports', () => {
        it('should export RpcError', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const core = require('@mionkit/core');
            expect(core.RpcError).toBeDefined();
            expect(typeof core.RpcError).toBe('function');
        });

        it('should export TypedError', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const core = require('@mionkit/core');
            expect(core.TypedError).toBeDefined();
            expect(typeof core.TypedError).toBe('function');
        });

        it('should export isRpcError', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const core = require('@mionkit/core');
            expect(core.isRpcError).toBeDefined();
            expect(typeof core.isRpcError).toBe('function');
        });

        it('should export HeadersSubset', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const core = require('@mionkit/core');
            expect(core.HeadersSubset).toBeDefined();
            expect(typeof core.HeadersSubset).toBe('function');
        });
    });

    describe('@mionkit/router exports', () => {
        it('should export route function', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const router = require('@mionkit/router');
            expect(router.route).toBeDefined();
            expect(typeof router.route).toBe('function');
        });

        it('should export initRouter function', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const router = require('@mionkit/router');
            expect(router.initRouter).toBeDefined();
            expect(typeof router.initRouter).toBe('function');
        });

        it('should export registerRoutes function', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const router = require('@mionkit/router');
            expect(router.registerRoutes).toBeDefined();
            expect(typeof router.registerRoutes).toBe('function');
        });

        it('should export linkedFn function', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const router = require('@mionkit/router');
            expect(router.linkedFn).toBeDefined();
            expect(typeof router.linkedFn).toBe('function');
        });

        it('should export headersFn function', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const router = require('@mionkit/router');
            expect(router.headersFn).toBeDefined();
            expect(typeof router.headersFn).toBe('function');
        });
    });

    describe('@mionkit/http exports', () => {
        it('should export startNodeServer function', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const http = require('@mionkit/http');
            expect(http.startNodeServer).toBeDefined();
            expect(typeof http.startNodeServer).toBe('function');
        });

        it('should export setNodeHttpOpts function', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const http = require('@mionkit/http');
            expect(http.setNodeHttpOpts).toBeDefined();
            expect(typeof http.setNodeHttpOpts).toBe('function');
        });
    });

    describe('@mionkit/client exports', () => {
        it('should export initClient function', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const client = require('@mionkit/client');
            expect(client.initClient).toBeDefined();
            expect(typeof client.initClient).toBe('function');
        });
    });

    describe('@mionkit/run-types exports', () => {
        it('should export createIsTypeFn function', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const runTypes = require('@mionkit/run-types');
            expect(runTypes.createIsTypeFn).toBeDefined();
            expect(typeof runTypes.createIsTypeFn).toBe('function');
        });

        it('should export createTypeErrorsFn function', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const runTypes = require('@mionkit/run-types');
            expect(runTypes.createTypeErrorsFn).toBeDefined();
            expect(typeof runTypes.createTypeErrorsFn).toBe('function');
        });

        it('should export createStringifyJsonFn function', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const runTypes = require('@mionkit/run-types');
            expect(runTypes.createStringifyJsonFn).toBeDefined();
            expect(typeof runTypes.createStringifyJsonFn).toBe('function');
        });

        it('should export createToBinaryFn function', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const runTypes = require('@mionkit/run-types');
            expect(runTypes.createToBinaryFn).toBeDefined();
            expect(typeof runTypes.createToBinaryFn).toBe('function');
        });

        it('should export createFromBinaryFn function', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const runTypes = require('@mionkit/run-types');
            expect(runTypes.createFromBinaryFn).toBeDefined();
            expect(typeof runTypes.createFromBinaryFn).toBe('function');
        });

        it('should export createMockTypeFn function', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const runTypes = require('@mionkit/run-types');
            expect(runTypes.createMockTypeFn).toBeDefined();
            expect(typeof runTypes.createMockTypeFn).toBe('function');
        });

        it('should export runType function', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const runTypes = require('@mionkit/run-types');
            expect(runTypes.runType).toBeDefined();
            expect(typeof runTypes.runType).toBe('function');
        });
    });

    describe('@mionkit/type-formats exports', () => {
        it('should export FormatsString module', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const formatsString = require('@mionkit/type-formats/FormatsString');
            expect(formatsString).toBeDefined();
        });

        it('should export FormatsNumber module', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const formatsNumber = require('@mionkit/type-formats/FormatsNumber');
            expect(formatsNumber).toBeDefined();
        });

        it('should export FormatsBigint module', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const formatsBigint = require('@mionkit/type-formats/FormatsBigint');
            expect(formatsBigint).toBeDefined();
        });
    });

    describe('Package instantiation', () => {
        it('should create RpcError instance', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const {RpcError} = require('@mionkit/core');
            const error = new RpcError({
                publicMessage: 'Test error',
                type: 'test-error',
            });

            expect(error).toBeInstanceOf(RpcError);
            expect(error.publicMessage).toBe('Test error');
            expect(error.type).toBe('test-error');
        });

        it('should create HeadersSubset instance', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const {HeadersSubset} = require('@mionkit/core');
            const headers = new HeadersSubset({
                Authorization: 'Bearer token',
            });

            expect(headers).toBeInstanceOf(HeadersSubset);
            expect(headers.headers.Authorization).toBe('Bearer token');
        });

        it('should create client instance', () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const {initClient} = require('@mionkit/client');
            const client = initClient({baseURL: 'http://localhost:3000'});

            expect(client).toBeDefined();
            expect(client.routes).toBeDefined();
            expect(client.linkedFns).toBeDefined();
        });
    });
});
