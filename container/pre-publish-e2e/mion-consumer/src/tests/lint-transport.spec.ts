/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Proves @mionjs/devtools' ESLint entry loads and its rules FIRE, out of the
// installed tarball. That entry is consumed compiled (node never sees the `source`
// condition), so a broken `build/` output would only ever surface here or in a
// consumer's project — never in the package's own tests, which import source.
const consumerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const eslintBin = resolve(consumerRoot, 'node_modules/.bin/eslint');

describe('mion eslint transport', () => {
    it('loads @mionjs/devtools/eslint from the published package and reports both caveats', () => {
        expect(existsSync(eslintBin), `eslint is not installed at ${eslintBin}`).toBe(true);
        const result = spawnSync(eslintBin, ['--config', 'lint/eslint.config.mjs', '--format', 'json', 'lint/caveat.routes.ts'], {
            cwd: consumerRoot,
            encoding: 'utf8',
        });
        const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
        // eslint exits 1 when it reports errors and 2 when it could not run at all —
        // a config/module-resolution failure must never read as a pass.
        expect(result.status, `eslint failed to run:\n${output.slice(0, 1200)}`).toBe(1);
        const messages = (JSON.parse(result.stdout) as {messages: {ruleId: string | null; messageId?: string}[]}[]).flatMap(
            (file) => file.messages
        );
        expect(messages.map((message) => message.ruleId), `no @mionjs rule fired:\n${output.slice(0, 1200)}`).toContain(
            '@mionjs/strong-typed-routes'
        );
        // The `*Router` variants: the rule reports those for a `mion.route()` / `mion.middleFn()`
        // call, and the plain ones only for a handler typed as Handler/HeaderHandler.
        expect(messages.map((message) => message.messageId)).toEqual(
            expect.arrayContaining(['missingReturnTypeRouter', 'missingParamTypesRouter'])
        );
    });
});
