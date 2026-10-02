import {withMion} from '@mionjs/devtools/next';

export default await withMion(
  {reactStrictMode: true},
  {
    // every route's metadata and compiled functions come from the server on first use
    client: {routes: 'fetch'},
  }
);
