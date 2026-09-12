import {withMion} from '@mionjs/devtools/next';

// A Next app calling a mion API in another project: 'mixed' bundles what the build sees and
// fetches the rest.
export default await withMion(
  {reactStrictMode: true},
  {
    bundleApi: 'mixed',
    api: {tsConfig: '../api/tsconfig.json'},
  }
);
