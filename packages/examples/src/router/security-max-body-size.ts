import {createMionRouter, Routes} from '@mionjs/router';
import * as TF from '@mionjs/run-types/formats';

interface Item {
  id: TF.String<{maxLength: 36}>;
  qty: number;
}

// The one router-wide knob: the slack applied to a limit derived from the types.
// A route whose types cannot say takes the platform adapter's `maxBodySize`
// (128 KB by default on every adapter).
const mion = createMionRouter({maxBodySizeFactor: 2});

const routes = {
  // Every param has a maximum, so the request limit is derived from the types:
  // a 36-char id and a list of at most 50 items, nothing bigger gets parsed.
  addItems: mion.route(
    (
      ctx,
      orderId: TF.String<{maxLength: 36}>,
      items: TF.FormattedArray<Item[], {maxItems: 50}>
    ): number => items.length
  ),

  // A plain string has no maximum, so this route takes the adapter's number.
  search: mion.route((ctx, text: string): number => text.length),

  // The route option wins over both the derived number and the adapter's number.
  upload: mion.route((ctx, payload: string): number => payload.length, {
    maxBodySize: 512_000,
  }),
} satisfies Routes;

mion.initRoutes(routes);
