import {withMion} from '@mionjs/devtools/next';

export default await withMion(
  {reactStrictMode: true},
  {
    bundleApi: true, // the default
    api: {tsConfig: '../api/tsconfig.json'},
  }
);
