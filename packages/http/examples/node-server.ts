import {createServer} from 'http';
import {initMionHttp} from '@mionkit/http';
import {routes} from './routes';

const server = createServer(initMionHttp(routes));

server.listen(3000, () => {
    console.log('Server running at http://localhost:3000');
});

