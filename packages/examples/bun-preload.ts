import {plugin} from 'bun';
import {runTypesLoader} from '@mionkit/platform-bun/loader/runtypes-loader';
import {join} from 'path';

const tsConfig = join(__dirname, './tsconfig.json');

plugin(runTypesLoader({tsConfig}));
