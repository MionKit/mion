/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Never re-export from index.ts: these reset process-wide caches and have no place in a shipped client.

export {resetJitFnCaches, resetJitFunctionsCache} from './src/testing.ts';
