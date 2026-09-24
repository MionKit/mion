// The resolver's Response JSON keys (Go MarshalJSON + its added-flag table) must match the TS Response mirror,
// or a renamed field silently reads as undefined on the TS side.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const REPO_ROOT = join(__dirname, '../../..');
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8');

function between(source: string, start: string, end: RegExp): string {
  const from = source.indexOf(start);
  expect(from, `missing ${start}`).toBeGreaterThanOrEqual(0);
  const rest = source.slice(from);
  const to = rest.search(end);
  expect(to, `no end after ${start}`).toBeGreaterThan(0);
  return rest.slice(0, to);
}

function goWireKeys(): string[] {
  const go = read('ts-go-runtypes/internal/protocol/protocol.go');
  const marshal = between(go, 'func (response Response) MarshalJSON()', /\n}\n/);
  const flags = between(go, 'var responseAddedFlags = ', /\n}\n/);
  const keys = new Set<string>();
  for (const match of marshal.matchAll(/out\["(\w+)"\]/g)) keys.add(match[1]);
  for (const match of flags.matchAll(/\{"(\w+)", func/g)) keys.add(match[1]);
  return [...keys].sort();
}

function tsInterfaceKeys(rel: string, name: string): string[] {
  const body = between(read(rel), `export interface ${name} {`, /\n}\n/);
  return [...body.matchAll(/^ {2}(\w+)\??:/gm)].map((match) => match[1]).sort();
}

describe('resolver Response keys: Go wire vs TS mirror', () => {
  it('protocol.ts Response names exactly the keys Go writes', () => {
    const goKeys = goWireKeys();
    expect(goKeys).toContain('addedRunTypes');
    expect(goKeys).toContain('sites');
    expect(tsInterfaceKeys('packages/devtools/src/core/protocol.ts', 'Response')).toEqual(goKeys);
  });

  it('every added* flag the resolver client exposes is a Go wire key', () => {
    const goKeys = new Set(goWireKeys());
    const clientFile = 'packages/devtools/src/core/resolver-client.ts';
    const clientKeys = ['ScanFilesResult', 'TransformFilesResult'].flatMap((name) => tsInterfaceKeys(clientFile, name));
    const addedKeys = clientKeys.filter((key) => key.startsWith('added'));
    expect(addedKeys.length).toBeGreaterThan(0);
    for (const key of addedKeys) expect(goKeys, key).toContain(key);
  });
});
