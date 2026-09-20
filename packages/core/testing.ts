/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Public entry for `@mionjs/core/testing`. Nothing here may be re-exported from index.ts:
// these reset the process-wide caches and have no place in a shipped client.

export {resetJitFnCaches, resetJitFunctionsCache} from './src/testing.ts';
