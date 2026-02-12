/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFnCompiler} from '../lib/jitFnCompiler.ts';

// TODO, as mock could return results async with mock promises
// we might need an unique JitCompiler, for each mock to avoid problems with the stack
const mockCompCache = new Map<string, JitFnCompiler>();

export function getMockCompiler(fnHash: string): JitFnCompiler {
    return mockCompCache.get(fnHash)!;
}

export function setMockCompiler(fnHash: string, comp: JitFnCompiler): void {
    mockCompCache.set(fnHash, comp);
}
