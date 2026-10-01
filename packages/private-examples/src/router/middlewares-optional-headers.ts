import {createMionRouter} from '@mionjs/router';
import {HeadersSubset} from '@mionjs/core';

const mion = createMionRouter();

const traceWithOptionalAgent = mion.headersFn(
  async (
    ctx,
    {headers}: HeadersSubset<'X-Trace-Id', 'User-Agent'>
  ): Promise<void> => {
    const traceId = headers['X-Trace-Id']; // always present
    const userAgent = headers['User-Agent']; // may be undefined

    console.log(`Trace: ${traceId}, Agent: ${userAgent ?? 'unknown'}`);
  }
);

export {traceWithOptionalAgent};
