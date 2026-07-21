import {createMockData} from '@mionjs/run-types';

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
import {FormatEmail} from '@mionjs/type-formats/StringFormats';
import {FormatPositiveInt} from '@mionjs/type-formats/NumberFormats';

interface ValidatedUser {
    email: FormatEmail;
    followersCount: FormatPositiveInt;
}

const mockValidatedUser = createMockData<ValidatedUser>();
const validatedUser = mockValidatedUser();
// { email: 'user@example.com', followersCount: 150 }
// end-formats
