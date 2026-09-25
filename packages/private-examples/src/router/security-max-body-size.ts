import {createMionRouter, Routes} from '@mionjs/router';
import * as TF from '@mionjs/run-types/formats';

interface Item {
  id: TF.String<{maxLength: 36}>;
  qty: number;
}

// the one router-wide knob: the slack applied to a limit derived from the types
const mion = createMionRouter({maxBodySizeFactor: 2});

const routes = {
  // every param has a maximum, so the limit is derived from the types
  addItems: mion.route(
    (
      ctx,
      orderId: TF.String<{maxLength: 36}>,
      items: TF.FormattedArray<Item[], {maxItems: 50}>
    ): number => items.length
  ),

  // a plain string has no maximum, so this route takes the adapter's number
  search: mion.route((ctx, text: string): number => text.length),

  // the route option wins over both
  upload: mion.route((ctx, payload: string): number => payload.length, {
    maxBodySize: 512_000,
  }),
} satisfies Routes;

mion.initRoutes(routes);
