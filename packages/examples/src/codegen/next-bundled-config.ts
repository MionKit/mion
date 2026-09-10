import {withMion} from '@mionjs/devtools/next';

// next.config.ts of a Next app that calls a mion API hosted in a separate project. `bundleApi`
// ships the routes this app calls with their compiled functions, and `api.tsConfig` resolves their
// types in the API project's own program. The `mixed` lane bundles what the build can see and
// still fetches a route it could not, so a call written through a helper that widens the route
// keeps working.
export default await withMion(
  {reactStrictMode: true},
  {
    bundleApi: 'mixed',
    api: {tsConfig: '../api/tsconfig.json'},
  }
);
