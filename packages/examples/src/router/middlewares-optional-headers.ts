import {createMionRouter} from '@mionjs/router';
import {HeadersSubset} from '@mionjs/core';

const mion = createMionRouter();

const authWithOptionalAgent = mion.headersFn(
  async (
    ctx,
    {headers}: HeadersSubset<'Authorization', 'User-Agent'>
  ): Promise<void> => {
    const token = headers.Authorization; // always present
    const userAgent = headers['User-Agent']; // may be undefined

    console.log(`Token: ${token}, Agent: ${userAgent ?? 'unknown'}`);
  }
);

export {authWithOptionalAgent};
