/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Large responses with multi-byte characters. Every other test in this package answers with ASCII
// or with a tiny body, so nothing else here would notice a response that lost or doubled bytes on
// the way out.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createMionRouter, resetRouter} from '@mionjs/router';
import {setUwsHttpOpts, resetUwsHttpOpts, startUwsServer, type UwsServer} from './uwsHttp.ts';
import type {Route} from '@mionjs/router';

describe('a large response', () => {
  const mion = createMionRouter();
  const port = 8391;
  let server: UwsServer;

  // ~700 KB of repeated multi-byte text, past the 512 KiB one socket read can deliver, with the
  // characters spread so any mishandled boundary lands inside one of them sooner or later
  const unit = 'héllo wörld 🌍 café ünïcödé 🎉 ';
  const bigText = unit.repeat(Math.ceil(700_000 / Buffer.byteLength(unit)));

  const echoBig: Route = mion.route((ctx, seed: string): string => seed + bigText, {maxBodySize: 100_000});
  const echoAscii: Route = mion.route((ctx, seed: string): string => seed + 'x'.repeat(700_000), {maxBodySize: 100_000});

  beforeAll(async () => {
    resetUwsHttpOpts();
    resetRouter();
    setUwsHttpOpts({port});
    mion.initRoutes({echoBig, echoAscii});
    server = await startUwsServer({port});
  });
  afterAll(() => {
    server.close();
    resetUwsHttpOpts();
  });

  const call = async (route: string, seed: string) => {
    const res = await fetch(`http://127.0.0.1:${port}/${route}`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({[route]: [seed]}),
    });
    return {status: res.status, body: (await res.json()) as Record<string, string>};
  };

  it('arrives whole, with every multi-byte character intact', async () => {
    const {status, body} = await call('echoBig', 'seed-');
    expect(status).toBe(200);
    expect(Buffer.byteLength(body.echoBig)).toBeGreaterThan(512 * 1024);
    expect(body.echoBig).toBe('seed-' + bigText);
  });

  it('never loses or repeats a byte', async () => {
    const {body} = await call('echoBig', 'x');
    // a mishandled boundary shows up as a replacement character, a short body, or a duplicated run
    expect(body.echoBig).not.toContain('�');
    expect(body.echoBig.length).toBe(1 + bigText.length);
  });

  it('answers an ascii body of the same size identically', async () => {
    const {body} = await call('echoAscii', 'a');
    expect(body.echoAscii).toBe('a' + 'x'.repeat(700_000));
  });

  it('several large responses in flight do not cross over', async () => {
    const seeds = ['one-', 'two-', 'three-'];
    const answers = await Promise.all(seeds.map((seed) => call('echoBig', seed)));
    answers.forEach((answer, i) => expect(answer.body.echoBig).toBe(seeds[i] + bigText));
  });
});
