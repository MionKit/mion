/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Without the `source` condition bun takes the `default` export, a built .dist: missing on a fresh host,
// stale after a bench run, so the suite would test old router code and still pass.

import {expect, test} from 'bun:test';

test.each(['@mionjs/router', '@mionjs/core'])('%s loads its source, not a built dist', (pkg) => {
  const file = Bun.resolveSync(pkg, import.meta.dir);
  expect(file).toEndWith('/index.ts');
});
