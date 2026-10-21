// The whole API, hosted by the Next app. Importing the routes module creates the router and
// registers the routes; createVercelHandler turns them into App Router method handlers.
import {createVercelHandler} from '@mionjs/platform-vercel';
import '../../../src/routes';

export const {GET, POST, PUT, DELETE, PATCH} = createVercelHandler();
