import {initClient} from '@mionjs/client';
// start:api-type-imports-invalid
import {MyApi} from './myApi.routes.ts'; // rpc-client-imports-server-value: imported without `type`

export const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});
// end:api-type-imports-invalid
