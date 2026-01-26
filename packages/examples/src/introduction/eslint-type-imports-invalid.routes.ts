// This file demonstrates INVALID usage for the @mionkit/no-type-imports rule
// Types used in routes/linkedFns should NOT be imported with the 'type' keyword

// start:type-imports-invalid
// ❌ WRONG: Type-only import - types are erased at runtime
import type {User, Product} from './types';
import {route, linkedFn} from '@mionkit/router';

// Types imported with 'type' keyword are erased at runtime
// mion cannot generate validation/serialization functions for them
const getUser = route((ctx, id: number): User => {
    return {id, name: 'John', email: 'john@example.com'};
});

const createProduct = route((ctx, product: Product): Product => {
    return product;
});

const logUser = linkedFn((ctx, user: User): void => {
    console.log(user.name);
});
// end:type-imports-invalid

export const routes = {getUser, createProduct, logUser};
