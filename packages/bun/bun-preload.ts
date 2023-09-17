import {plugin} from 'bun';
import {runTypesLoader} from './index';
import {join} from 'path';

const tsConfig = join(__dirname, './tsconfig.json');

plugin(runTypesLoader({tsConfig}));
