import {createIsTypeFn, createStringifyJsonFn, createMockTypeFn, createToBinaryFn} from '@mionjs/run-types';
interface User {
    id: string;
    name: string;
    createdAt: Date;
    tags: Set<string>;
}
// @annotate: Create JIT-compiled functions directly from TypeScript types

const isUser = await createIsTypeFn<User>();
const stringifyUser = await createStringifyJsonFn<User>();
const toBinaryUser = await createToBinaryFn<User>();
const mockUser = await createMockTypeFn<User>();

// @annotate: Generate mock data - respects type structure

const user = mockUser();
//     ^?

// @annotate: Validate data at runtime

isUser(user);
// @annotate: Serialize complex types (Date, Set, unions) to JSON

const json = stringifyUser(user);
//     ^?
