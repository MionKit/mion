/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {BunPlugin} from 'bun';
import {readFileSync} from 'fs';
import ts from 'typescript';
import {declarationTransformer, transformer} from '@deepkit/type-compiler';
import {cwd} from 'process';

interface Options {
    include?: string;
    exclude?: string;
    tsConfig?: string;
    transformers?: ts.CustomTransformers;
    compilerOptions?: ts.CompilerOptions;
}

function transform(code: string, fileName: string, options) {
    const transformers = options.transformers || {
        before: [transformer],
        after: [declarationTransformer],
    };
    const compilerOptions: ts.CompilerOptions = Object.assign(
        {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
            configFilePath: options.tsConfig || cwd() + '/tsconfig.json',
            // neither sourcemaps or inlined source maps working correctly so no point on emitting them
            inlineSourceMap: false,
            sourceMap: false,
        },
        options.compilerOptions || {}
    );

    const transformed = ts.transpileModule(code, {
        compilerOptions,
        fileName,
        transformers,
    });

    return {
        code: transformed.outputText,
        map: transformed.sourceMapText,
    };
}

/**
 * Factory function for RunTypes Loader
 * Does some transpilation of typescript using custom @deepkit/type-compiler transformers.
 * By default third party plugins should export a factory function https://bun.sh/docs/runtime/plugins#third-party-plugins
 * @param options
 * @returns
 */
export function runTypesLoader(options: Options = {}): BunPlugin {
    return {
        name: 'bun-plugin-run-types',
        setup(builder) {
            builder.config = {
                ...builder.config,
                sourcemap: 'inline',
            };
            builder.onLoad({filter: /\.(ts|tsx)$/}, (args) => {
                const code = readFileSync(args.path, 'utf8');
                const contents = transform(code, args.path, options).code;
                return {
                    contents,
                    loader: 'js',
                };
            });
        },
    };
}
