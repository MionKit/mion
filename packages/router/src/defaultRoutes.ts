/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Default routes script for AOT cache generation.
 *
 * This script initializes the mion router with only the built-in internal routes
 * (error routes, metadata routes, etc.). It is used by the Vite plugin as a fallback
 * when no user-provided startScript is configured.
 *
 * When run with MION_COMPILE=true, the router's emitAOTCaches() will automatically
 * collect and send the serialized caches for these internal routes via IPC.
 *
 * Internal routes included:
 * - @thrownErrors: Error serialization route
 * - mion@notFound: Not-found handler
 * - mion@platformError: Platform error handler
 * - mion@methodsMetadataById: Remote methods metadata by ID
 * - mion@methodsMetadataByPath: Remote methods metadata by path
 */

import {middleFn, initMionRouter} from '@mionjs/router';
import type {Routes} from '@mionjs/router';

const routes = {
    // Only required as initMionRouter needs at least one route/middleFn
    'mion@mionEmptyMiddleFn': middleFn((): void => undefined),
} satisfies Routes;

// Initialize the router — this registers all internal routes and emits AOT caches
// skipClientRoutes must be false to ensure metadata routes are included in AOT caches
export const defaultApi = initMionRouter(routes, {skipClientRoutes: false});
export type DefaultApi = typeof defaultApi;
