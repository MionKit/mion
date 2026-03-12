/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * @mionjs/test-server
 *
 * Centralized test server for mion packages.
 * Provides a single test server with runtime type reflection for testing
 * client-server communication with both JSON and binary serialization.
 * Binary routes use per-route {serializer: 'binary'} option.
 *
 * IMPORTANT: Set MION_TEST_SERVER_AUTO_START=false before importing this package
 * in test files to prevent automatic server startup when importing routes.
 * The test server files will auto-start by default unless this variable is set.
 *
 * Test servers should be started using globalSetup in vitest/jest config.
 * See packages/client/globalSetup.ts for an example.
 */

// Re-export routes and types from test-server (safe to import)
export * from './src/test-server.ts';
