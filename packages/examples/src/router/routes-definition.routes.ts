import {RpcError} from '@mionjs/core';
import {Routes, route} from '@mionjs/router';
import type {SomeData as Data} from './full-example.app.ts';
import {myDbService as db} from './full-example.app.ts';

export const routes = {
  sayHello: route((ctx, name1: string, name2: string): string => {
    return `Hello ${name1} and ${name2}.`;
  }),
  getSomeData: route(
    async (ctx, id: string): Promise<Data | RpcError<'data-not-found'>> => {
      const data = await db.getData(id);
      return (
        data ||
        new RpcError({publicMessage: 'Data not found', type: 'data-not-found'})
      );
    }
  ),
} satisfies Routes;
