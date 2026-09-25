import {createValidateFn} from '@mionjs/run-types';
import {Email} from '@mionjs/run-types/formats';

// run-types example - TypeScript is the source of truth
interface User {
  name: string;
  age: number;
  email: Email; // Using type formats for validation
}

const validate = createValidateFn<User>();
