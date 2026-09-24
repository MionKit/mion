import {describe, expect, it} from 'vitest';
import {existsSync} from 'node:fs';
import {ZOOM, cliConfig, cliFailure, cliScript, parseShotArgs} from '../src/shoot.ts';

describe('code card: shot', () => {
  it('names or --all, plus --out and --browser', () => {
    expect(parseShotArgs(['a', 'b', '--out', 'dir', '--browser=/bin/chrome'])).toEqual({
      all: false,
      out: 'dir',
      browser: '/bin/chrome',
      cards: ['a', 'b'],
    });
    expect(parseShotArgs(['--all'])).toMatchObject({all: true, cards: []});
    expect(() => parseShotArgs([])).toThrow('usage: miondevx card shot');
    expect(() => parseShotArgs(['a', '--all'])).toThrow('not both');
    expect(() => parseShotArgs(['a', '--nope'])).toThrow(/Unknown option/);
  });

  it('asks playwright-cli for a sandbox-free chromium with a 2x viewport, and the given browser', () => {
    expect(ZOOM).toBe(2);
    expect(cliConfig()).toEqual({
      browser: {
        browserName: 'chromium',
        launchOptions: {headless: true, chromiumSandbox: false},
        contextOptions: {viewport: {width: 2400, height: 1600}},
      },
    });
    expect(cliConfig('/bin/chrome').browser.launchOptions).toEqual({
      headless: true,
      chromiumSandbox: false,
      executablePath: '/bin/chrome',
    });
  });

  it('keeps only the error lines of a playwright-cli failure', () => {
    const daemon =
      'session.js:167\n    const x = 1;\n\nError: Daemon pid=5940: Browser "chromium" is not installed.\n  daemonPid: 5940\n}';
    expect(cliFailure(daemon)).toBe('Browser "chromium" is not installed.');
    const report = '### Error\nError: ".stage" does not match any elements.';
    expect(cliFailure(report)).toBe('".stage" does not match any elements.');
    expect(cliFailure('  something else  ')).toBe('something else');
  });

  it('finds the root playwright-cli from the package', () => {
    expect(existsSync(cliScript())).toBe(true);
  });
});
