import {createDataViewDeserializer} from './dataView.ts';
import {StatusCodes} from '../constants.ts';
import {RpcError} from '../errors.ts';
import type {BinaryInput, DataViewDeserializer, FromBinaryFn} from '../types/general.types.ts';
import {routesCache} from '../routerUtils.ts';

/** The envelope's own uint32 item count. */
const ENVELOPE_HEADER_BYTES = 4;
/** The fewest bytes one envelope item can occupy: a one-byte key length prefix plus one key byte.
 *  Bounds the item count by the bytes behind it before the loop allocates or reads anything. */
const MIN_BYTES_PER_ITEM = 2;
/** The wire key is echoed back only in `errorData.methodId`, and never longer than this. */
const MAX_ECHOED_KEY_LENGTH = 64;

/**
 * Deserializes API body from binary format using JIT-compiled deserialization functions.
 * Reads the binary buffer and reconstructs the body record.
 * Method metadata is looked up from routesCache automatically.
 *
 * Security contract (the buffer is attacker-controlled on the request side):
 * - the item count is bounded by the bytes left;
 * - the body is a null-prototype object so a wire key can never be `__proto__`;
 * - an unknown key, a short buffer and trailing bytes are all typed errors with FIXED public
 *   messages, the engine error stays on `originalError` for the server logs;
 * - every read goes through the RunTypes deserializer, which throws `BinaryDecodeError` on a
 *   short read (never returns garbage).
 */
export function deserializeBinaryBody(
  path: string,
  buffer: BinaryInput,
  /** If true, the body is a response body, otherwise it's a request body */
  isResponse: boolean
): {
  deserializer: DataViewDeserializer;
  body: Record<string, any>;
} {
  const side = isResponse ? 'response' : 'request';
  try {
    const deserializer = createDataViewDeserializer(path, buffer);
    const byteLength = deserializer.view.byteLength;
    if (byteLength < ENVELOPE_HEADER_BYTES) throw malformed(side, 'binary body shorter than its header');
    const body: Record<string, any> = Object.create(null);

    // Read items length from first 32 bits, bounded BEFORE the loop by the bytes behind it: the
    // RunTypes reader refuses a count the buffer cannot back, and every item either names a
    // registered method or throws, so the loop can never outrun the buffer.
    const itemsLength = deserializer.desCountU32(MIN_BYTES_PER_ITEM);

    // Deserialize each item
    for (let i = 0; i < itemsLength; i++) {
      // Deserialize key (method id)
      const key = deserializer.desString();

      // Find the corresponding method from routesCache (own keys only, prototype names are unknown).
      // A method with no binary decoder answers exactly like an unknown one, so the wire cannot be
      // used to probe which ids exist.
      const method = routesCache.getMethodJitFns(key);
      const jitFns = method && (isResponse ? method.returnJitFns : method.paramsJitFns);
      if (!jitFns?.binary?.fromBinary.fn) throw unknownMethod(side, key);

      // Deserialize value using the appropriate JIT function
      const value = deserializeMethod(key, jitFns.binary.fromBinary.fn, deserializer, isResponse);
      body[key] = value;
    }

    // Trailing bytes make two different byte strings decode to the same body: refused.
    if (deserializer.index !== byteLength) throw malformed(side, 'trailing bytes after the last item');
    deserializer.markAsEnded();
    return {deserializer, body};
  } catch (err: any) {
    if (err instanceof RpcError) throw err;
    throw new RpcError({
      statusCode: StatusCodes.UNEXPECTED_ERROR,
      type: isResponse ? 'binary-response-Deserialize-error' : 'binary-request-Deserialization-error',
      publicMessage: `Malformed binary ${side} body`,
      originalError: err,
    });
  }
}

/** A framing error: fixed public text, the detail stays in the internal message. */
function malformed(side: 'request' | 'response', detail: string): RpcError<string> {
  return new RpcError({
    statusCode: StatusCodes.UNEXPECTED_ERROR,
    type: side === 'response' ? 'binary-response-Deserialize-error' : 'binary-request-Deserialization-error',
    publicMessage: `Malformed binary ${side} body`,
    message: `Malformed binary ${side} body: ${detail}`,
  });
}

function unknownMethod(side: 'request' | 'response', key: string): RpcError<string> {
  return new RpcError({
    statusCode: StatusCodes.UNEXPECTED_ERROR,
    type: side === 'response' ? 'binary-response-method-Deserialization-error' : 'binary-request-method-Deserialization-error',
    publicMessage: `Unknown method in binary ${side} body`,
    errorData: {methodId: key.slice(0, MAX_ECHOED_KEY_LENGTH)},
  });
}

/** Deserializes a single method's value from binary format */
function deserializeMethod(key: string, fromBinary: FromBinaryFn, deserializer: DataViewDeserializer, isResponse: boolean): any {
  try {
    return fromBinary(undefined, deserializer);
  } catch (e: any) {
    throw new RpcError({
      statusCode: StatusCodes.UNEXPECTED_ERROR,
      type: isResponse ? 'binary-response-method-Deserialization-error' : 'binary-request-method-Deserialization-error',
      publicMessage: `Failed to deserialize method from binary ${isResponse ? 'response' : 'request'} body`,
      originalError: e,
      errorData: {methodId: key.slice(0, MAX_ECHOED_KEY_LENGTH)},
    });
  }
}
