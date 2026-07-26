import {createValidateFn} from '@ts-runtypes/core';
import {Email} from '@ts-runtypes/core/formats';

// run-types example - TypeScript is the source of truth
interface User {
    name: string;
    age: number;
    email: Email; // Using type formats for validation
}

const validate = createValidateFn<User>();
