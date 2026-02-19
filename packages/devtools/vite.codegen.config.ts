import {defineConfig} from 'vite';
import {resolve} from 'path';
import {readdirSync, statSync} from 'fs';

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

// Build entry points from src/codegen directory
const srcEntries = getSourceFiles(resolve(__dirname, 'src/codegen'));
const entry: Record<string, string> = {
    index: resolve(__dirname, 'src/codegen/cli-build-aot.ts'),
    ...Object.fromEntries(Object.entries(srcEntries).map(([name, path]) => [`src/codegen/${name}`, path])),
};

export default defineConfig({
    esbuild: {
        legalComments: 'none',
    },
    plugins: [
        // Note: dts plugin removed - types are served from source .ts files
        // because the codegen module imports from @mionkit/* packages which
        // don't have .dist directories during development
    ],
    build: {
        lib: {
            entry,
            formats: ['es', 'cjs'],
        },
        outDir: 'build/codegen',
        emptyOutDir: true,
        sourcemap: true,
        minify: false,
        ssr: true, // Build for Node.js environment
        rollupOptions: {
            output: [
                {
                    format: 'es',
                    dir: 'build/codegen/esm',
                    entryFileNames: '[name].js',
                    preserveModules: true,
                    preserveModulesRoot: '.',
                },
                {
                    format: 'cjs',
                    dir: 'build/codegen/cjs',
                    entryFileNames: '[name].js',
                    preserveModules: true,
                    preserveModulesRoot: '.',
                },
            ],
            external: [
                '@mionkit/core',
                '@mionkit/router',
                '@mionkit/run-types',
                'ts-node',
                'tsconfig-paths',
                'typescript',
                'fs',
                'path',
                'util',
                /^node:/,
            ],
        },
    },
});
