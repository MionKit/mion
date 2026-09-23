import {GoogleCFOptions, createGoogleCFHandler} from '@mionjs/platform-gcloud';
import './myApi.routes.ts';

const gcfOptions: Partial<GoogleCFOptions> = {};
export const handler = createGoogleCFHandler(gcfOptions);
