/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The router's global headers reach the wire through the adapter's own defaults, with no middleware writing them.

import {describe, it, expect, beforeAll} from 'vitest';
import {createMionRouter, resetRouter} from '@mionjs/router';
import type {CallContext, Route} from '@mionjs/router';
import type {APIGatewayProxyEvent} from 'aws-lambda';
import {awsLambdaHandler, resetAwsLambdaOpts, setAwsLambdaOpts} from '../src/awsLambda.ts';

describe('aws global response headers', () => {
  const getSharedData = () => ({auth: {me: null as any}});
  const mion = createMionRouter({
    contextDataFactory: getSharedData,
    globalResponseHeaders: {'x-team': 'mion', 'x-app-name': 'TheRouter'},
  });
  const ping: Route = mion.route((ctx: CallContext): string => 'pong');

  beforeAll(() => {
    resetAwsLambdaOpts();
    resetRouter();
    setAwsLambdaOpts({defaultResponseHeaders: {'x-app-name': 'TheAdapter'}});
    mion.initRoutes({ping}, 'abc123');
  });

  it('ride every response, and the adapter still wins its own name', async () => {
    const context = {} as any;
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ping: []}),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/ping',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      // do not use context during test
      requestContext: context,
      resource: 'aws:apiGateway',
    };
    const headers = (await awsLambdaHandler(event, context)).headers || {};
    expect(headers['x-team']).toEqual('mion');
    expect(headers['x-build-version']).toEqual('abc123');
    expect(headers['x-app-name']).toEqual('TheAdapter');
  });
});
