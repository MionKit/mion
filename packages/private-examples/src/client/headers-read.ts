import {initClient} from '@mionjs/client';
import type {HeadersApi} from '../router/headers-api.routes.ts';

const {routes} = initClient<HeadersApi>({baseURL: 'http://localhost:3000'});

// the result is a HeadersSubset built from the response headers
const [download] = await routes.getDownloadUrl('report-42').call();

if (download) console.log(download.headers['x-download-url']);
