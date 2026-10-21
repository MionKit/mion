import {createVercelHandler} from '@mionjs/platform-vercel';
// creates the router and registers the routes
import './routes-example.ts';

// the App Router method handlers Next expects
export const {GET, POST, PUT, DELETE, PATCH} = createVercelHandler();
