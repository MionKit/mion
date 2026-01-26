import {createDataViewSerializer} from './dataView';
import {MION_ROUTES, StatusCodes} from '../constants';
import {RpcError} from '../errors';
import {DataViewSerializer} from '../types/general.types';
import {MethodWithJitFns} from '../types/method.types';

/**
 * Serializes API body to binary format using JIT-compiled serialization functions.
 * Combines the results of all body methods into a single binary buffer.
 *
 * Note: This function assumes all methods in executionChain have valid JIT functions.
 * Methods with noop JIT functions or undefined values should be filtered out before calling this function,
 * or handled by the caller. Any serialization errors will be thrown as RpcError.
 */
export function serializeBinaryBody(
    path: string,
    executionChain: MethodWithJitFns[],
    body: Record<string, any>,
    /** If true, the body is a response body, otherwise it's a request body */
    isResponse: boolean
): {
    serializer: DataViewSerializer;
    buffer: ReturnType<DataViewSerializer['getBuffer']>;
} {
    try {
        // Create serializer
        const serializer = createDataViewSerializer(path);

        // Reserve space for items length at index 0 (will be written after counting)
        const itemsLengthIndex = serializer.index;
        serializer.index += 4;

        let itemsLength = 0;
        // serialize each method's value (return value for responses, params for requests)
        for (let i = 0; i < executionChain.length; i++) {
            const method = executionChain[i];
            const key = method.id;
            const value = body[key];
            if (serializeMethod(key, method, value, serializer, isResponse)) {
                itemsLength++;
            }
        }
        // Write items length at reserved index 0
        serializer.view.setUint32(itemsLengthIndex, itemsLength, true);
        serializer.markAsEnded();

        return {serializer, buffer: serializer.getBuffer()};
    } catch (err: any) {
        if (err instanceof RpcError) throw err;
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: isResponse ? 'binary-response-Serialization-error' : 'binary-request-Serialization-error',
            publicMessage: `Failed to serialize body to binary: ${err?.message || 'unknown error'}`,
            originalError: err,
        });
    }
}

/**
 * Serializes a single method's value to binary format.
 * Returns true if the method was serialized, false if it was skipped.
 */
function serializeMethod(
    key: string,
    method: MethodWithJitFns,
    value: any,
    serializer: DataViewSerializer,
    isResponse: boolean
): boolean {
    const toBinary = isResponse ? method.returnJitFns.toBinary : method.paramsJitFns.toBinary;
    if (!toBinary?.fn)
        throw new RpcError({
            type: 'missing-toBinary-jit-fn',
            publicMessage: `Missing toBinary JIT function for method ${method.id}`,
        });
    if (toBinary.isNoop) return false;
    // skip @thrownErrors - should be handled separately by the caller if needed
    if (key === MION_ROUTES.thrownErrors) return false;
    // skip methods without return data or undefined values (for responses)
    if (isResponse && (!method.hasReturnData || typeof value === 'undefined')) return false;
    // skip methods with no params (for requests) or noop serialization
    if (!isResponse && typeof value === 'undefined') return false;
    // serialize key
    serializer.serString(key);
    // serialize value
    toBinary.fn(value, serializer);
    return true;
}
