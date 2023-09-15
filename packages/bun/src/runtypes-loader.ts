/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {BunPlugin, plugin} from 'bun';
import {readFileSync} from 'fs';
import ts from 'typescript';
import {declarationTransformer, transformer} from '@deepkit/type-compiler';
import {cwd} from 'process';

export interface Options {
    include?: string;
    exclude?: string;
    tsConfig?: string;
    transformers?: ts.CustomTransformers;
    compilerOptions?: ts.CompilerOptions;
}

// TODO: check if we can actually pass the options object
function transform(code: string, fileName: string, options: Options = {}) {
    const transformers = options.transformers || {
        before: [transformer],
        after: [declarationTransformer],
    };
    const transformed = ts.transpileModule(code, {
        compilerOptions: Object.assign(
            {
                target: ts.ScriptTarget.ESNext,
                module: ts.ModuleKind.ESNext,
                configFilePath: options.tsConfig || cwd() + '/tsconfig.json',
            },
            options.compilerOptions || {}
        ),
        fileName,
        transformers,
    });

    // console.log(transformed.outputText);

    return {
        code: transformed.outputText,
        map: transformed.sourceMapText,
    };
}

function RunTypesPlugin(): BunPlugin {
    return {
        name: 'bun-plugin-run-types',
        setup(builder) {
            builder.onLoad({filter: /\.(ts|tsx|tsr)$/}, (args) => {
                console.log(cwd());
                const code = readFileSync(args.path, 'utf8');
                const contents = transform(code, args.path).code;
                // TODO: not sure how to set the source map, think is not properly supported by bun
                return {
                    contents,
                    loader: 'js',
                };
            });
        },
    };
}

plugin(RunTypesPlugin());
