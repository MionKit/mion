import {GoogleCFOptions, googleCFHandler, setGoogleCFOpts} from '@mionkit/platform-gcloud';
import './myApi.routes';

// set options specific for GC Cloud Functions
const gcfOptions: Partial<GoogleCFOptions> = {};
setGoogleCFOpts(gcfOptions);

// export Google Cloud Functions Handler
export const handler = googleCFHandler;
