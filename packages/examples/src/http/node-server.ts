import {createServer} from 'http';
import {initMionHttp} from '@mionjs/platform-node';
import {routes} from './node-routes.ts';

const server = createServer(initMionHttp(routes));

server.listen(3000, () => {
    console.log('Server running at http://localhost:3000');
});
