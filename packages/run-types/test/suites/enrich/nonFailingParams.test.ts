import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NON_FAILING_PARAMS} from '../../../src/enrich/friendlyText.ts';

const ENRICH_GO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../ts-go-runtypes/internal/enrichment/enrich.go');

describe('NON_FAILING_PARAMS', () => {
  it('equals the Go nonFailingParams map, so the scaffold and the FriendlyText type agree', () => {
    const block = readFileSync(ENRICH_GO, 'utf8').match(/var nonFailingParams = map\[string\]bool\{([^}]*)\}/);
    expect(block, 'nonFailingParams map not found in enrich.go').not.toBeNull();
    const goKeys = [...block![1].matchAll(/"([^"]+)":\s*true/g)].map((match) => match[1]);
    expect(goKeys.length).toBeGreaterThan(0);
    expect([...NON_FAILING_PARAMS].sort()).toEqual(goKeys.sort());
  });
});
