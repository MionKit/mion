// This file demonstrates VALID usage for the @mionkit/no-type-imports rule
// Types used in routes/hooks should be imported WITHOUT the 'type' keyword

// start:type-imports-valid
// ✅ CORRECT: Regular import - types are available at runtime
import {User, Product} from './types';
import {route, hook} from '@mionkit/router';

// Types imported without 'type' keyword work correctly with mion
const getUser = route((ctx, id: number): User => {
    return {id, name: 'John', email: 'john@example.com'};
});

const createProduct = route((ctx, product: Product): Product => {
    return product;
});

const logUser = hook((ctx, user: User): void => {
    console.log(user.name);
});
// end:type-imports-valid

export const routes = {getUser, createProduct, logUser};
