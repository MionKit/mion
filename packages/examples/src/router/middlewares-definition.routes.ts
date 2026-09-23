import {createMionRouter, Routes} from '@mionjs/router';
import {myApp, getSharedData} from './full-example.app.ts';

const mion = createMionRouter({contextDataFactory: getSharedData});

const routes = {
  logger: mion.middleware(
    async (ctx): Promise<void> => {
      // the error that ended the request, thrown or a returned FatalError
      const fatal = ctx.response.fatalError;
      if (fatal) await myApp.cloudLogs.error(ctx.path, fatal);
      else myApp.cloudLogs.log(ctx.path, ctx.shared.me.name);
    },
    // alwaysRun: the logger runs even after an error ended the request
    {alwaysRun: true}
  ),
  // ... other routes and middleware
} satisfies Routes;
