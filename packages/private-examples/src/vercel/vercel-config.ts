import {createVercelHandler} from '@mionjs/platform-vercel';
import './vercel-routes.ts';

export const {GET, POST, PUT, DELETE, PATCH} = createVercelHandler({
  maxBodySize: 512 * 1024,
});
