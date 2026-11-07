/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {JitCompiledFunctions} from './types/general.types.ts';

// Not re-exported by index.ts: routerUtils.ts reads them, testing.ts clears them.
export const jitFunctionsCache = new Map<string, JitCompiledFunctions>();
export const headerJitFunctionsCache = new Map<string, Pick<JitCompiledFunctions, 'isType' | 'typeErrors'>>();
