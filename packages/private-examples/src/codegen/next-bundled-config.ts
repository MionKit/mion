import {withMion} from '@mionjs/devtools/next';

export default await withMion(
  {reactStrictMode: true},
  {
    bundleApi: 'mixed', // bundles what the build sees, fetches the rest
    api: {tsConfig: '../api/tsconfig.json'},
  }
);
