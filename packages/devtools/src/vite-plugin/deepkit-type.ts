// copied from https://github.com/marcj/deepkit/blob/e7da3b48c50115d6e59e233eb9f018513d4d68ce/packages/vite/src/plugin.ts

import {createFilter} from '@rollup/pluginutils';
import {DeepkitLoader} from '@deepkit/type-compiler';
import {DeepkitTypeOptions} from './types.ts';

/**
 * Deepkit type transformer function.
 * Used internally by the mion plugin.
 */
export function transformWithDeepkit(
    code: string,
    fileName: string,
    options: DeepkitTypeOptions = {}
): {code: string; map: null} | null {
    const filter = createFilter(options.include ?? ['**/*.tsx', '**/*.ts'], options.exclude ?? 'node_modules/**');

    if (!filter(fileName)) return null;

    const loader = new DeepkitLoader();

    const transformed = loader.transform(code, fileName);

    return {
        code: transformed,
        map: null,
    };
}
