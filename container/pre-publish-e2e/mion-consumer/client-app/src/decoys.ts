/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Decoys for src/tests/compile-output.spec.ts: a reflection marker and a named pure function
// that belong to the CLIENT project and are never passed to inputFrom. The server's compile,
// pointed at this project with --client-tsconfig, must copy the inline mapper and nothing else:
// no validator for ClientOnlyShape under the server's types/, no module for clientOnlyHelper
// under its rpc/pf/. The client's own compile does generate them, which proves they are live.
import {createValidateFn, registerPureFn} from '@mionjs/run-types';

export type ClientOnlyShape = {clientOnlyField: string};
export const isClientOnlyShape = createValidateFn<ClientOnlyShape>();
registerPureFn('mionjs::clientOnlyHelper', (value: number) => value * 2);
