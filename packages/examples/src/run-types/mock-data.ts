import {createMockDataFn} from '@mionjs/run-types';

// start-basic
interface User {
  id: string;
  name: string;
  email: string;
  age: number;
  createdAt: Date;
}

const mockUser = createMockDataFn<User>();

const user = mockUser();
// {
//   id: 'abc123xyz',
//   name: 'mockString',
//   email: 'test@example.com',
//   age: 42,
//   createdAt: Date('2025-01-15T12:00:00.000Z')
// }
// end-basic

// start-formats
import {Email} from '@mionjs/run-types/formats';
import {PositiveInt} from '@mionjs/run-types/formats';

interface ValidatedUser {
  email: Email;
  followersCount: PositiveInt;
}

const mockValidatedUser = createMockDataFn<ValidatedUser>();
const validatedUser = mockValidatedUser();
// { email: 'user@example.com', followersCount: 150 }
// end-formats
