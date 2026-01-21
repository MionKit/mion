import {createIsTypeFn, createStringifyJsonFn, createMockTypeFn} from '@mionkit/run-types';
interface User {
    id: string;
    name: string;
    createdAt: Date;
    tags: Set<string>;
}
// @annotate: Create JIT-compiled functions directly from TypeScript types
const isUser = await createIsTypeFn<User>();
const stringify = await createStringifyJsonFn<User>();
const mockUser = await createMockTypeFn<User>();

// @log: Generate mock data - respects type structure

const user = mockUser();
//     ^?


// @log: Validate data at runtime
isUser(user);

// @log: Serialize complex types (Date, Set, unions) to JSON

const json = stringify(user);
//     ^?
