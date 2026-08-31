// The import map `mion drizzle-migrate` rewrites with
// (ts-go-runtypes/internal/drizzlemigrate/importmap.json) is GENERATED from
// drizzle-dialects.json plus the four manifests, and embedded in the shipped
// binary. That embedding is what makes it worth a test here: the generator's own
// --check catches drift between the map and the manifests, but nothing else
// catches the map disagreeing with the boundary the packages actually document.
//
// Two rules, both silent when broken. A migrated export that the slim package
// does not really export would make the translator emit an import of nothing; a
// skipped export that leaked into the map would move a name that has to stay on
// drizzle. Each gets its own case.
//
// Lives in this package for the same reason as drizzle-version-line.test.ts:
// scripts/ and ts-go-runtypes/ have no vitest project of their own.
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const IMPORT_MAP = join(REPO_ROOT, 'ts-go-runtypes/internal/drizzlemigrate/importmap.json');
const DIALECTS = join(REPO_ROOT, 'drizzle-dialects.json');

const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8'));

interface ImportMapModule {
  dialect: string;
  from: string;
  to: string;
  toDrizzle?: string;
  migrated: string[];
  alias?: Record<string, string>;
}

const importMap = readJson(IMPORT_MAP) as {drizzleOrm: string; modules: ImportMapModule[]};
const config = readJson(DIALECTS) as {
  dialects: {
    dialect: string;
    module: string;
    packageDir: string;
    manifest: string;
    noColumnBuilders?: boolean;
    migrateAlias?: Record<string, string>;
  }[];
};

function manifestEntries(dialect: (typeof config.dialects)[number]) {
  return readJson(join(REPO_ROOT, dialect.packageDir, dialect.manifest)).entries as {fn: string; status: string}[];
}

describe('drizzle-migrate import map', () => {
  it('covers every configured dialect, and nothing else', () => {
    expect(importMap.modules.map((module) => module.dialect).sort()).toEqual(
      config.dialects.map((dialect) => dialect.dialect).sort()
    );
  });

  it('moves exactly the manifests migrated entries', () => {
    for (const dialect of config.dialects) {
      const module = importMap.modules.find((entry) => entry.dialect === dialect.dialect)!;
      const migrated = manifestEntries(dialect)
        .filter((entry) => entry.status === 'migrated')
        .map((entry) => entry.fn)
        .sort();
      expect(module.migrated, `${dialect.dialect}: the map and the manifest disagree`).toEqual(migrated);
      expect(module.from).toBe(dialect.module);
    }
  });

  it('never moves a skipped entry', () => {
    for (const dialect of config.dialects) {
      const skipped = manifestEntries(dialect)
        .filter((entry) => entry.status === 'skipped')
        .map((entry) => entry.fn);
      const module = importMap.modules.find((entry) => entry.dialect === dialect.dialect)!;
      const leaked = skipped.filter((fn) => module.migrated.includes(fn));
      expect(leaked, `${dialect.dialect}: skipped exports must stay on drizzle`).toEqual([]);
    }
  });

  it('names the real package, and the toDrizzle subpath only where one exists', () => {
    for (const dialect of config.dialects) {
      const module = importMap.modules.find((entry) => entry.dialect === dialect.dialect)!;
      const pkg = readJson(join(REPO_ROOT, dialect.packageDir, 'package.json'));
      expect(module.to).toBe(pkg.name);
      // Only a dialect package materializes tables; the dialect-agnostic root
      // package carries the shared vocabulary and has no toDrizzle.
      if (dialect.noColumnBuilders) expect(module.toDrizzle ?? '').toBe('');
      else expect(module.toDrizzle).toBe(`${pkg.name}/drizzle`);
    }
  });

  it('carries the hand-owned aliases through unchanged', () => {
    for (const dialect of config.dialects) {
      const module = importMap.modules.find((entry) => entry.dialect === dialect.dialect)!;
      expect(module.alias ?? undefined).toEqual(dialect.migrateAlias ?? undefined);
    }
    // `sql` is the one name that needs an alias, and the reason is worth pinning:
    // drizzle's builds queries while ours records authoring sql, and drizzle's own
    // suites use both in one file.
    const root = importMap.modules.find((module) => module.from === 'drizzle-orm')!;
    expect(root.alias).toEqual({sql: 'rtSql'});
  });

  it('is generated for the drizzle-orm version the packages wrap', () => {
    for (const dialect of config.dialects) {
      const manifest = readJson(join(REPO_ROOT, dialect.packageDir, dialect.manifest));
      expect(importMap.drizzleOrm).toBe(manifest.drizzleOrm);
    }
  });
});
