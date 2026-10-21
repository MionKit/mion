import {withMion} from '@mionjs/devtools/next';

export default await withMion(
  {reactStrictMode: true},
  {
    // fetch each route's metadata from the server on first use
    client: {routes: 'fetch'},
  }
);
