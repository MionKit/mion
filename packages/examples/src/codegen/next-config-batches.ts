import {withMion} from '@mionjs/devtools/next';

// The batch transport, Next side. Next IS the client build here, so it runs the EMIT
// half: it writes the manifest that the mion API server's own vite build later
// consumes with `batches: {consume}`.
export default await withMion(
  {reactStrictMode: true},
  {
    runTypes: {tsConfig: './tsconfig.json'},
    batches: {emit: '.mion/batches.json'},
  }
);
