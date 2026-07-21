import {createValidate} from '@mionjs/run-types';
import {FormatEmail} from '@mionjs/type-formats/StringFormats';

// run-types example - TypeScript is the source of truth
interface User {
    name: string;
    age: number;
    email: FormatEmail; // Using type formats for validation
}

const validate = createValidate<User>();
