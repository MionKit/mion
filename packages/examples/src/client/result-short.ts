import {initClient} from '@mionjs/client';
import type {AuthUserApi} from './auth-user.routes.ts';

const {routes} = initClient<AuthUserApi>({baseURL: 'http://localhost:3000'});

// the two slots almost every call needs
const [user, error] = await routes.users.getById('USER-123').call();

if (error) console.log(error.publicMessage);
else console.log(user?.name); // John
