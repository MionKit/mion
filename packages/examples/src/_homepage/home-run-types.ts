import {createIsTypeFn, createJsonStringifyFn, createMockTypeFn} from '@mionkit/run-types';

interface User {
    id: string;
    name: string;
    createdAt: Date;
    tags: Set<string>;
}

// Create JIT-compiled functions directly from TypeScript types
const isUser = await createIsTypeFn<User>();
const stringify = await createJsonStringifyFn<User>();
const mockUser = await createMockTypeFn<User>();

// Generate mock data - respects type structure
const user = mockUser();
//     ^?

// Validate data at runtime
isUser(user);
// Serialize complex types (Date, Set) to JSON
const json = stringify(user);
//     ^?
