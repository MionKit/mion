import {createMockTypeFn} from '@mionkit/run-types';

// start-basic
interface User {
    id: string;
    name: string;
    email: string;
    age: number;
    createdAt: Date;
}

const mockUser = await createMockTypeFn<User>();

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
import {StrEmail} from '@mionkit/type-formats/FormatsString';
import {NumPositiveInt} from '@mionkit/type-formats/FormatsNumber';

interface ValidatedUser {
    email: StrEmail;
    followersCount: NumPositiveInt;
}

const mockValidatedUser = await createMockTypeFn<ValidatedUser>();
const validatedUser = mockValidatedUser();
// { email: 'user@example.com', followersCount: 150 }
// end-formats
