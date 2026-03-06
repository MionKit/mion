import {defineConfig} from 'vite';
import {resolve} from 'path';
import {readdirSync, statSync} from 'fs';
import dts from 'vite-plugin-dts';
import {cjsPackageJsonPlugin} from '@mionkit/devtools/vite-plugin';

function getSourceFiles(dir: string, base = ''): Record<string, string> {
    const entries: Record<string, string> = {};
    const files = readdirSync(dir);

    for (const file of files) {
        const fullPath = resolve(dir, file);
        const relativePath = base ? `${base}/${file}` : file;

        if (statSync(fullPath).isDirectory()) {
            Object.assign(entries, getSourceFiles(fullPath, relativePath));
        } else if (file.endsWith('.ts') && !file.endsWith('.spec.ts') && !file.endsWith('.test.ts')) {
            const name = relativePath.replace(/\.ts$/, '');
            entries[name] = fullPath;
        }
    }

    return entries;
}

const cliEntries = getSourceFiles(resolve(__dirname, 'cli'));
const entry: Record<string, string> = {
    index: resolve(__dirname, 'index.ts'),
    ...Object.fromEntries(Object.entries(cliEntries).map(([name, path]) => [`cli/${name}`, path])),
};

export default defineConfig({
    esbuild: {
        legalComments: 'none',
    },
    plugins: [
        cjsPackageJsonPlugin('.dist/cjs'),
        dts({
            outDir: ['.dist/cjs', '.dist/esm'],
            include: ['index.ts', 'cli/**/*.ts'],
            exclude: ['**/*.spec.ts', '**/*.test.ts'],
            pathsToAliases: false,
            tsconfigPath: resolve(__dirname, 'tsconfig.build.json'),
        }),
    ],
    build: {
        lib: {
            entry,
            formats: ['es', 'cjs'],
        },
        outDir: '.dist',
        emptyOutDir: true,
        sourcemap: true,
        minify: false,
        rollupOptions: {
            output: [
                {
                    format: 'es',
                    dir: '.dist/esm',
                    entryFileNames: '[name].js',
                    preserveModules: true,
                    preserveModulesRoot: '.',
                    banner: (chunk) => (chunk.name === 'cli/index' ? '#!/usr/bin/env node\n' : ''),
                },
                {
                    format: 'cjs',
                    dir: '.dist/cjs',
                    entryFileNames: '[name].cjs',
                    preserveModules: true,
                    preserveModulesRoot: '.',
                },
            ],
            external: [/^node:/, /^[^./]/],
        },
    },
});
