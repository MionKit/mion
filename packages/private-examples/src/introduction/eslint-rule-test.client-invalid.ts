import {initClient} from '@mionjs/client';
// start:api-type-imports-invalid
import {MyApi} from './myApi.routes.ts'; // SRV001: imported without `type`

export const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});
// end:api-type-imports-invalid
