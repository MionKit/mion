/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitCompiler} from '../lib/jitFnCompiler';

// TODO, as mock could return results async with mock promises
// we might need an unique JitCompiler, for each mock to avoid problems with the stack
const mockCompCache = new Map<string, JitCompiler>();

export function getMockCompiler(fnHash: string): JitCompiler {
    return mockCompCache.get(fnHash)!;
}

export function setMockCompiler(fnHash: string, comp: JitCompiler): void {
    mockCompCache.set(fnHash, comp);
}
