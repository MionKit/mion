import {withMion} from '@mionjs/devtools/next';

// The serverMapFrom transport, Next side. Next IS the client build here, so it runs
// the HARVEST half: it writes the manifest that the mion API server's own vite build
// later consumes with `serverMappers: {consume}`.
export default await withMion(
  {reactStrictMode: true},
  {
    runTypes: {tsConfig: './tsconfig.json'},
    serverMappers: {emit: '.mion/server-mappers.json'},
  }
);
