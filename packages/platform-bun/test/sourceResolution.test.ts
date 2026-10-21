/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Without `source` bun loads the built .dist: missing on a fresh host, or stale so the suite passes on old router code.

import {expect, test} from 'bun:test';

test.each(['@mionjs/router', '@mionjs/core'])('%s loads its source, not a built dist', (pkg) => {
  const file = Bun.resolveSync(pkg, import.meta.dir);
  expect(file).toEndWith('/index.ts');
});
