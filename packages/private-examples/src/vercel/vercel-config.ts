import {createVercelHandler} from '@mionjs/platform-vercel';
import './vercel-routes.ts';

export const {GET, POST, PUT, DELETE, PATCH, OPTIONS} = createVercelHandler({
  maxBodySize: 512 * 1024,
});
