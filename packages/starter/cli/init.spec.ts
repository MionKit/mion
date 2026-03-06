import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {init} from './init.ts';
import {detectFramework} from './detect.ts';

const STARTERS_DIR = resolve(__dirname, '../../../starters/nextjs/mion-app');
const API_DIR = join(STARTERS_DIR, 'api');
const CATCH_ALL_DIR = join(STARTERS_DIR, 'app/api/[...mion]');

function readJson(filePath: string) {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
}

/** Backs up the original package.json and restores it after each test */
function cleanGeneratedFiles() {
    if (existsSync(API_DIR)) rmSync(API_DIR, {recursive: true, force: true});
    if (existsSync(CATCH_ALL_DIR)) rmSync(CATCH_ALL_DIR, {recursive: true, force: true});
}

describe('starter CLI init', () => {
    let originalPkg: string;

    beforeEach(() => {
        cleanGeneratedFiles();
        originalPkg = readFileSync(join(STARTERS_DIR, 'package.json'), 'utf-8');
    });

    afterEach(() => {
        cleanGeneratedFiles();
        // Restore original package.json
        writeFileSync(join(STARTERS_DIR, 'package.json'), originalPkg, 'utf-8');
    });

    describe('detectFramework', () => {
        it('should detect Next.js project', () => {
            const result = detectFramework(STARTERS_DIR);
            expect(result).not.toBeNull();
            expect(result!.framework).toBe('nextjs');
            expect(result!.name).toBe('mion-app');
            expect(result!.configFile).toBe('next.config.ts');
        });

        it('should return null for non-framework directory', () => {
            const result = detectFramework('/tmp');
            expect(result).toBeNull();
        });
    });

    describe('init — Vercel Serverless', () => {
        it('should scaffold mion API files into a Next.js project', async () => {
            await init(STARTERS_DIR, {deployTarget: 'vercel-serverless', basePath: '/api/mion'});

            // Verify api/ directory was created
            expect(existsSync(API_DIR)).toBe(true);

            // Verify api/package.json
            const apiPkg = readJson(join(API_DIR, 'package.json'));
            expect(apiPkg.name).toBe('@mion-app/api');
            expect(apiPkg.private).toBe(true);
            expect(apiPkg.type).toBe('module');
            expect(apiPkg.dependencies['@mionkit/core']).toBeDefined();
            expect(apiPkg.dependencies['@mionkit/router']).toBeDefined();
            expect(apiPkg.dependencies['@mionkit/platform-vercel']).toBeDefined();
            expect(apiPkg.devDependencies['@mionkit/platform-node']).toBeDefined();
            expect(apiPkg.devDependencies['@mionkit/devtools']).toBeDefined();

            // Verify api/tsconfig.json
            const apiTsConfig = readJson(join(API_DIR, 'tsconfig.json'));
            expect(apiTsConfig.reflection).toBe(true);
            expect(apiTsConfig.compilerOptions.target).toBe('ES2023');
            expect(apiTsConfig.compilerOptions.strict).toBe(true);

            // Verify api/vite.config.ts
            const viteConfig = readFileSync(join(API_DIR, 'vite.config.ts'), 'utf-8');
            expect(viteConfig).toContain("mionPlugin");
            expect(viteConfig).toContain("'tsconfig.json'");

            // Verify api/src/routes.ts
            const routes = readFileSync(join(API_DIR, 'src/routes.ts'), 'utf-8');
            expect(routes).toContain("initMionRouter");
            expect(routes).toContain("prefix: 'api/mion'");
            expect(routes).toContain("export type MyApi");

            // Verify api/src/server.ts (Vercel target)
            const server = readFileSync(join(API_DIR, 'src/server.ts'), 'utf-8');
            expect(server).toContain("createVercelHandler");
            expect(server).toContain("basePath: '/api/mion'");
            expect(server).toContain("startNodeServer");
            expect(server).toContain("process.env.NODE_ENV !== 'production'");

            // Verify catch-all route: app/api/[...mion]/route.ts
            const catchAll = readFileSync(join(CATCH_ALL_DIR, 'route.ts'), 'utf-8');
            expect(catchAll).toContain("export {GET, POST, PUT, DELETE, PATCH}");
            expect(catchAll).toContain("@mion-app/api/dist/server.js");

            // Verify root package.json was updated
            const rootPkg = readJson(join(STARTERS_DIR, 'package.json'));
            expect(rootPkg.workspaces).toContain('api');
            expect(rootPkg.scripts['mion:dev']).toContain('concurrently');
            expect(rootPkg.scripts['mion:build']).toContain('next build');
        });

        it('should fail if api/ directory already exists', async () => {
            // Run init once
            await init(STARTERS_DIR, {deployTarget: 'vercel-serverless', basePath: '/api/mion'});

            // Running again should throw
            await expect(init(STARTERS_DIR, {deployTarget: 'vercel-serverless', basePath: '/api/mion'})).rejects.toThrow(
                'api/ directory already exists',
            );
        });
    });

    describe('init — Standalone Node.js', () => {
        it('should scaffold with Node.js platform deps', async () => {
            await init(STARTERS_DIR, {deployTarget: 'standalone-node', basePath: '/api/mion'});

            const apiPkg = readJson(join(API_DIR, 'package.json'));
            expect(apiPkg.dependencies['@mionkit/platform-node']).toBeDefined();
            expect(apiPkg.dependencies['@mionkit/platform-vercel']).toBeUndefined();

            const server = readFileSync(join(API_DIR, 'src/server.ts'), 'utf-8');
            expect(server).toContain("startNodeServer");
            expect(server).not.toContain("createVercelHandler");

            // No catch-all route for standalone
            expect(existsSync(CATCH_ALL_DIR)).toBe(false);
        });
    });

    describe('init — Standalone Bun', () => {
        it('should scaffold with Bun platform deps', async () => {
            await init(STARTERS_DIR, {deployTarget: 'standalone-bun', basePath: '/api/mion'});

            const apiPkg = readJson(join(API_DIR, 'package.json'));
            expect(apiPkg.dependencies['@mionkit/platform-bun']).toBeDefined();
            expect(apiPkg.dependencies['@mionkit/platform-vercel']).toBeUndefined();

            const server = readFileSync(join(API_DIR, 'src/server.ts'), 'utf-8');
            expect(server).toContain("startBunServer");
        });
    });

    describe('init — custom base path', () => {
        it('should use custom base path in generated files', async () => {
            await init(STARTERS_DIR, {deployTarget: 'vercel-serverless', basePath: '/my-api/v2'});

            const routes = readFileSync(join(API_DIR, 'src/routes.ts'), 'utf-8');
            expect(routes).toContain("prefix: 'my-api/v2'");

            const server = readFileSync(join(API_DIR, 'src/server.ts'), 'utf-8');
            expect(server).toContain("basePath: '/my-api/v2'");
        });
    });
});
