import {defineConfig} from 'vite';
import {resolve} from 'path';
import {readdirSync, statSync} from 'fs';
import dts from 'vite-plugin-dts';
import {mionPlugin, cjsPackageJsonPlugin} from '@mionjs/devtools/vite-plugin';

// Get all TypeScript files from a directory (excluding spec/test files)
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

// Build entry points: multiple root entry files + all src files
const srcEntries = getSourceFiles(resolve(__dirname, 'src'));
const entry: Record<string, string> = {
    // Multiple entry points for this package
    // Entry key becomes output filename, so use the names expected by package.json exports
    NumberFormats: resolve(__dirname, 'NumberFormats.ts'),
    StringFormats: resolve(__dirname, 'StringFormats.ts'),
    BigintFormats: resolve(__dirname, 'BigintFormats.ts'),
    ...Object.fromEntries(Object.entries(srcEntries).map(([name, path]) => [`src/${name}`, path])),
};

export default defineConfig({
    esbuild: {
        legalComments: 'none',
    },
    plugins: [
        cjsPackageJsonPlugin('.dist/cjs'),
        mionPlugin({
            runTypes: {
                tsConfig: resolve(__dirname, 'tsconfig.json'),
            },
        }),
        dts({
            outDir: ['.dist/cjs', '.dist/esm'],
            include: ['*.ts', 'src/**/*.ts'],
            exclude: ['**/*.spec.ts', '**/*.test.ts', 'examples/**'],
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
            external: ['@mionjs/core', '@mionjs/run-types', /^[^./]/],
        },
    },
});
