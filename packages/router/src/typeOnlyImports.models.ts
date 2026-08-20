/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Fixture for typeOnlyImports.spec.ts: these types are consumed there through an
// `import type`, which TypeScript erases entirely from the emitted JS.

export interface ProbeUser {
    name: string;
    surname: string;
    birth: Date;
}

export interface ProbeCount {
    times: number;
}
