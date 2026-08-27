/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Export-completeness backstop for the root module: every name drizzle-orm
// exports must also come out of this package's root export (the `export *`
// guarantees it today; this pins any future refactor away from the star, a
// broken specifier, or a drizzle subpath rename). Per-function wrapper
// coverage is the manifest gate's job (`pnpm rtx core drizzle-manifest
// --check`). Never executed - compiled by tsconfig.stubs.json via
// type-inference.spec.ts.

import type {MustBeNever} from '../types/common.types.ts';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _MissingFromSqliteProxy = MustBeNever<
  Exclude<keyof typeof import('drizzle-orm/sqlite-core'), keyof typeof import('../index.ts')>
>;
