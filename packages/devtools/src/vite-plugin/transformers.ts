/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// based on https://github.com/marcj/deepkit/blob/e7da3b48c50115d6e59e233eb9f018513d4d68ce/packages/vite/src/plugin.ts

import {createFilter} from '@rollup/pluginutils';
import * as ts from 'typescript';
import {transformer, declarationTransformer} from '@deepkit/type-compiler';
import {DeepkitTypeOptions, ExtractedPureFn} from './types.ts';
import {extractPureFnsFromSource} from './extractPureFn.ts';

// ── Deepkit ─────────────────────────────────────────────────────────

/** Deepkit configuration components for integration into the unified transform pipeline */
export interface DeepkitConfig {
    filter: (fileName: string) => boolean;
    compilerOptions: ts.CompilerOptions;
    beforeTransformers: ts.CustomTransformerFactory[];
    afterTransformers: ts.CustomTransformerFactory[];
}

/** Creates deepkit config components that can be integrated into a unified ts.transpileModule call */
export function createDeepkitConfig(options: DeepkitTypeOptions = {}): DeepkitConfig {
    const filter = createFilter(options.include ?? ['**/*.tsx', '**/*.ts'], options.exclude ?? 'node_modules/**');
    return {
        filter: (fileName: string) => filter(fileName),
        compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
            configFilePath: options.tsConfig || process.cwd() + '/tsconfig.json',
            ...(options.compilerOptions || {}),
        },
        beforeTransformers: [transformer],
        afterTransformers: [declarationTransformer],
    };
}

// ── Pure function transformer ───────────────────────────────────────

/**
 * Creates a TypeScript CustomTransformerFactory that injects build-time data into pure function calls.
 * For pureServerFn(def): injects bodyHash as 2nd argument.
 * For registerPureFnFactory(ns, id, fn): injects ParsedFactoryFn as 4th argument.
 *
 * Pre-extracts data using existing extractPureFnsFromSource to ensure hash consistency
 * with the virtual module cache (same whole-file esbuild strip + JS AST path).
 */
export function createPureFnTransformerFactory(
    originalSource: string,
    filePath: string,
    collector?: ExtractedPureFn[]
): ts.CustomTransformerFactory {
    const hasPureServerFn = originalSource.includes('pureServerFn');
    const hasFactory = originalSource.includes('registerPureFnFactory');
    const hasMapFrom = originalSource.includes('mapFrom');

    const pureServerFns = hasPureServerFn ? extractPureFnsFromSource(originalSource, filePath, 'pureServerFn') : [];
    const factoryFns = hasFactory ? extractPureFnsFromSource(originalSource, filePath, 'registerPureFnFactory') : [];
    const mapFromFns = hasMapFrom ? extractPureFnsFromSource(originalSource, filePath, 'mapFrom') : [];

    return (context: ts.TransformationContext): ts.CustomTransformer => {
        let pureIdx = 0;
        let factoryIdx = 0;
        let mapFromIdx = 0;

        function visitor(node: ts.Node): ts.Node {
            if (ts.isCallExpression(node)) {
                const callee = node.expression;
                if (ts.isIdentifier(callee)) {
                    if (callee.text === 'pureServerFn' && pureIdx < pureServerFns.length) {
                        if (node.arguments.length >= 2) {
                            pureIdx++;
                            return ts.visitEachChild(node, visitor, context);
                        }
                        const data = pureServerFns[pureIdx++];
                        collector?.push(data);
                        return context.factory.updateCallExpression(node, node.expression, node.typeArguments, [
                            ...node.arguments,
                            context.factory.createStringLiteral(data.bodyHash),
                        ]);
                    }
                    if (callee.text === 'registerPureFnFactory' && factoryIdx < factoryFns.length) {
                        if (node.arguments.length >= 4) {
                            factoryIdx++;
                            return ts.visitEachChild(node, visitor, context);
                        }
                        const data = factoryFns[factoryIdx++];
                        collector?.push(data);
                        return context.factory.updateCallExpression(node, node.expression, node.typeArguments, [
                            ...node.arguments,
                            createParsedFactoryFnNode(context.factory, data),
                        ]);
                    }
                    if (callee.text === 'mapFrom' && mapFromIdx < mapFromFns.length) {
                        // mapFrom(source, mapper) -> mapFrom(source, mapper, 'bodyHash')
                        if (node.arguments.length >= 3) {
                            mapFromIdx++;
                            return ts.visitEachChild(node, visitor, context);
                        }
                        const data = mapFromFns[mapFromIdx++];
                        collector?.push(data);
                        return context.factory.updateCallExpression(node, node.expression, node.typeArguments, [
                            ...node.arguments,
                            context.factory.createStringLiteral(data.bodyHash),
                        ]);
                    }
                }
            }
            return ts.visitEachChild(node, visitor, context);
        }

        return {
            transformSourceFile(sourceFile: ts.SourceFile): ts.SourceFile {
                if (pureServerFns.length === 0 && factoryFns.length === 0 && mapFromFns.length === 0) return sourceFile;
                return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
            },
            transformBundle(bundle: ts.Bundle): ts.Bundle {
                return bundle;
            },
        };
    };
}

/** Creates an AST node for {bodyHash: '...', paramNames: [...], code: '...'} */
function createParsedFactoryFnNode(factory: ts.NodeFactory, data: ExtractedPureFn): ts.ObjectLiteralExpression {
    return factory.createObjectLiteralExpression([
        factory.createPropertyAssignment('bodyHash', factory.createStringLiteral(data.bodyHash)),
        factory.createPropertyAssignment(
            'paramNames',
            factory.createArrayLiteralExpression(data.paramNames.map((n) => factory.createStringLiteral(n)))
        ),
        factory.createPropertyAssignment('code', factory.createStringLiteral(data.fnBody)),
    ]);
}
