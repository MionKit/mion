/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadUws, resolveUwsBinaryPath} from '../lib/index.js';

// Host triples that exist / don't exist in the pinned uWS tag. The injectable
// host argument drives every error path without faking process globals.
const supportedHost = {platform: 'linux', arch: 'x64', abi: '147', env: {}};

describe('resolveUwsBinaryPath error paths', () => {
  it('names the five supported platforms when the platform-arch pair is unsupported', () => {
    expect(() => resolveUwsBinaryPath({...supportedHost, arch: 'riscv64'})).toThrow(
      /linux-x64, linux-arm64, darwin-x64, darwin-arm64, win32-x64/
    );
  });

  it('names the supported Node majors when the ABI is unsupported', () => {
    // ABI 131 = Node 23, an odd major upstream never ships.
    expect(() => resolveUwsBinaryPath({...supportedHost, abi: '131'})).toThrow(/Node\.js 22, 24, 26/);
    expect(() => resolveUwsBinaryPath({...supportedHost, abi: '131'})).toThrow(/ABI 131/);
  });

  it('throws on a MION_UWS_BINARY_DIR that does not exist (never falls through)', () => {
    const env = {MION_UWS_BINARY_DIR: join(tmpdir(), 'mion-uws-nonexistent-dir')};
    expect(() => resolveUwsBinaryPath({...supportedHost, env})).toThrow(/does not exist/);
  });

  it('throws when MION_UWS_BINARY_DIR exists but lacks the expected binary', () => {
    const dir = join(tmpdir(), `mion-uws-empty-${process.pid}`);
    mkdirSync(dir, {recursive: true});
    try {
      expect(() => resolveUwsBinaryPath({...supportedHost, env: {MION_UWS_BINARY_DIR: dir}})).toThrow(
        /uws_linux_x64_147\.node does not exist/
      );
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('treats an empty MION_UWS_BINARY_DIR like an unset one', () => {
    const resolved = resolveUwsBinaryPath({env: {MION_UWS_BINARY_DIR: ''}});
    expect(resolved).toContain('.uws-cache');
  });
});

describe('resolveUwsBinaryPath resolution order', () => {
  it('MION_UWS_BINARY_DIR wins over the dev cache, even for an unsupported ABI (self-built escape hatch)', () => {
    const dir = join(tmpdir(), `mion-uws-override-${process.pid}`);
    mkdirSync(dir, {recursive: true});
    const fakeBinary = join(dir, 'uws_linux_x64_131.node');
    writeFileSync(fakeBinary, 'not a real addon');
    try {
      const resolved = resolveUwsBinaryPath({...supportedHost, abi: '131', env: {MION_UWS_BINARY_DIR: dir}});
      expect(resolved).toBe(fakeBinary);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('resolves the host binary from the dev cache in this repo', () => {
    const resolved = resolveUwsBinaryPath();
    expect(resolved).toMatch(/\.uws-cache[/\\]v\d+\.\d+\.\d+[/\\]uws_.+\.node$/);
  });
});

describe('loadUws', () => {
  it('loads the native module and exposes the server API', () => {
    const uws = loadUws();
    expect(typeof uws.App).toBe('function');
    expect(typeof uws.SSLApp).toBe('function');
    expect(typeof uws.us_listen_socket_close).toBe('function');
  });
});
