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
//
// The `mion/*` rules are compiler-fed: a rule that reported nothing means the entry never reached the binary.
const consumerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const eslintBin = resolve(consumerRoot, 'node_modules/.bin/eslint');

describe('mion eslint transport', () => {
    it('loads @mionjs/devtools/eslint from the published package and reports every caveat', () => {
        expect(existsSync(eslintBin), `eslint is not installed at ${eslintBin}`).toBe(true);
        const result = spawnSync(eslintBin, ['--config', 'lint/eslint.config.mjs', '--format', 'json', 'lint/caveat.routes.ts'], {
            cwd: consumerRoot,
            encoding: 'utf8',
        });
        const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
        // eslint exits 1 when it reports errors and 2 when it could not run at all —
        // a config/module-resolution failure must never read as a pass.
        expect(result.status, `eslint failed to run:\n${output.slice(0, 1200)}`).toBe(1);
        const messages = (JSON.parse(result.stdout) as {messages: {ruleId: string | null; message: string}[]}[]).flatMap(
            (file) => file.messages
        );
        const ruleIds = messages.map((message) => message.ruleId);
        expect(ruleIds, `mion/runtime-error did not fire:\n${output.slice(0, 1200)}`).toContain('mion/runtime-error');
        // A compiler-fed rule reports a plain message carrying the stable code, not
        // an ESLint messageId, so the codes are what pin which finding fired.
        const codes = messages.flatMap((message) => message.message.match(/^\[(rpc-handler-[a-z0-9-]+)\]/)?.[1] ?? []);
        expect(codes, `expected every route code:\n${output.slice(0, 1200)}`).toEqual(
            expect.arrayContaining(['rpc-handler-missing-return-type', 'rpc-handler-missing-param-type', 'rpc-handler-throws', 'rpc-handler-returns-non-rpc-error'])
        );
    });
});
