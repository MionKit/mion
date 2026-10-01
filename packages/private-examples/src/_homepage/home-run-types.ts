import {createValidateFn, createJsonEncoderFn} from '@mionjs/run-types';
import {createMockDataFn} from '@mionjs/run-types/mocking';
interface User {
  id: string;
  name: string;
  createdAt: Date;
  tags: Set<string>;
}
// @annotate: Create precompiled functions directly from TypeScript types

const isUser = createValidateFn<User>();
const encodeUser = createJsonEncoderFn<User>();
const mockUser = createMockDataFn<User>();

// @annotate: Generate mock data - respects type structure

const user = mockUser();
//     ^?

// @annotate: Validate data at runtime

isUser(user);
// @annotate: JSON round trip for complex types (Date, Set, unions)

const json = encodeUser(user);
//     ^?
