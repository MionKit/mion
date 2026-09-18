/* ########
 * 2026 ma-jerez
 * Author: Ma-jerez
 * License: MIT, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {registerPureFn} from '../../src/runtypes/pureFn.ts';

// A pure fn in its OWN module, so a test body can reach it the way any consumer
// does: import the id the registrar returned and hand it to `utl.getPureFn`.
export const trimHelper = registerPureFn((s: string): string => s.trim());
