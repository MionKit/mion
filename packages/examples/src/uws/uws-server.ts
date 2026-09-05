import {startUwsServer} from '@mionjs/platform-uws';
import './uws-routes.ts';

const server = await startUwsServer({port: 3000});

console.log('Server running at http://localhost:3000');
