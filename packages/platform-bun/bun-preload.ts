import {plugin} from 'bun';
import {runTypesLoader} from './loader/runtypes-loader';
import {join} from 'path';

const tsConfig = join(__dirname, './tsconfig.json');

plugin(runTypesLoader({tsConfig}));
