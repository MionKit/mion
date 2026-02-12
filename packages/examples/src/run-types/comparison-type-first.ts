import {createIsTypeFn} from '@mionkit/run-types';
import {StrEmail} from '@mionkit/type-formats/FormatsString';

// run-types example - TypeScript is source of truth
interface User {
    name: string;
    age: number;
    email: StrEmail; // Using type formats for validation
}

async function example() {
    const validate = await createIsTypeFn<User>();
}
