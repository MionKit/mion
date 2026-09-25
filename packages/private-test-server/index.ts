/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Shared test server for mion packages. Importing it never starts a server: a test project starts one in its
 * own process from a vitest globalSetup (see packages/rpc-client/globalSetup.ts). MION_TEST_SERVER_AUTO_START=true
 * starts one on import, for lanes that run it as a standalone program.
 */

// Re-export routes and types from test-server (safe to import)
export * from './src/test-server.ts';
