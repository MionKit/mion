/* eslint-disable @mionjs/strong-typed-routes -- this file is the inferred-return side of the comparison */
import {mion} from './mion.ts';
import {db, devicesDb} from '../db/mysql.db.ts';
import type {NewDevice} from '../db/mysql.schema.ts';

export const mysqlRoutes = {
  // case: selectAll
  listDevices: mion.route(async () => db.select().from(devicesDb)),

  // case: insertReturningId
  addDevice: mion.route(async (_ctx, device: NewDevice) => {
    const [ids] = await db.insert(devicesDb).values(device).$returningId();
    return ids;
  }),
};
