import {drizzle} from 'drizzle-orm/sqlite-proxy';
import {toDrizzle} from '@mionjs/drizzle-orm-sqlite-core/drizzle';
import {notes} from './sqlite.schema.ts';
import {answer} from './fakeDriver.ts';

export const notesDb = toDrizzle(notes);

export const db = drizzle(answer);
