// Pins the apiids lane's router and client stubs (apiIdsFuzz.ts) to the shipped build version declarations.
// A run-types test cannot import @mionjs/router or @mionjs/client (they depend on run-types), so it compares text.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {CLIENT_DTS, ROUTER_DTS} from './apiIdsFuzz.ts';

const PACKAGES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const compact = (text: string): string => text.replace(/\s+/g, '');
const shipped = (relative: string): string => compact(fs.readFileSync(path.join(PACKAGES, relative), 'utf8'));

const PINS = [
  {
    stub: ROUTER_DTS,
    file: 'rpc-router/src/types/publicMethods.ts',
    spelling: 'export type ApiBuildVersion<Version extends string> = {readonly [apiBuildVersion]?: Version};',
  },
  {stub: ROUTER_DTS, file: 'rpc-router/src/types/mionRouter.ts', spelling: 'const Version extends string = string>('},
  {
    stub: ROUTER_DTS,
    file: 'rpc-router/src/types/mionRouter.ts',
    spelling: 'buildVersion?: InjectBuildVersion<PublicApi<R>> & Version',
  },
  {stub: ROUTER_DTS, file: 'rpc-router/src/types/mionRouter.ts', spelling: '): PublicApi<R> & ApiBuildVersion<Version>;'},
  {stub: CLIENT_DTS, file: 'rpc-client/src/client.ts', spelling: 'buildVersion?: InjectBuildVersion<RM>'},
];

describe('fuzz / the apiids router and client stubs still spell the shipped build version declarations', () => {
  it.each(PINS)('$file declares `$spelling` as the stub does', ({stub, file, spelling}) => {
    expect(compact(stub)).toContain(compact(spelling));
    expect(shipped(file)).toContain(compact(spelling));
  });
});
