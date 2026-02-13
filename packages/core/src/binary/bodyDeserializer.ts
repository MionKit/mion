import {createDataViewDeserializer} from './dataView.ts';
import {StatusCodes} from '../constants.ts';
import {RpcError} from '../errors.ts';
import type {BinaryInput, DataViewDeserializer} from '../types/general.types.ts';
import type {MethodWithJitFns} from '../types/method.types.ts';
import {routesCache} from '../routerUtils.ts';

/**
 * Deserializes API body from binary format using JIT-compiled deserialization functions.
 * Reads the binary buffer and reconstructs the body record.
 * Method metadata is looked up from routesCache automatically.
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
    try {
        // Create deserializer from buffer
        const deserializer = createDataViewDeserializer(path, buffer);
        const body: Record<string, any> = {};

        // Read items length from first 32 bits
        const itemsLength = deserializer.view.getUint32(0, true);
        deserializer.index += 4;

        // Deserialize each item
        for (let i = 0; i < itemsLength; i++) {
            // Deserialize key (method id)
            const key = deserializer.desString();

            // Find the corresponding method from routesCache
            const method = routesCache.getMethodJitFns(key);
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

        deserializer.markAsEnded();
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
