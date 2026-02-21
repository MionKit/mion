// based on https://github.com/marcj/deepkit/blob/e7da3b48c50115d6e59e233eb9f018513d4d68ce/packages/vite/src/plugin.ts

import {createFilter} from '@rollup/pluginutils';
import * as ts from 'typescript';
import {transformer, declarationTransformer} from '@deepkit/type-compiler';
import {DeepkitTypeOptions} from './types.ts';

/** Creates a pre-configured transform function with the filter and options baked in */
export function createDeepkitTransform(options: DeepkitTypeOptions = {}) {
    const filter = createFilter(options.include ?? ['**/*.tsx', '**/*.ts'], options.exclude ?? 'node_modules/**');
    const transformers: ts.CustomTransformers = {
        before: [transformer],
        after: [declarationTransformer],
    };

    return function transformWithDeepkit(
        code: string,
        fileName: string
    ): {code: string; map: string | undefined} | null {
        if (!filter(fileName)) return null;

        const transformed = ts.transpileModule(code, {
            compilerOptions: Object.assign(
                {
                    target: ts.ScriptTarget.ESNext,
                    module: ts.ModuleKind.ESNext,
                    configFilePath: options.tsConfig || process.cwd() + '/tsconfig.json',
                },
                options.compilerOptions || {}
            ),
            fileName,
            // @ts-ignore - transformers type mismatch between ts versions
            transformers,
        });

        return {
            code: transformed.outputText,
            map: transformed.sourceMapText,
        };
    };
}
