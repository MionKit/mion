import {createValidate} from '@mionjs/run-types';

interface User {
    name: string;
    age: number;
}

// createValidate is synchronous — the mion vite plugin injects the compiled validator at build time.
const validate = createValidate<User>();

validate({name: 'John', age: 30}); // true
validate({name: 'John'}); // false (missing age)
validate({name: 'John', age: '30'}); // false (age is string)
