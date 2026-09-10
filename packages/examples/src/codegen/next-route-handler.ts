// app/api/[...mion]/route.ts — the mion API, hosted inside your Next app.
// Importing the routes module creates the router and registers the routes; createVercelHandler
// turns them into the App Router method handlers Next expects.
import {createVercelHandler} from '@mionjs/platform-vercel';
import './routes-example.ts';

export const {GET, POST, PUT, DELETE, PATCH} = createVercelHandler();
