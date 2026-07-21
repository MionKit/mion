import {defineConfig} from 'vite';
import {resolve} from 'path';
import {readdirSync, statSync} from 'fs';
import dts from 'vite-plugin-dts';
import {mionVitePlugin, cjsPackageJsonPlugin} from '@mionjs/devtools/vite-plugin';

// Get all TypeScript files from a directory (excluding spec/test files and excluded patterns)
function getSourceFiles(dir: string, base = ''): Record<string, string> {
    const entries: Record<string, string> = {};
    const files = readdirSync(dir);

    // Excluded directories/patterns from tsconfig
    const excludedDirs = ['xyz-Template'];

    for (const file of files) {
        const fullPath = resolve(dir, file);
        const relativePath = base ? `${base}/${file}` : file;

        if (statSync(fullPath).isDirectory()) {
            // Skip excluded directories
            if (excludedDirs.includes(file)) continue;
            Object.assign(entries, getSourceFiles(fullPath, relativePath));
        } else if (
            file.endsWith('.ts') &&
            !file.endsWith('.spec.ts') &&
            !file.endsWith('.test.ts') &&
            // Exclude specific files from tsconfig
            !relativePath.includes('serialization-suite')
        ) {
            const name = relativePath.replace(/\.ts$/, '');
            entries[name] = fullPath;
        }
    }

    return entries;
}

// Build entry points: index.ts + all src files
const srcEntries = getSourceFiles(resolve(__dirname, 'src'));
const entry: Record<string, string> = {
    index: resolve(__dirname, 'index.ts'),
    ...Object.fromEntries(Object.entries(srcEntries).map(([name, path]) => [`src/${name}`, path])),
};

export default defineConfig({
    esbuild: {
        legalComments: 'none',
    },
    plugins: [
        cjsPackageJsonPlugin('.dist/cjs'),
        // Deepkit type transformer - enables runtime type information
        mionVitePlugin({
            runTypes: {
                tsConfig: resolve(__dirname, 'tsconfig.json'),
                exclude: ['**/jitCompilers/**', '**/lib/**', '**/mocking/**', '../nodes/**'],
            },
        }),
        dts({
            outDir: ['.dist/cjs', '.dist/esm'],
            include: ['index.ts', 'src/**/*.ts'],
            exclude: ['**/*.spec.ts', '**/*.test.ts', '**/xyz-Template/**', '**/serialization-suite.ts'],
            pathsToAliases: false,
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
                },
                {
                    format: 'cjs',
                    dir: '.dist/cjs',
                    entryFileNames: '[name].cjs',
                    preserveModules: true,
                    preserveModulesRoot: '.',
                },
            ],
            external: [
                // Mark all external dependencies as external
                '@mionjs/core',
                // Also mark any other node_modules as external
                /^[^./]/,
            ],
        },
    },
});
