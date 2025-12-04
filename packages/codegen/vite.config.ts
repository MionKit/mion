import {defineConfig} from 'vite';
import {resolve} from 'path';
import {readdirSync, statSync} from 'fs';
import dts from 'vite-plugin-dts';
import {deepkitType} from '@deepkit/vite';

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

// Build entry points: index.ts + all src files
const srcEntries = getSourceFiles(resolve(__dirname, 'src'));
const entry: Record<string, string> = {
    index: resolve(__dirname, 'index.ts'),
    ...Object.fromEntries(Object.entries(srcEntries).map(([name, path]) => [`src/${name}`, path])),
};

export default defineConfig({
    plugins: [
        deepkitType({
            tsConfig: resolve(__dirname, 'tsconfig.json'),
        }),
        dts({
            outDir: '.dist/cjs',
            include: ['index.ts', 'src/**/*.ts'],
            exclude: ['**/*.spec.ts', '**/*.test.ts', 'mion-aot-template/**', 'bin/**', 'src/run-*.ts'],
        }),
    ],
    build: {
        lib: {
            entry,
            formats: ['cjs'],
        },
        outDir: '.dist',
        emptyOutDir: true,
        minify: false,
        rollupOptions: {
            output: {
                format: 'cjs',
                dir: '.dist/cjs',
                entryFileNames: '[name].js',
                preserveModules: true,
                preserveModulesRoot: '.',
            },
            external: ['@mionkit/core', '@mionkit/router', '@mionkit/run-types', /^[^./]/],
        },
    },
});
