import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

// Your TypeScript types ARE the validation schema
interface User {
  id: string;
  email: string;
  age: number;
  birthDate: Date;
  tags: Set<string>;
}

type NewUser = Omit<User, 'id'>;

const routes = {
  createUser: mion.route((ctx, user: NewUser): User => {
    // Date and Set were restored from JSON, then user was validated
    console.log(user.birthDate instanceof Date); // true
    console.log(user.tags instanceof Set); // true
    return {id: 'USER-123', ...user};
  }),
} satisfies Routes;
