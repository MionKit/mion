/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The per-request cost of bunRequestHandler with no socket, so a header change shows without the load generator.
// Run from packages/platform-bun: bun --conditions=source src/bunHttp.bench.ts

import {createMionRouter, CallContext} from '@mionjs/router';
import {bunRequestHandler, setBunHttpOpts} from './bunHttp.ts';

const mion = createMionRouter({alwaysAwait: false});
const hello = mion.route((): {hello: string} => ({hello: 'world'}));
const withHeader = mion.route((ctx: CallContext): {hello: string} => {
  ctx.response.headers.set('x-custom', 'yes');
  return {hello: 'world'};
});
setBunHttpOpts({port: 0});
mion.initRoutes({hello, withHeader});

const ITERATIONS = 300_000;
const ROUNDS = 5;

function measure(label: string, makeRequest: () => Request, handle: boolean): void {
  const times: number[] = [];
  for (let round = 0; round < ROUNDS; round++) {
    const start = Bun.nanoseconds();
    for (let i = 0; i < ITERATIONS; i++) {
      const req = makeRequest();
      if (handle) void bunRequestHandler(req);
    }
    times.push((Bun.nanoseconds() - start) / ITERATIONS);
  }
  times.sort((left, right) => left - right);
  console.log(`${label.padEnd(28)} median ${times[ROUNDS >> 1].toFixed(0)} ns/op  min ${times[0].toFixed(0)}`);
}

const helloRequest = () => new Request('http://localhost/hello');
const headerRequest = () => new Request('http://localhost/withHeader');

measure('new Request (control)', helloRequest, false);
measure('hello, no header written', helloRequest, true);
measure('handler writes a header', headerRequest, true);
