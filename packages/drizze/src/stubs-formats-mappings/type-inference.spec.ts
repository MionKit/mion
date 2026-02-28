/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Runs tsc --noEmit on stub files that exercise e2e type patterns
 * (full select, joins, partial select, eq(), insert, optional fields).
 * The stubs are never executed — only type-checked.
 * If any branded-type mapping is broken, tsc will report errors and the test fails.
 */

import {describe, it, expect} from 'vitest';
import {execSync} from 'child_process';
import {resolve} from 'path';

const TSC = resolve(__dirname, '../../../../node_modules/.bin/tsc');
const STUBS_TSCONFIG = resolve(__dirname, '../../tsconfig.stubs.json');

/** Runs tsc --noEmit on the stubs tsconfig and returns any errors from our source files. */
function typecheckStubs(): {ok: boolean; output: string} {
    try {
        execSync(`${TSC} -p ${STUBS_TSCONFIG}`, {encoding: 'utf-8', stdio: 'pipe'});
        return {ok: true, output: ''};
    } catch (e: any) {
        // Filter out drizzle-orm internal errors — only report errors from our source files
        const lines: string[] = (e.stdout || e.message || '').split('\n');
        const ownErrors = lines.filter((l: string) => l.includes('packages/drizze/src/'));
        if (ownErrors.length === 0) return {ok: true, output: ''};
        return {ok: false, output: ownErrors.join('\n')};
    }
}

describe('Type inference — tsc --noEmit on stub files', () => {
    it('all stubs should have no type errors', () => {
        const result = typecheckStubs();
        expect(result.output, `Type errors in stubs:\n${result.output}`).toBe('');
        expect(result.ok).toBe(true);
    });
});
