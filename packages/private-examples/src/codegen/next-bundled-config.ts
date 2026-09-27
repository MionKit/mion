import {withMion} from '@mionjs/devtools/next';

export default await withMion(
  {reactStrictMode: true},
  {
    bundleApi: true, // the default: bundles every route the client calls
    api: {tsConfig: '../api/tsconfig.json'},
  }
);
