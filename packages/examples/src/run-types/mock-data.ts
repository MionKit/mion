import {createMockTypeFn} from '@mionkit/run-types';

// start-basic
interface User {
    id: string;
    name: string;
    email: string;
    age: number;
    createdAt: Date;
}

async function basicMockExample() {
    const mockUser = await createMockTypeFn<User>();

    const user = mockUser();
    // {
    //   id: 'abc123xyz',
    //   name: 'mockString',
    //   email: 'test@example.com',
    //   age: 42,
    //   createdAt: Date('2025-01-15T12:00:00.000Z')
    // }
}
// end-basic

// start-formats
import {StrEmail, NumPositiveInt} from '@mionkit/type-formats';

interface ValidatedUser {
    email: StrEmail;
    followersCount: NumPositiveInt;
}

async function formatsMockExample() {
    const mockValidatedUser = await createMockTypeFn<ValidatedUser>();
    const user = mockValidatedUser();
    // { email: 'user@example.com', followersCount: 150 }
}
// end-formats

