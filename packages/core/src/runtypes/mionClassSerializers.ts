/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {registerClassSerializer} from '@ts-runtypes/core';
import type {DataOnly} from '@ts-runtypes/core';
import {RpcError, TypedError} from '../errors.ts';

// ############# mion error classes -> ts-runtypes class serializers #############
// Registers mion's error classes so JSON/binary decoders rebuild real instances
// (`instanceof RpcError` holds after a round trip). This replaces the old
// jitUtils setDeserializeFn registrations, which fed the removed JIT compilers.
//
// ⚠️ ts-runtypes keys the registry by the INJECTED TYPE ID of the registration call
// site, and holds ONE key per class: this covers the `RpcError<string>` projection
// (the shape mion routes/metadata use on the wire). Other generic instantiations
// (e.g. RpcError<'validation-error', ValidationErrorData>) decode structurally —
// upstream gap filed in ts-run-types docs/todos (generic-class serializers).

registerClassSerializer<TypedError<string>>(TypedError, {
    deserialize: (data: DataOnly<TypedError<string>>) => new TypedError(data),
});

registerClassSerializer<RpcError<string>>(RpcError, {
    deserialize: (data: DataOnly<RpcError<string>>) => new RpcError(data),
});
