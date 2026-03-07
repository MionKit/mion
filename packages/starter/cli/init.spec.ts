import {describe, it, expect, beforeAll, beforeEach, afterAll, afterEach} from 'vitest';
import {existsSync, readFileSync, rmSync, cpSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execSync} from 'node:child_process';
import {init} from './init.ts';
import {detectFramework} from './detect.ts';
import {STARTER_DEFAULTS} from './starterDefaults.ts';

const STARTER_SRC = resolve(__dirname, '../../../starters/nextjs-16/mion-app');
const NEXT_VERSION = '16.1.6';

function readJson(filePath: string) {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
}

describe('starter app integrity', () => {
    it('should have all expected api files', () => {
        expect(existsSync(join(STARTER_SRC, 'api/src/api.ts'))).toBe(true);
        expect(existsSync(join(STARTER_SRC, 'api/src/handlers/orders.ts'))).toBe(true);
        expect(existsSync(join(STARTER_SRC, 'api/src/vercel-serverless.ts'))).toBe(true);
        expect(existsSync(join(STARTER_SRC, 'api/src/server.node.ts'))).toBe(true);
        expect(existsSync(join(STARTER_SRC, 'api/src/server.bun.ts'))).toBe(true);
        expect(existsSync(join(STARTER_SRC, 'api/tsconfig.json'))).toBe(true);
        expect(existsSync(join(STARTER_SRC, 'api/vite.config.ts'))).toBe(true);
        expect(existsSync(join(STARTER_SRC, 'app/api/[...mion]/route.ts'))).toBe(true);
        expect(existsSync(join(STARTER_SRC, 'app/orders/page.tsx'))).toBe(true);
    });

    it('should test against the latest Next.js major version', () => {
        const latestVersion = execSync('npm view next version', {encoding: 'utf-8'}).trim();
        const latestMajor = parseInt(latestVersion.split('.')[0], 10);
        const testedMajor = parseInt(NEXT_VERSION.split('.')[0], 10);
        expect(
            testedMajor,
            `Next.js ${latestMajor} is out but tests use ${NEXT_VERSION}. Update NEXT_VERSION and starters/nextjs-${testedMajor}/`
        ).toBe(latestMajor);
    });

    it('starter defaults should match actual file content', () => {
        const api = readFileSync(join(STARTER_SRC, 'api/src/api.ts'), 'utf-8');
        expect(api).toContain(`prefix: '${STARTER_DEFAULTS.PREFIX}'`);

        const serverlessServer = readFileSync(join(STARTER_SRC, 'api/src/vercel-serverless.ts'), 'utf-8');
        expect(serverlessServer).toContain(`basePath: '${STARTER_DEFAULTS.BASE_PATH}'`);

        const catchAll = readFileSync(join(STARTER_SRC, 'app/api/[...mion]/route.ts'), 'utf-8');
        expect(catchAll).toContain(STARTER_DEFAULTS.API_WORKSPACE);

        const viteConfig = readFileSync(join(STARTER_SRC, 'api/vite.config.ts'), 'utf-8');
        expect(viteConfig).toContain(STARTER_DEFAULTS.SERVER_ENTRY);

        const ordersPage = readFileSync(join(STARTER_SRC, 'app/orders/page.tsx'), 'utf-8');
        expect(ordersPage).toContain(`prefix: '${STARTER_DEFAULTS.PREFIX}'`);
        expect(ordersPage).toContain(STARTER_DEFAULTS.API_WORKSPACE);
    });
});

