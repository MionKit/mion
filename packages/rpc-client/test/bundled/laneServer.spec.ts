/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The lane server (test/lib/laneServer.ts) is a second process writing the same genDir. Rooted anywhere else than
// this project, it names the generated modules apart and prunes this process's ones: a spec then fails to import its
// own module whenever it runs first, which is how routeDrift.spec.ts failed alone.

import {describe, it, expect, inject} from 'vitest';
import {fileURLToPath} from 'node:url';

describe('the bundled lane server', () => {
  it('compiles under this project root, so both processes agree on the generated module names', () => {
    expect(inject('laneServerRoot')).toBe(fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, ''));
  });
});
