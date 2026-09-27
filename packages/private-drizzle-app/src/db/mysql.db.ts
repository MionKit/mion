import {drizzle} from 'drizzle-orm/mysql-proxy';
import {toDrizzle} from '@mionjs/drizzle-orm-mysql-core/drizzle';
import {devices} from './mysql.schema.ts';
import {answer} from './fakeDriver.ts';

export const devicesDb = toDrizzle(devices);

export const db = drizzle(answer);