describe('starter CLI init', () => {
    let baseDir: string;
    let testDir: string;

    beforeAll(() => {
        baseDir = join(tmpdir(), `mion-app`);
        if (existsSync(baseDir)) rmSync(baseDir, {recursive: true, force: true});
        execSync(
            `npx create-next-app@${NEXT_VERSION} ${baseDir} --ts --tailwind --eslint --app --no-src-dir --use-npm --skip-install --yes --disable-git`,
            {stdio: 'pipe'}
        );
    });

    afterAll(() => {
        rmSync(baseDir, {recursive: true, force: true});
    });

    beforeEach(() => {
        testDir = join(tmpdir(), `mion-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        cpSync(baseDir, testDir, {recursive: true});
    });

    afterEach(() => {
        rmSync(testDir, {recursive: true, force: true});
    });

    describe('detectFramework', () => {
        it('should detect Next.js project', () => {
            const result = detectFramework(testDir);
            expect(result).not.toBeNull();
            expect(result!.framework).toBe('nextjs');
            expect(result!.name).toBe('mion-app');
            expect(result!.configFile).toBe('next.config.ts');
        });

        it('should return null for non-framework directory', () => {
            const result = detectFramework(tmpdir());
            expect(result).toBeNull();
        });
    });

    describe('init — Vercel Serverless', () => {
        it('should scaffold mion API files into a Next.js project', async () => {
            await init(testDir, {deployTarget: 'vercel-serverless', basePath: '/api/mion'});

            const apiDir = join(testDir, 'api');
            const catchAllDir = join(testDir, 'app/api/[...mion]');

            // Verify api/ directory was created
            expect(existsSync(apiDir)).toBe(true);

            // Verify api/package.json
            const apiPkg = readJson(join(apiDir, 'package.json'));
            expect(apiPkg.name).toBe('@mion-app/api');
            expect(apiPkg.private).toBe(true);
            expect(apiPkg.type).toBe('module');
            expect(apiPkg.dependencies['@mionkit/core']).toBeDefined();
            expect(apiPkg.dependencies['@mionkit/router']).toBeDefined();
            expect(apiPkg.dependencies['@mionkit/platform-vercel']).toBeDefined();
            expect(apiPkg.devDependencies['@mionkit/platform-node']).toBeDefined();
            expect(apiPkg.devDependencies['@mionkit/devtools']).toBeDefined();

            // Verify api/tsconfig.json
            const apiTsConfig = readJson(join(apiDir, 'tsconfig.json'));
            expect(apiTsConfig.reflection).toBe(true);
            expect(apiTsConfig.compilerOptions.target).toBe('ES2023');
            expect(apiTsConfig.compilerOptions.strict).toBe(true);

            // Verify api/vite.config.ts (entry should be server.ts, not server.serverless.ts)
            const viteConfig = readFileSync(join(apiDir, 'vite.config.ts'), 'utf-8');
            expect(viteConfig).toContain('mionPlugin');
            expect(viteConfig).toContain("'tsconfig.json'");
            expect(viteConfig).toContain('server.ts');
            expect(viteConfig).not.toContain('server.serverless.ts');

            // Verify api/src/api.ts
            const api = readFileSync(join(apiDir, 'src/api.ts'), 'utf-8');
            expect(api).toContain('initMionRouter');
            expect(api).toContain("prefix: 'api/mion'");
            expect(api).toContain('export type MyApi');

            // Verify api/src/server.ts (Vercel target)
            const server = readFileSync(join(apiDir, 'src/server.ts'), 'utf-8');
            expect(server).toContain('createVercelHandler');
            expect(server).toContain("basePath: '/api/mion'");
            expect(server).toContain('startNodeServer');
            expect(server).toContain("process.env.NODE_ENV !== 'production'");

            // Verify catch-all route: app/api/[...mion]/route.ts
            const catchAll = readFileSync(join(catchAllDir, 'route.ts'), 'utf-8');
            expect(catchAll).toContain('export {GET, POST, PUT, DELETE, PATCH}');
            expect(catchAll).toContain('@mion-app/api/dist/server.js');

            // Verify root package.json was updated
            const rootPkg = readJson(join(testDir, 'package.json'));
            expect(rootPkg.workspaces).toContain('api');
            expect(rootPkg.dependencies['@mionkit/client']).toBeDefined();
            expect(rootPkg.scripts['mion:dev']).toContain('concurrently');
            expect(rootPkg.scripts['mion:build']).toContain('next build');
        });

        it('should fail if api/ directory already exists', async () => {
            await init(testDir, {deployTarget: 'vercel-serverless', basePath: '/api/mion'});

            await expect(init(testDir, {deployTarget: 'vercel-serverless', basePath: '/api/mion'})).rejects.toThrow(
                'api/ directory already exists'
            );
        });
    });

    describe('init — Standalone Node.js', () => {
        it('should scaffold with Node.js platform deps', async () => {
            await init(testDir, {deployTarget: 'standalone-node', basePath: '/api/mion'});

            const apiDir = join(testDir, 'api');
            const apiPkg = readJson(join(apiDir, 'package.json'));
            expect(apiPkg.dependencies['@mionkit/platform-node']).toBeDefined();
            expect(apiPkg.dependencies['@mionkit/platform-vercel']).toBeUndefined();

            const server = readFileSync(join(apiDir, 'src/server.ts'), 'utf-8');
            expect(server).toContain('startNodeServer');
            expect(server).not.toContain('createVercelHandler');

            // No catch-all route for standalone
            expect(existsSync(join(testDir, 'app/api/[...mion]'))).toBe(false);
        });
    });

    describe('init — Standalone Bun', () => {
        it('should scaffold with Bun platform deps', async () => {
            await init(testDir, {deployTarget: 'standalone-bun', basePath: '/api/mion'});

            const apiDir = join(testDir, 'api');
            const apiPkg = readJson(join(apiDir, 'package.json'));
            expect(apiPkg.dependencies['@mionkit/platform-bun']).toBeDefined();
            expect(apiPkg.dependencies['@mionkit/platform-vercel']).toBeUndefined();

            const server = readFileSync(join(apiDir, 'src/server.ts'), 'utf-8');
            expect(server).toContain('startBunServer');
        });
    });

    describe('init — custom base path', () => {
        it('should use custom base path in generated files', async () => {
            await init(testDir, {deployTarget: 'vercel-serverless', basePath: '/my-api/v2'});

            const apiDir = join(testDir, 'api');
            const api = readFileSync(join(apiDir, 'src/api.ts'), 'utf-8');
            expect(api).toContain("prefix: 'my-api/v2'");

            const server = readFileSync(join(apiDir, 'src/server.ts'), 'utf-8');
            expect(server).toContain("basePath: '/my-api/v2'");
        });
    });

    describe('init — with example', () => {
        it('should scaffold example routes and orders page when withExample is set', async () => {
            await init(testDir, {deployTarget: 'vercel-serverless', basePath: '/api/mion', withExample: true});

            const apiDir = join(testDir, 'api');

            // Verify api.ts imports orders handler
            const api = readFileSync(join(apiDir, 'src/api.ts'), 'utf-8');
            expect(api).toContain('ordersRoutes');
            expect(api).toContain("prefix: 'api/mion'");

            // Verify handlers/orders.ts has Order types and routes
            const orders = readFileSync(join(apiDir, 'src/handlers/orders.ts'), 'utf-8');
            expect(orders).toContain('OrderId');
            expect(orders).toContain('OrderEvent');
            expect(orders).toContain('listOrders');
            expect(orders).toContain('getOrderEvents');

            // Verify orders page was created and uses mion client
            expect(existsSync(join(testDir, 'app/orders/page.tsx'))).toBe(true);
            const ordersPage = readFileSync(join(testDir, 'app/orders/page.tsx'), 'utf-8');
            expect(ordersPage).toContain('OrdersPage');
            expect(ordersPage).toContain('initClient');
            expect(ordersPage).toContain('@mion-app/api');
            expect(ordersPage).toContain("prefix: 'api/mion'");
        });

        it('should not include example files when withExample is not set', async () => {
            await init(testDir, {deployTarget: 'vercel-serverless', basePath: '/api/mion'});

            const apiDir = join(testDir, 'api');

            // Verify minimal api was used (no Order types, no handlers)
            const api = readFileSync(join(apiDir, 'src/api.ts'), 'utf-8');
            expect(api).not.toContain('OrderId');
            expect(api).not.toContain('ordersRoutes');
            expect(api).toContain('hello');

            // Verify handlers and orders page were NOT created
            expect(existsSync(join(apiDir, 'src/handlers'))).toBe(false);
            expect(existsSync(join(testDir, 'app/orders/page.tsx'))).toBe(false);
        });
    });
});
