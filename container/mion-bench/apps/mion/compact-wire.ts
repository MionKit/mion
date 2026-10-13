/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The compact wire for harness/run.mjs, which is plain node with no codec of its own: the request
// bodies and response readers of routes-compact.ts, compiled by the same build from the same types.
// A hand-written positional body would be a second copy of the wire, free to drift from the real one.
import {createJsonEncoderFn, createRestoreFromJsonFn} from '@mionjs/run-types';
import {SimpleUser, User} from '../../shared/models.ts';

// shared/payloads.mjs writes plain JSON values (dates as text), the shape every other lane sends;
// restoring them first gives the compact encoder the typed values a mion client would hold.
const restoreUser = createRestoreFromJsonFn<[User]>();
const restoreSimpleUser = createRestoreFromJsonFn<[SimpleUser]>();
const encodeUser = createJsonEncoderFn<[User]>(undefined, {strategy: 'compact'});
const encodeSimpleUser = createJsonEncoderFn<[SimpleUser]>(undefined, {strategy: 'compact'});

/** Per route id: the params tuple, as plain JSON values, written as a compact request body; a parsed response value read back as keyed data. */
export const COMPACT_WIRE = {
  // a GET with no body: only its answer is read
  hello: {
    decodeReturn: createRestoreFromJsonFn<{hello: string}>(undefined, {strategy: 'compact'}),
  },
  updateUser: {
    encodeParams: (params: unknown[]) => encodeUser(restoreUser(params)),
    decodeReturn: createRestoreFromJsonFn<User>(undefined, {strategy: 'compact'}),
  },
  updateSimpleUser: {
    encodeParams: (params: unknown[]) => encodeSimpleUser(restoreSimpleUser(params)),
    decodeReturn: createRestoreFromJsonFn<SimpleUser>(undefined, {strategy: 'compact'}),
  },
};
