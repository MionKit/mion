/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Fixture for typeOnlyImports.spec.ts, consumed there through an `import type` TypeScript erases from the JS.

export interface ProbeUser {
  name: string;
  surname: string;
  birth: Date;
}

export interface ProbeCount {
  times: number;
}
