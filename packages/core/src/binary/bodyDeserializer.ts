import {createDataViewDeserializer} from './dataView';
import {StatusCodes} from '../constants';
import {RpcError} from '../errors';
import {BinaryInput, DataViewDeserializer} from '../types/general.types';
import {MethodWithJitFns} from '../types/method.types';

/**
 * Deserializes API body from binary format using JIT-compiled deserialization functions.
 * Reads the binary buffer and reconstructs the body record.
 *
 * Note: The methodsMap should be built once and reused across multiple calls for better performance.
 */
export function deserializeBinaryBody(
    path: string,
    methodsMap: Map<string, MethodWithJitFns>,
    buffer: BinaryInput,
    /** If true, the body is a response body, otherwise it's a request body */
    isResponse: boolean,
    /** Optional pre-created deserializer (used in batch mode to share a single deserializer across routes) */
    sharedDeserializer?: DataViewDeserializer
): {
    deserializer: DataViewDeserializer;
    body: Record<string, any>;
} {
    try {
        // Use shared deserializer if provided (batch mode), otherwise create from buffer
        const deserializer = sharedDeserializer || createDataViewDeserializer(buffer);
        const body: Record<string, any> = {};

        // Read items length from current position
        const itemsLength = deserializer.view.getUint32(deserializer.index, true);
        deserializer.index += 4;

        // Deserialize each item
        for (let i = 0; i < itemsLength; i++) {
            // Deserialize key (method id)
            const key = deserializer.desString();

            // Find the corresponding method
            const method = methodsMap.get(key);
            if (!method) {
                throw new RpcError({
                    statusCode: StatusCodes.UNEXPECTED_ERROR,
                    type: isResponse
                        ? 'binary-response-method-Deserialization-error'
                        : 'binary-request-method-Deserialization-error',
                    publicMessage: `Unknown method key in binary body: ${key}`,
                    errorData: {methodId: key},
                });
            }

            // Deserialize value using the appropriate JIT function
            const value = deserializeMethod(key, method, deserializer, isResponse);
            body[key] = value;
        }
        return {deserializer, body};
    } catch (err: any) {
        if (err instanceof RpcError) throw err;
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: isResponse ? 'binary-response-Deserialize-error' : 'binary-request-Deserialization-error',
            publicMessage: `Failed to deserialize body from binary: ${err?.message || 'unknown error'}`,
            originalError: err,
        });
    }
}

/** Deserializes a single method's value from binary format */
function deserializeMethod(key: string, method: MethodWithJitFns, deserializer: DataViewDeserializer, isResponse: boolean): any {
    const jitFns = isResponse ? method.returnJitFns : method.paramsJitFns;
    try {
        return jitFns.fromBinary.fn(undefined, deserializer);
    } catch (e: any) {
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: isResponse ? 'binary-response-method-Deserialization-error' : 'binary-request-method-Deserialization-error',
            publicMessage: `Failed to deserialize method ${key} from binary`,
            originalError: e,
            errorData: {methodId: key},
        });
    }
}
