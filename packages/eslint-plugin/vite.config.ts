import {defineConfig} from 'vite';
import {resolve} from 'path';
import {readdirSync, statSync} from 'fs';
import dts from 'vite-plugin-dts';

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

// Build entry points from src directory
const srcEntries = getSourceFiles(resolve(__dirname, 'src'));
const entry: Record<string, string> = {
    ...Object.fromEntries(Object.entries(srcEntries).map(([name, path]) => [name, path])),
};

export default defineConfig({
    plugins: [
        dts({
            outDir: ['build/cjs', 'build/esm'],
            include: ['src/**/*.ts'],
            exclude: ['**/*.spec.ts', '**/*.test.ts'],
        }),
    ],
    build: {
        lib: {
            entry,
            formats: ['es', 'cjs'],
        },
        outDir: 'build',
        emptyOutDir: true,
        sourcemap: true,
        minify: false,
        rollupOptions: {
            output: [
                {
                    format: 'es',
                    dir: 'build/esm',
                    entryFileNames: '[name].js',
                    preserveModules: true,
                    preserveModulesRoot: 'src',
                },
                {
                    format: 'cjs',
                    dir: 'build/cjs',
                    entryFileNames: '[name].js',
                    preserveModules: true,
                    preserveModulesRoot: 'src',
                },
            ],
            external: [/^[^./]/],
        },
    },
});
