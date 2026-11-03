/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {describe, expect, it} from 'vitest';
import {createDevRouterReset} from '../src/next/devRouterReset.ts';

const generate = (routerInitFiles: string[]) => ({outDir: '/app/.mion', batchesModule: '', routerInitFiles});
const ROUTER = `import {createMionRouter} from '@mionjs/router';\nexport const mion = createMionRouter();\n`;

describe('the next dev router reset', () => {
  it('opens the module that creates the router with a reset that keeps the batch table', () => {
    const reset = createDevRouterReset();
    reset.onGenerate(generate(['/app/src/router.ts']));
    const output = reset.rewriteOutput('/app/src/router.ts', ROUTER);
    expect(output.endsWith(ROUTER)).toBe(true);
    const added = output.slice(0, output.length - ROUTER.length);
    expect(added).toContain('__mionReset();');
    expect(added.indexOf('__mionBatchIds()')).toBeLessThan(added.indexOf('__mionReset();'));
    expect(added.indexOf('__mionRegisterBatches(__mionKept)')).toBeGreaterThan(added.indexOf('__mionReset();'));
    expect(output.split('\n').length).toBe(ROUTER.split('\n').length); // no source line moves
  });

  it('leaves every other module alone, and follows the latest generate', () => {
    const reset = createDevRouterReset();
    reset.onGenerate(generate(['/app/src/router.ts']));
    expect(reset.rewriteOutput('/app/src/routes.ts', ROUTER)).toBe(ROUTER);
    reset.onGenerate(generate(['/app/src/api.ts']));
    expect(reset.rewriteOutput('/app/src/router.ts', ROUTER)).toBe(ROUTER);
    expect(reset.rewriteOutput('/app/src/api.ts', ROUTER)).not.toBe(ROUTER);
  });

  it('never puts anything above a directive', () => {
    const reset = createDevRouterReset();
    reset.onGenerate(generate(['/app/src/router.ts']));
    const withDirective = `'use server';\n${ROUTER}`;
    expect(reset.rewriteOutput('/app/src/router.ts', withDirective)).toBe(withDirective);
  });
});
