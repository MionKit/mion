import {createMockData} from '@ts-runtypes/core';

// start-basic
interface User {
    id: string;
    name: string;
    email: string;
    age: number;
    createdAt: Date;
}

const mockUser = createMockData<User>();

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
import {Email} from '@ts-runtypes/core/formats';
import {PositiveInt} from '@ts-runtypes/core/formats';

interface ValidatedUser {
    email: Email;
    followersCount: PositiveInt;
}

const mockValidatedUser = createMockData<ValidatedUser>();
const validatedUser = mockValidatedUser();
// { email: 'user@example.com', followersCount: 150 }
// end-formats
