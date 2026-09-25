import {startNodeServer} from '@mionjs/platform-node';
import './node-routes.ts';

const server = await startNodeServer({port: 3000});

console.log('Server running at http://localhost:3000');
