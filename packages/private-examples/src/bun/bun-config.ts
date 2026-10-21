import {startBunServer} from '@mionjs/platform-bun';
import './bun-routes.ts';

await startBunServer({port: 3000});
