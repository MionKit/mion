import {HeadersSubset} from '@mionkit/core';
import {headersHook} from '@mionkit/router';

// HeadersSubset<RequiredHeaders, OptionalHeaders>
// - First type parameter: required headers (must be present)
// - Second type parameter: optional headers (may or may not be present)

// Example: Authorization is required, User-Agent is optional
const authWithOptionalAgent = headersHook(async (ctx, {headers}: HeadersSubset<'Authorization', 'User-Agent'>): Promise<void> => {
    // headers.Authorization is guaranteed to exist (required)
    const token = headers.Authorization;

    // headers['User-Agent'] may be undefined (optional)
    const userAgent = headers['User-Agent'];

    console.log(`Token: ${token}, Agent: ${userAgent ?? 'unknown'}`);
});

// Multiple required and optional headers
const multiHeadersHook = headersHook(
    async (
        ctx,
        {headers}: HeadersSubset<'Authorization' | 'Content-Type', 'X-Request-Id' | 'X-Correlation-Id'>
    ): Promise<void> => {
        // Required headers - always present
        const auth = headers.Authorization;
        const contentType = headers['Content-Type'];

        // Optional headers - may be undefined
        const requestId = headers['X-Request-Id'];
        const correlationId = headers['X-Correlation-Id'];

        console.log(`Auth: ${auth}, ContentType: ${contentType}`);
        console.log(`RequestId: ${requestId ?? 'none'}, CorrelationId: ${correlationId ?? 'none'}`);
    }
);

export {authWithOptionalAgent, multiHeadersHook};
