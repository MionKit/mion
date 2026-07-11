import {defineConfig} from 'vite';
import {resolve} from 'path';
import {readdirSync, statSync} from 'fs';
import dts from 'vite-plugin-dts';
import {cjsPackageJsonPlugin} from './src/vite-plugin/cjsPackageJsonPlugin';

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

// Build entry points from src/eslint directory
const srcEntries = getSourceFiles(resolve(__dirname, 'src/eslint'));
const entry: Record<string, string> = {
    index: resolve(__dirname, 'src/eslint/index.ts'),
    ...Object.fromEntries(Object.entries(srcEntries).map(([name, path]) => [`src/eslint/${name}`, path])),
};

export default defineConfig({
    esbuild: {
        legalComments: 'none',
    },
    plugins: [
        cjsPackageJsonPlugin('build/eslint/cjs'),
        dts({
            outDir: ['build/eslint/cjs', 'build/eslint/esm'],
            include: ['src/eslint/**/*.ts', 'src/pureFns/**/*.ts'],
            exclude: ['**/*.spec.ts', '**/*.test.ts'],
            pathsToAliases: false,
        }),
    ],
    build: {
        lib: {
            entry,
            formats: ['es', 'cjs'],
        },
        outDir: 'build/eslint',
        emptyOutDir: true,
        sourcemap: true,
        minify: false,
        rollupOptions: {
            output: [
                {
                    format: 'es',
                    dir: 'build/eslint/esm',
                    entryFileNames: '[name].js',
                    preserveModules: true,
                    preserveModulesRoot: '.',
                },
                {
                    format: 'cjs',
                    dir: 'build/eslint/cjs',
                    entryFileNames: '[name].cjs',
                    preserveModules: true,
                    preserveModulesRoot: '.',
                },
            ],
            external: ['@typescript-eslint/utils', /^[^./]/],
        },
    },
});
