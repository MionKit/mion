/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * AOT Initialization Script for @mionkit/client
 *
 * This file initializes a minimal mion router to compile JIT functions for the
 * mionGetRemoteMethodsDataById and mionGetRemoteMethodsDataByPath routes.
 *
 * Run this with mion-build-aot to generate the cache files.
 */

import {initMionRouter, Routes} from '@mionkit/router';

// Initialize an empty router - this automatically registers the client routes
// (mionGetRemoteMethodsDataById and mionGetRemoteMethodsDataByPath)
// which will compile all required JIT functions for SerializableMethodsData
const routes = {} satisfies Routes;
initMionRouter(routes);

console.log('AOT init complete: mion client routes JIT functions compiled');
