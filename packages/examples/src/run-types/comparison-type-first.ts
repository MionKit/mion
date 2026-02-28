import {createIsTypeFn} from '@mionkit/run-types';
import {FormatEmail} from '@mionkit/type-formats/StringFormats';

// run-types example - TypeScript is source of truth
interface User {
    name: string;
    age: number;
    email: FormatEmail; // Using type formats for validation
}

const validate = await createIsTypeFn<User>();
