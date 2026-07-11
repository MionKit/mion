import {GoogleCFOptions, createGoogleCFHandler} from '@mionjs/platform-gcloud';
import './myApi.routes';

// set options specific for GC Cloud Functions
const gcfOptions: Partial<GoogleCFOptions> = {};

// export Google Cloud Functions Handler
export const handler = createGoogleCFHandler(gcfOptions);
