import {
  createValidateFn,
  createJsonEncoderFn,
  createBinaryEncoderFn,
  createMockDataFn,
} from '@mionjs/run-types';
interface User {
  id: string;
  name: string;
  createdAt: Date;
  tags: Set<string>;
}
// @annotate: Create precompiled functions directly from TypeScript types

const isUser = createValidateFn<User>();
const encodeUser = createJsonEncoderFn<User>();
const toBinaryUser = createBinaryEncoderFn<User>();
const mockUser = createMockDataFn<User>();

// @annotate: Generate mock data - respects type structure

const user = mockUser();
//     ^?

// @annotate: Validate data at runtime

isUser(user);
// @annotate: Serialize complex types (Date, Set, unions) to JSON

const json = encodeUser(user);
//     ^?
