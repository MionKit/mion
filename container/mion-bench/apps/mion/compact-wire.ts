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

/** Per route id: the params tuple as a request body, and a parsed response value back as keyed data. */
export const COMPACT_WIRE = {
  // a GET with no body: only its answer is read
  hello: {
    decodeReturn: createRestoreFromJsonFn<{hello: string}>(undefined, {strategy: 'compact'}),
  },
  updateUser: {
    encodeParams: createJsonEncoderFn<[User]>(undefined, {strategy: 'compact'}),
    decodeReturn: createRestoreFromJsonFn<User>(undefined, {strategy: 'compact'}),
  },
  updateSimpleUser: {
    encodeParams: createJsonEncoderFn<[SimpleUser]>(undefined, {strategy: 'compact'}),
    decodeReturn: createRestoreFromJsonFn<SimpleUser>(undefined, {strategy: 'compact'}),
  },
};
