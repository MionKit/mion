// Unit proof that the bundler-lane project knobs the option-parity work forwards
// reach the resolver child argv. The full path is PluginOptions -> ensureResolver
// -> ResolverClientOptions -> buildResolverArgs; this pins the wire (argv) layer.
// singleThreaded produces byte-identical output, so argv presence — not a
// generated-output diff — is the right assertion for it.
import {describe, expect, it} from 'vitest';
import {buildResolverArgs} from '../src/resolver-client.ts';

describe('buildResolverArgs — bundler-lane project knobs', () => {
  it('forwards hashLength as `--hash-length <n>`', () => {
    const args = buildResolverArgs('/proj', 'tsconfig.json', {hashLength: 12});
    const idx = args.indexOf('--hash-length');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('12');
  });

  it('forwards hashLength: 0 (valid — the binary reads 0 as the default 7)', () => {
    const args = buildResolverArgs('/proj', 'tsconfig.json', {hashLength: 0});
    const idx = args.indexOf('--hash-length');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('0');
  });

  it('omits --hash-length when hashLength is unset', () => {
    expect(buildResolverArgs('/proj', 'tsconfig.json', {})).not.toContain('--hash-length');
  });

  it('forwards patternSampleCount as `--pattern-sample-count <n>` (0 included — it disables generation)', () => {
    const args = buildResolverArgs('/proj', 'tsconfig.json', {patternSampleCount: 0});
    const idx = args.indexOf('--pattern-sample-count');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('0');
  });

  it('forwards patternSampleRetries as `--pattern-sample-retries <n>`', () => {
    const args = buildResolverArgs('/proj', 'tsconfig.json', {patternSampleRetries: 25});
    const idx = args.indexOf('--pattern-sample-retries');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('25');
  });

  it('omits both pattern-sample flags when unset (tsconfig / binary defaults apply)', () => {
    const args = buildResolverArgs('/proj', 'tsconfig.json', {});
    expect(args).not.toContain('--pattern-sample-count');
    expect(args).not.toContain('--pattern-sample-retries');
  });

  it('always passes --js-runtime, defaulting to this process execPath', () => {
    const args = buildResolverArgs('/proj', 'tsconfig.json', {});
    const idx = args.indexOf('--js-runtime');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe(process.execPath);
  });

  it('forwards an explicit jsRuntime over the execPath default', () => {
    const args = buildResolverArgs('/proj', 'tsconfig.json', {jsRuntime: '/opt/bun'});
    const idx = args.indexOf('--js-runtime');
    expect(args[idx + 1]).toBe('/opt/bun');
  });

  it('forwards singleThreaded:true as --single-threaded (not the opt-out)', () => {
    const args = buildResolverArgs('/proj', 'tsconfig.json', {singleThreaded: true});
    expect(args).toContain('--single-threaded');
    expect(args).not.toContain('--no-single-threaded');
  });

  it('forwards singleThreaded:false as --no-single-threaded (override over a tsconfig true)', () => {
    const args = buildResolverArgs('/proj', 'tsconfig.json', {singleThreaded: false});
    expect(args).toContain('--no-single-threaded');
    expect(args).not.toContain('--single-threaded');
  });

  it('omits both single-threaded flags when singleThreaded is unset', () => {
    const args = buildResolverArgs('/proj', 'tsconfig.json', {});
    expect(args).not.toContain('--single-threaded');
    expect(args).not.toContain('--no-single-threaded');
  });

  it('forwards numberMode as `--number-mode <value>`', () => {
    const args = buildResolverArgs('/proj', 'tsconfig.json', {numberMode: 'typeof'});
    const idx = args.indexOf('--number-mode');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('typeof');
  });

  it('omits --number-mode when numberMode is unset', () => {
    expect(buildResolverArgs('/proj', 'tsconfig.json', {})).not.toContain('--number-mode');
  });
});

describe('buildResolverArgs — session config the wire does not carry (enrich + output/transform)', () => {
  it('forwards genDir as `--gen-dir <abs>`', () => {
    const args = buildResolverArgs('/proj', 'tsconfig.json', {genDir: '/proj/generated'});
    const idx = args.indexOf('--gen-dir');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('/proj/generated');
  });

  it('forwards transformRelative as `--transform-relative`', () => {
    expect(buildResolverArgs('/proj', 'tsconfig.json', {transformRelative: true})).toContain('--transform-relative');
  });

  it('forwards omitSourcesContent as `--omit-sources-content`', () => {
    expect(buildResolverArgs('/proj', 'tsconfig.json', {omitSourcesContent: true})).toContain('--omit-sources-content');
  });

  it('forwards the enrich family + i18n selection as boolean flags', () => {
    const args = buildResolverArgs('/proj', 'tsconfig.json', {enrichFriendly: true, enrichMock: true, enrichI18n: true});
    expect(args).toContain('--enrich-friendly');
    expect(args).toContain('--enrich-mock');
    expect(args).toContain('--enrich-i18n');
  });

  it('forwards i18n overrides as `--enrich-locales a,b` + `--enrich-source-locale`', () => {
    const args = buildResolverArgs('/proj', 'tsconfig.json', {enrichLocales: ['pl', 'pt-BR'], enrichSourceLocale: 'en'});
    const locales = args.indexOf('--enrich-locales');
    expect(locales).toBeGreaterThanOrEqual(0);
    expect(args[locales + 1]).toBe('pl,pt-BR');
    const source = args.indexOf('--enrich-source-locale');
    expect(source).toBeGreaterThanOrEqual(0);
    expect(args[source + 1]).toBe('en');
  });

  it('omits every enrich/gen-dir flag when unset (tsconfig + inference own the defaults)', () => {
    const args = buildResolverArgs('/proj', 'tsconfig.json', {});
    for (const flag of [
      '--gen-dir',
      '--transform-relative',
      '--omit-sources-content',
      '--enrich-friendly',
      '--enrich-mock',
      '--enrich-i18n',
      '--enrich-locales',
      '--enrich-source-locale',
    ]) {
      expect(args).not.toContain(flag);
    }
  });

  it('omits --enrich-locales for an empty list (falls through to tsconfig i18n.locales)', () => {
    expect(buildResolverArgs('/proj', 'tsconfig.json', {enrichLocales: []})).not.toContain('--enrich-locales');
  });
});

describe('buildResolverArgs — serve subcommand + --sources', () => {
  it('uses the `serve` subcommand as args[0] and forwards --cwd (no legacy --one-shot)', () => {
    const args = buildResolverArgs('/proj', '', {});
    expect(args[0]).toBe('serve');
    expect(args).toContain('--cwd');
    expect(args).not.toContain('--one-shot');
  });

  it('maps serverMode to `--sources ops`', () => {
    const args = buildResolverArgs('/proj', '', {serverMode: true});
    const idx = args.indexOf('--sources');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('ops');
    expect(args).not.toContain('--inline-server');
  });

  it('maps inlineSources to `--sources stdin`', () => {
    const args = buildResolverArgs('/proj', '', {inlineSources: {'a.ts': 'export {}'}});
    const idx = args.indexOf('--sources');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('stdin');
    expect(args).not.toContain('--inline-sources-stdin');
  });

  it('omits --sources for the default project mode', () => {
    expect(buildResolverArgs('/proj', 'tsconfig.json', {})).not.toContain('--sources');
  });
});
