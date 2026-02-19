import {defineConfig} from 'vite';
import {resolve} from 'path';
import {readdirSync, statSync, existsSync} from 'fs';
import dts from 'vite-plugin-dts';
import {deepkitType} from '@deepkit/vite';

// Resolve workspace packages to source directories for vite-node
const workspaceRoot = resolve(__dirname, '../..');

// Get all TypeScript files from src directory (excluding spec/test files)
function getSourceFiles(dir: string, base = ''): Record<string, string> {
    const entries: Record<string, string> = {};
    if (!existsSync(dir)) return entries;
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
    ...Object.fromEntries(Object.entries(srcEntries).map(([name, path]) => [`src/${name}`, path])),
};

export default defineConfig({
    plugins: [
        // Deepkit type compiler for runtime type reflection (needed for vite-node)
        deepkitType({
            tsConfig: resolve(workspaceRoot, 'tsconfig.json'),
            compilerOptions: {
                sourceMap: true,
            },
        }) as any,
        dts({
            outDir: ['build/cjs/src', 'build/esm/src'],
            include: ['src'],
            exclude: ['**/*.spec.ts', '**/*.test.ts'],
            tsconfigPath: resolve(__dirname, 'tsconfig.json'),
            entryRoot: 'src',
        }),
    ],
    // Resolve workspace packages to source directories (needed for vite-node during development)
    resolve: {
        alias: {
            '@mionkit/core': resolve(workspaceRoot, 'packages/core'),
            '@mionkit/run-types': resolve(workspaceRoot, 'packages/run-types'),
            '@mionkit/type-formats': resolve(workspaceRoot, 'packages/type-formats'),
            '@mionkit/router': resolve(workspaceRoot, 'packages/router'),
            '@mionkit/node': resolve(workspaceRoot, 'packages/node'),
            '@mionkit/client': resolve(workspaceRoot, 'packages/client'),
            '@mionkit/test-server': resolve(workspaceRoot, 'packages/test-server'),
            '@mionkit/http': resolve(workspaceRoot, 'packages/http'),
            '@mionkit/aws': resolve(workspaceRoot, 'packages/aws'),
            '@mionkit/gcloud': resolve(workspaceRoot, 'packages/gcloud'),
            '@mionkit/devtools': resolve(workspaceRoot, 'packages/devtools'),
            '@mionkit/bun': resolve(workspaceRoot, 'packages/bun'),
        },
    },
    build: {
        lib: {
            entry,
            formats: ['es', 'cjs'],
        },
        outDir: 'build',
        emptyOutDir: true,
        minify: false,
        rollupOptions: {
            output: [
                {
                    format: 'es',
                    dir: 'build/esm',
                    entryFileNames: '[name].js',
                    preserveModules: true,
                    preserveModulesRoot: '.',
                },
                {
                    format: 'cjs',
                    dir: 'build/cjs',
                    entryFileNames: '[name].js',
                    preserveModules: true,
                    preserveModulesRoot: '.',
                },
            ],
            external: [
                // Mark all node_modules as external
                /^[^./]/,
            ],
        },
    },
});
