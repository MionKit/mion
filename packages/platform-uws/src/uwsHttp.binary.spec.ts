/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createMionRouter, resetRouter, getRouteExecutionChain} from '@mionjs/router';
import {setUwsHttpOpts, resetUwsHttpOpts, startUwsServer, type UwsServer} from './uwsHttp.ts';
import type {CallContext, Route} from '@mionjs/router';
import {serializeBinaryBody, deserializeBinaryBody, getBufferPoolStats} from '@mionjs/core';

// The load-bearing question for this adapter's binary mode: uWS' end() must copy the payload into
// its own send buffer SYNCHRONOUSLY (also under backpressure), because the adapter hands the pooled
// buffer back immediately after the corked reply. If uWS retained a view instead, a reused buffer
// would corrupt in-flight responses — exactly what the concurrent large-payload test below would
// catch as failed deserialization or wrong dates.

describe('uws http router with serializer=binary', () => {
  type DataPoint = {date: Date};
  type BigPayload = {points: DataPoint[]};
  type MySharedData = ReturnType<typeof getSharedData>;
  type Context = CallContext<MySharedData>;
  const getSharedData = () => ({auth: {me: null as any}});
  const mion = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/', serializer: 'binary'});

  const getDate: Route = mion.route((context: Context, dataPoint?: DataPoint): DataPoint => {
    return dataPoint || {date: new Date('2022-04-22T00:17:00.000Z')};
  });

  // Big enough that the serialized response spans many kilobytes and several concurrent responses
  // are in flight at once — the reuse-under-load case that exposes a premature buffer release.
  const bigDate = new Date('2022-04-22T00:17:00.000Z');
  const getManyDates: Route = mion.route((context: Context, count: number): BigPayload => {
    return {points: Array.from({length: count}, () => ({date: bigDate}))};
  });

  let server: UwsServer;
  const port = 8092;

  beforeAll(async () => {
    resetUwsHttpOpts();
    setUwsHttpOpts({port});
    server = await startUwsServer();
    resetRouter();
    await mion.initRoutes({getDate, getManyDates});
  });

  afterAll(() => {
    if (server) server.close();
  });

  it('should send binary request and receive binary response with Date objects', async () => {
    const executionChain = getRouteExecutionChain('/api/getDate')!.methods;
    const requestBody = {getDate: [{date: new Date('2022-04-22T00:17:00.000Z')}]};
    const requestBuffer = serializeBinaryBody('/api/getDate', executionChain, requestBody, false).serializer.getBuffer();

    const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
      method: 'POST',
      headers: {'content-type': 'application/octet-stream'},
      body: Buffer.from(requestBuffer),
    });
    const headers = Object.fromEntries(response.headers.entries());
    const responseBuffer = await response.arrayBuffer();
    const {body: responseBody} = deserializeBinaryBody('/api/getDate', responseBuffer, true);

    expect(responseBody.getDate).toBeDefined();
    expect(responseBody.getDate.date).toEqual(new Date('2022-04-22T00:17:00.000Z'));
    expect(headers['content-type']).toEqual('application/octet-stream');
    expect(headers['server']).toEqual('@mionjs');
  });

  it('should handle optional parameters in binary mode', async () => {
    const executionChain = getRouteExecutionChain('/api/getDate')!.methods;
    const requestBody = {getDate: [undefined]};
    const requestBuffer = serializeBinaryBody('/api/getDate', executionChain, requestBody, false).serializer.getBuffer();

    const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
      method: 'POST',
      headers: {'content-type': 'application/octet-stream'},
      body: Buffer.from(requestBuffer),
    });
    const responseBuffer = await response.arrayBuffer();
    const {body: responseBody} = deserializeBinaryBody('/api/getDate', responseBuffer, true);

    expect(responseBody.getDate).toBeDefined();
    expect(responseBody.getDate.date).toEqual(new Date('2022-04-22T00:17:00.000Z'));
  });

  // End-to-end proof of the release-immediately-after-end() lifetime this adapter relies on.
  // Small responses first warm the pool, then concurrent LARGE responses hammer buffer reuse; any
  // premature release shows up as corrupted payloads (deserialization throws or dates mismatch).
  it('reuses pooled binary buffers across concurrent large responses without corruption', async () => {
    const executionChain = getRouteExecutionChain('/api/getManyDates')!.methods;
    const count = 5000;
    const requestBuffer = serializeBinaryBody(
      '/api/getManyDates',
      executionChain,
      {getManyDates: [count]},
      false
    ).serializer.getBuffer();

    const call = async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/getManyDates`, {
        method: 'POST',
        headers: {'content-type': 'application/octet-stream'},
        body: Buffer.from(requestBuffer),
      });
      const {body} = deserializeBinaryBody('/api/getManyDates', await response.arrayBuffer(), true);
      return body.getManyDates.points;
    };

    // warm the route past the pool threshold, then hammer it concurrently
    for (let i = 0; i < 10; i++) {
      const points = await call();
      expect(points).toHaveLength(count);
      expect(points[count - 1].date).toEqual(bigDate);
    }
    const concurrent = await Promise.all(Array.from({length: 25}, () => call()));
    for (const points of concurrent) {
      expect(points).toHaveLength(count);
      expect(points[0].date).toEqual(bigDate);
      expect(points[count - 1].date).toEqual(bigDate);
    }

    // and the pool was genuinely in play (buffers reused, then returned), not silently disabled
    const stats = getBufferPoolStats();
    expect(stats.hits).toBeGreaterThan(0);
    expect(stats.held).toBeGreaterThan(0);
  });
});
