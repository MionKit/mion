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
 * client-server communication.
 *
 * Importing this package never starts a server. A test project starts one IN ITS OWN PROCESS from
 * a vitest globalSetup: `const server = await startTestServer(port)`, closed again in `teardown`.
 * See packages/client/globalSetup.ts for an example.
 *
 * Set MION_TEST_SERVER_AUTO_START=true to make the entry start a server on import instead, which is
 * what the lanes that run it as a program of its own do.
 */

// Re-export routes and types from test-server (safe to import)
export * from './src/test-server.ts';
