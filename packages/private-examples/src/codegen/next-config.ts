import {withMion} from '@mionjs/devtools/next';

// await is required: the whole-program scan must finish before Turbopack hands files over
export default await withMion({
  reactStrictMode: true,
});
