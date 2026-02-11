import {pureServerFn} from '@mionkit/server-pure-functions';

const SECRET = 'hidden-value';

// This should fail purity validation - accesses closure variable
export const impureFn = pureServerFn(function impureFn(x) {
    return x + SECRET;
});
